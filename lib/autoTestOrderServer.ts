// lib/autoTestOrderServer.ts
// [2026-11-13 사장님 「라이브 중 자동 테스트 주문」] 실행·잠금·삭제.
//   - 켜져 있고 방송(ON) 중이면 5~10분 랜덤 간격으로 한 번. 여러 화면·cron 이 겹쳐도 settings 한 줄 값 비교(CAS)로 한 번만.
//   - 주문은 손님과 같은 주소로 보낸다: /api/cart-reservations(담기) → /api/customer-orders/submit(제출). 가짜 저장 경로 없음.
//   - 저장 뒤 DB 를 다시 읽어 보낸 줄과 맞는지 확인하고 결과 한 줄만 남긴다(별도 기록 화면 없음).
//   - 삭제는 «자동 테스트 주문서»만(is_test_order=true + test_order_reason 자동 테스트, 주문서 줄 전부가 그럴 때만).
import { randomBytes, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fallbackChatLine, makeChatLines, type ChatProduct, type StreamMode } from "@/lib/autoTestChat";
import { AUTO_TEST_AI_DAILY_CAP, AUTO_TEST_AI_PAUSE_MS, aiQuotaDay } from "@/lib/autoTestOrder";
import { tickTestViewers } from "@/lib/autoTestViewers";
import { AUTO_TEST_NICKNAME_POOL, numberedNicknameCandidates, pickNicknameCandidates } from "@/lib/autoTestNicknames";
import {
  AUTO_TEST_AVATAR, AUTO_TEST_KAKAO_ID, AUTO_TEST_KEY, AUTO_TEST_NAME, AUTO_TEST_PHONE, AUTO_TEST_REASON,
  AUTO_TEST_ORDERED_SINCE, AUTO_TEST_EXCLUDE, SCREEN_HOST_FRESH_MS, cardHasTarget, isTestOrderChatLine, pendingGapMs, buildOrderRows, filterTestChoices, choosePayment, isAutoTestRow, nicknameCandidates, parseAutoTestState, pickOrderLines, productChoices, randomGapMs, verifySavedRows,
  type AutoTestChoice, type AutoTestLast, type AutoTestPending, type AutoTestPick, type AutoTestSettings, type AutoTestState,
} from "@/lib/autoTestOrder";
import { computeWidgetFeatured } from "@/lib/widgetFeaturedServer";
import { rotationIndex } from "@/lib/widgetRotationClock";

type Db = SupabaseClient;
type Row = Record<string, unknown>;
const LOCK_MS = 90_000;

async function readStateRaw(sb: Db): Promise<{ raw: string | null; state: AutoTestState }> {
  const { data } = await sb.from("settings").select("value").eq("key", AUTO_TEST_KEY).maybeSingle();
  const raw = data ? String((data as Row).value ?? "") : null;
  return { raw, state: parseAutoTestState(raw) };
}

/** 값이 그대로일 때만 바꿈 — 다른 실행이 먼저 바꿨으면 false */
async function casState(sb: Db, raw: string | null, next: AutoTestState): Promise<boolean> {
  const value = JSON.stringify(next);
  if (raw === null) {
    const { error } = await sb.from("settings").insert({ key: AUTO_TEST_KEY, value });
    return !error;
  }
  const { data, error } = await sb.from("settings").update({ value }).eq("key", AUTO_TEST_KEY).eq("value", raw).select("key");
  return !error && Array.isArray(data) && data.length > 0;
}

/** 결과만 기록(잠금 풀기) — 다른 사람이 그사이 켬/끔을 바꿨어도 그 값은 지킨다 */
async function finish(sb: Db, last: AutoTestLast, patch: Partial<AutoTestState> = {}): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    const { raw, state } = await readStateRaw(sb);
    if (await casState(sb, raw, { ...state, ...patch, lockUntil: 0, last })) return;
  }
}

// ── [2026-11-13 14:02 사장님] 상품 카드 기준 질문 → 1~2분 뒤 같은 상품 주문 ──
type CardNow = { productId: string; detailName: string; targets: Array<{ productId: string; detailName: string }> };

/** 지금 채팅창 「지금 소개하는 상품」 카드 — 위젯·손님 카드와 같은 함수·같은 시계. 카드가 꺼졌거나 없으면 null */
async function currentCard(bcId: string, now = Date.now()): Promise<CardNow | null> {
  try {
    const st = await computeWidgetFeatured(bcId);
    if (!st.enabled || st.siteCardOff || !st.targets.length) return null;
    const t = st.targets[st.pinned ? 0 : rotationIndex(st.config, st.targets.length, now)];
    return t ? { productId: String(t.productId), detailName: String(t.detailName || ""), targets: st.targets } : null;
  } catch { return null; }
}

/** 카드 상품을 테스트로 주문할 수 있는 옵션들(재고 무제한·샘플할인 제외 등 기존 안전 규칙 그대로) */
async function cardChoices(sb: Db, productId: string, detailName: string, overseasOn: boolean): Promise<AutoTestChoice[]> {
  if (!/^\d+$/.test(productId)) return [];
  const { data } = await sb.from("products").select("*").eq("id", Number(productId)).maybeSingle();
  if (!data) return [];
  return productChoices(data as Row, overseasOn)
    .filter((c) => (!detailName || c.productName === detailName) && !AUTO_TEST_EXCLUDE.some((w) => c.productName.includes(w)));
}

/** 닉네임 새로 정하고 테스트 회원에 적용 */
async function useFreshNickname(sb: Db): Promise<string> {
  await ensureTestCustomer(sb);
  const nickname = await freshNickname(sb);
  const { error } = await sb.from("customers").update({ youtube_nickname: nickname, last_login_at: new Date().toISOString() }).eq("kakao_id", AUTO_TEST_KAKAO_ID);
  if (error) throw new Error(`닉네임 바꾸기 실패: ${error.message}`);
  return nickname;
}

/** [2026-11-13 14:15 사장님 「무료 한도 안에서, 넘으면 채팅만 멈춤」] Gemini 호출을 세고 지킴.
 *  - 하루(미국 서부 날짜 = 무료 한도 새로 채워지는 기준) 150회까지, 한도 초과(429)면 30분 채팅만 쉼 → null(채팅 안 올림). 주문은 그대로. */
async function aiChatLines(sb: Db, input: Parameters<typeof makeChatLines>[0]): Promise<{ before: string; after: string } | null> {
  const now = Date.now();
  const day = aiQuotaDay(now);
  const { state } = await readStateRaw(sb);
  const used = state.aiDay === day ? state.aiCount : 0;
  if (state.aiPausedUntil > now || used >= AUTO_TEST_AI_DAILY_CAP) return null;
  const cl = await makeChatLines(input);
  for (let i = 0; i < 4; i += 1) {
    const cur = await readStateRaw(sb);
    const n = cur.state.aiDay === day ? cur.state.aiCount : 0;
    if (await casState(sb, cur.raw, { ...cur.state, aiDay: day, aiCount: n + 1, aiPausedUntil: cl.limited ? now + AUTO_TEST_AI_PAUSE_MS : cur.state.aiPausedUntil })) break;
  }
  return cl.limited ? null : { before: cl.before, after: cl.after };
}

type Step =
  | { kind: "asked"; pending: AutoTestPending; last: AutoTestLast }
  | { kind: "cancelled"; last: AutoTestLast }
  | { kind: "order"; fixed: { choices: AutoTestChoice[]; nickname: string; productName: string; after: string } | null; greet: boolean };

/** 이번 차례에 할 일 — 채팅 켜짐이면: ①주문 대기 중인 질문이 있으면 그 상품이 카드에 아직 있는지 보고 주문/취소
 *  ②없으면 지금 카드 상품으로 질문만 올리고 1~2분 뒤로 미룸 ③카드가 없으면 상품 질문 없이(인사만) 보통 주문 */
async function decideStep(sb: Db, origin: string, bc: Row, state: AutoTestState): Promise<Step> {
  const bcId = String(bc.id ?? "");
  const at = Date.now();
  if (!state.chatEnabled) return { kind: "order", fixed: null, greet: false };
  const { overseasOn } = await readSettings(sb);
  const p = state.pending && state.pending.bcId === bcId ? state.pending : null;
  if (p) {
    const card = await currentCard(bcId);
    const choices = card && cardHasTarget(card.targets, p.productId, p.detailName) ? await cardChoices(sb, p.productId, p.detailName, overseasOn) : [];
    if (!choices.length) return { kind: "cancelled", last: { at, ok: true, message: `[질문] 상품 카드가 바뀌어 ${p.productName} 주문은 취소 — 다음엔 새 카드 상품으로`, nickname: p.nickname } };
    const { error } = await sb.from("customers").update({ youtube_nickname: p.nickname }).eq("kakao_id", AUTO_TEST_KAKAO_ID);
    if (error) throw new Error(`닉네임 맞추기 실패: ${error.message}`);
    return { kind: "order", fixed: { choices, nickname: p.nickname, productName: p.productName, after: p.after || "" }, greet: false };
  }
  const card = await currentCard(bcId);
  const choices = card ? await cardChoices(sb, card.productId, card.detailName, overseasOn) : [];
  if (!card || !choices.length) return { kind: "order", fixed: null, greet: true };
  const productName = choices[0].productName;
  const nickname = await useFreshNickname(sb);
  const product = await chatProductOf(sb, card.productId, productName, overseasOn);
  // 질문·주문 뒤 한 줄을 한 번에 만듦(Gemini 1회) — 주문 뒤 한 줄은 pending 에 넣어 두고 1~2분 뒤 씀
  const cl = await aiChatLines(sb, { nickname, mode: await streamModeOf(sb, bc), product, withOrder: true });
  if (!cl) return { kind: "order", fixed: null, greet: false }; // AI 한도 — 채팅 없이 주문만
  const r = await postTestChat(origin, bcId, cl.before);
  const now = Date.now();
  const pending: AutoTestPending = { bcId, nickname, productId: card.productId, detailName: card.detailName, productName, askedAt: now, dueAt: now + pendingGapMs(), after: cl.after };
  return { kind: "asked", pending, last: { at, ok: r.ok, message: r.ok ? `[질문] ${nickname}: ${cl.before} — ${productName} · 1~2분 뒤 같은 상품 주문` : `[질문] 채팅 실패 — ${r.message}`, nickname } };
}

export async function readAutoTestState(sb: Db): Promise<AutoTestState> {
  return (await readStateRaw(sb)).state;
}

/** 관리자 화면(화면 테스트 담당)의 신호 — 30초에 한 번 남짓. 상태를 돌려준다 */
export async function screenHostBeat(sb: Db): Promise<AutoTestState> {
  for (let i = 0; i < 3; i += 1) {
    const { raw, state } = await readStateRaw(sb);
    if (!state.enabled) return state;
    const next = { ...state, screenSeenAt: Date.now() };
    if (await casState(sb, raw, next)) return next;
  }
  return (await readStateRaw(sb)).state;
}

export async function setAutoTestChatEnabled(sb: Db, on: boolean): Promise<AutoTestState> {
  for (let i = 0; i < 4; i += 1) {
    const { raw, state } = await readStateRaw(sb);
    const next: AutoTestState = { ...state, chatEnabled: on, nextRunAt: on && state.nextRunAt === null ? Date.now() + randomGapMs() : state.nextRunAt };
    if (await casState(sb, raw, next)) return next;
  }
  throw new Error("저장이 겹쳤어요. 다시 눌러 주세요.");
}

export async function setAutoTestPublic(sb: Db, on: boolean): Promise<AutoTestState> {
  for (let i = 0; i < 4; i += 1) {
    const { raw, state } = await readStateRaw(sb);
    const next: AutoTestState = { ...state, publicTest: on };
    if (await casState(sb, raw, next)) return next;
  }
  throw new Error("저장이 겹쳤어요. 다시 눌러 주세요.");
}

/** 유튜브 라이브가 지금 진행 중인지 — 1분 기록기가 적는 동시 시청자 수가 최근(3분 안)에 있으면 진행 중 */
export async function isYoutubeLiveNow(sb: Db, bcId: string): Promise<boolean> {
  try {
    const { data } = await sb.from("settings").select("value").eq("key", "live_viewers_now").maybeSingle();
    const v = JSON.parse(String((data as Row | null)?.value ?? "{}")) as { bc?: string; v?: number | null; t?: string };
    const t = Date.parse(String(v.t ?? ""));
    return String(v.bc ?? "") === bcId && v.v != null && Number.isFinite(t) && Date.now() - t < 180_000;
  } catch { return false; }
}

/** 방송 상태 — 서버 값으로만 정함(AI 추측 금지). 잠시 쉬는 중(paused_at) > 유튜브 실시간 송출 여부 > 다시보기 */
export async function streamModeOf(sb: Db, bc: Row): Promise<StreamMode> {
  const paused = String(bc.paused_at ?? "");
  const pausedAt = paused ? Date.parse(paused) : NaN;
  const startedAt = bc.started_at ? Date.parse(String(bc.started_at)) : 0;
  if (String(bc.status ?? "").toUpperCase() === "ON" && Number.isFinite(pausedAt) && pausedAt >= (Number.isFinite(startedAt) ? startedAt : 0)) return "paused";
  return (await isYoutubeLiveNow(sb, String(bc.id ?? ""))) ? "live" : "replay";
}

/** 테스트 계정으로 사이트 채팅 한 줄 — 손님과 같은 채팅 주소로(닉네임은 회원 표의 지금 닉네임) */
export async function postTestChat(origin: string, bcId: string, body: string): Promise<{ ok: boolean; message: string }> {
  const text = String(body || "").trim();
  if (!text) return { ok: false, message: "빈 글" };
  try {
    const r = await postJson(`${origin}/api/live-chat`, { kakao_id: AUTO_TEST_KAKAO_ID, bc: bcId, body: text });
    return r.json?.ok === true ? { ok: true, message: text } : { ok: false, message: String(r.json?.message ?? r.status) };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "채팅 실패" }; }
}

/** 채팅 문장에 쓸 상품 정보(첫 상품) */
async function chatProductOf(sb: Db, productId: string, productName: string, overseasOn: boolean): Promise<ChatProduct | null> {
  try {
    const { data } = await sb.from("products").select("*").eq("id", Number(productId)).maybeSingle();
    const row = data as Row | null;
    if (!row) return null;
    const ch = productChoices(row, overseasOn).filter((c) => c.productName === productName);
    const colors = [...new Set(ch.map((c) => c.color).filter((c) => c && c !== "없음"))];
    const sizes = [...new Set(ch.map((c) => c.size).filter(Boolean))];
    let note: Row = {};
    try { note = typeof row.product_note === "string" ? JSON.parse(row.product_note) : ((row.product_note as Row) || {}); } catch { note = {}; }
    const cats = ((note.brand_group as Row | undefined)?.detail_categories as Record<string, unknown> | undefined) || {};
    const category = String(cats[productName] ?? row.category ?? row.product_category ?? "").trim();
    return { name: productName, category, price: ch[0]?.unitPrice ?? Math.floor(Number(row.price) || 0), colors, sizes };
  } catch { return null; }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const between = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

/** 채팅만(주문 꺼짐·채팅 켜짐) — 새 닉네임으로 한 줄 */
async function chatOnce(sb: Db, origin: string, bc: Row): Promise<AutoTestLast> {
  const at = Date.now();
  try {
    const bcId = String(bc.id ?? "");
    const { s: _settings, overseasOn } = await readSettings(sb);
    void _settings;
    await ensureTestCustomer(sb);
    const nickname = await freshNickname(sb);
    const { error } = await sb.from("customers").update({ youtube_nickname: nickname, last_login_at: new Date().toISOString() }).eq("kakao_id", AUTO_TEST_KAKAO_ID);
    if (error) throw new Error(`닉네임 바꾸기 실패: ${error.message}`);
    // 상품 질문은 지금 채팅창 상품 카드의 상품만 — 카드가 없으면 인사만
    let product: ChatProduct | null = null;
    const card = await currentCard(bcId);
    if (card) {
      const ch = await cardChoices(sb, card.productId, card.detailName, overseasOn);
      if (ch.length) product = await chatProductOf(sb, card.productId, ch[0].productName, overseasOn);
    }
    const mode = await streamModeOf(sb, bc);
    // 카드 상품이 없으면 준비된 인사(Gemini 안 씀), 있을 때만 Gemini
    const lines = product ? await aiChatLines(sb, { nickname, mode, product, withOrder: false }) : { before: fallbackChatLine("before", mode, null), after: "" };
    if (!lines) return { at, ok: true, message: "[채팅] AI 무료 한도 보호로 채팅 쉬는 중 — 주문 테스트는 그대로", nickname };
    const r = await postTestChat(origin, bcId, lines.before);
    return { at, ok: r.ok, message: `[채팅] ${nickname}: ${r.ok ? lines.before : `실패 — ${r.message}`}`, nickname };
  } catch (e) {
    return { at, ok: false, message: `[채팅] ${e instanceof Error ? e.message : "실패"}` };
  }
}

export async function setAutoTestEnabled(sb: Db, enabled: boolean): Promise<AutoTestState> {
  for (let i = 0; i < 4; i += 1) {
    const { raw, state } = await readStateRaw(sb);
    const next: AutoTestState = { ...state, enabled, nextRunAt: enabled ? Date.now() + randomGapMs() : null };
    if (await casState(sb, raw, next)) return next;
  }
  throw new Error("저장이 겹쳤어요. 다시 눌러 주세요.");
}

async function onBroadcast(sb: Db): Promise<Row | null> {
  const { data } = await sb.from("broadcasts").select("*").eq("status", "ON").neq("is_deleted", true).order("started_at", { ascending: false }).limit(1).maybeSingle();
  return (data as Row | null) ?? null;
}

/** 1분 cron — 켜짐 + 방송 중 + 시간이 됐을 때만 실행 */
export async function autoTestTick(sb: Db, origin: string): Promise<{ ran: boolean; reason: string; last?: AutoTestLast }> {
  const { raw, state } = await readStateRaw(sb);
  const on = state.enabled || state.chatEnabled;
  // 가상 테스트 시청자(관리자·채팅뷰어에만 보임) — 켜짐+방송 중이면 1분마다 들어오고 나감, 아니면 비움
  const bcForViewers = on ? await onBroadcast(sb) : null;
  try { await tickTestViewers(sb, String(bcForViewers?.id ?? ""), on && Boolean(bcForViewers)); } catch { /* 시청자 흉내 실패는 무시 */ }
  if (!on) return { ran: false, reason: "off" };
  const now = Date.now();
  if (state.lockUntil > now) return { ran: false, reason: "running" };
  const bc = bcForViewers;
  if (!bc) {
    // 방송 종료 동안은 쉰다 — 다시 켜지면 그때부터 5~10분 뒤
    if (state.nextRunAt !== null) await casState(sb, raw, { ...state, nextRunAt: null });
    return { ran: false, reason: "no-broadcast" };
  }
  if (state.nextRunAt === null) {
    await casState(sb, raw, { ...state, nextRunAt: now + randomGapMs() });
    return { ran: false, reason: "scheduled" };
  }
  if (now < state.nextRunAt) return { ran: false, reason: "waiting" };
  // 관리자 화면이 열려 있으면 화면 테스트가 같은 일정으로 돈다 — 서버는 쉼(겹치기 방지). 채팅만일 땐 서버가 함.
  if ((state.enabled || state.pending) && now - state.screenSeenAt < SCREEN_HOST_FRESH_MS) return { ran: false, reason: "screen-host" };
  if (!(await casState(sb, raw, { ...state, lockUntil: now + LOCK_MS, nextRunAt: now + randomGapMs(), pending: null }))) return { ran: false, reason: "lost-lock" };
  if (!state.enabled && !state.pending) { const last = await chatOnce(sb, origin, bc); await finish(sb, last); return { ran: true, reason: "ran", last }; }
  const out = await runStep(sb, origin, bc, state);
  await finish(sb, out.last, out.patch);
  return { ran: true, reason: "ran", last: out.last };
}

/** 관리자 「지금 테스트」 — 켬/끔과 무관, 방송 중일 때만, 다른 실행과 겹치지 않게 */
export async function autoTestRunNow(sb: Db, origin: string): Promise<AutoTestLast> {
  const { raw, state } = await readStateRaw(sb);
  const now = Date.now();
  if (state.lockUntil > now) return { at: now, ok: false, message: "다른 테스트가 진행 중이에요. 잠시 뒤 다시 눌러 주세요." };
  const bc = await onBroadcast(sb);
  if (!bc) return { at: now, ok: false, message: "방송 중일 때만 테스트할 수 있어요." };
  if (!(await casState(sb, raw, { ...state, lockUntil: now + LOCK_MS, pending: null }))) return { at: now, ok: false, message: "다른 테스트가 진행 중이에요. 잠시 뒤 다시 눌러 주세요." };
  const out = await runStep(sb, origin, bc, state);
  await finish(sb, out.last, out.patch);
  return out.last;
}

async function num(sb: Db, key: string, fallback: number): Promise<number> {
  const { data, error } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  if (error || !data) return fallback;
  const n = Number(String((data as Row).value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

async function readSettings(sb: Db): Promise<{ s: AutoTestSettings; overseasOn: boolean }> {
  const [normal, remote, vendor, vendorRemote, overseas, overseasRemote, cardRate, actualRate, cardMin] = await Promise.all([
    num(sb, "default_shipping_fee", 4000), num(sb, "remote_area_shipping_fee", 6000),
    num(sb, "vendor_shipping_fee", 4000), num(sb, "vendor_remote_area_shipping_fee", 7000),
    num(sb, "overseas_shipping_fee", 0), num(sb, "overseas_remote_area_shipping_fee", 0),
    num(sb, "customer_card_extra_rate", 10), num(sb, "actual_card_fee_rate", 7), num(sb, "card_payment_min_amount", 100000),
  ]);
  const overseasFee = Math.max(0, overseas);
  return {
    overseasOn: overseasFee > 0,
    s: {
      shipping: { normalFee: Math.max(0, normal), normalRemoteFee: Math.max(0, remote), vendorFee: Math.max(0, vendor), vendorRemoteFee: Math.max(0, vendorRemote), overseasFee, overseasRemoteFee: Math.max(0, overseasRemote) },
      customerCardRate: Math.min(20, Math.max(0, cardRate)),
      actualCardRate: Math.min(20, Math.max(0, actualRate)),
      cardMinAmount: Math.max(0, Math.round(cardMin)),
    },
  };
}

/** 자동 테스트 전용 회원(없으면 만듦). 방송 알림은 꺼 둔 채로. */
async function ensureTestCustomer(sb: Db): Promise<string> {
  const { data } = await sb.from("customers").select("id").eq("kakao_id", AUTO_TEST_KAKAO_ID).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (data && (data as Row).id) return String((data as Row).id);
  const nowIso = new Date().toISOString();
  const { data: ins, error } = await sb.from("customers").insert({
    youtube_nickname: "", customer_name: AUTO_TEST_NAME, customer_phone: AUTO_TEST_PHONE,
    zipcode: "00000", address: "자동 테스트 주소", detail_address: "자동 테스트",
    kakao_id: AUTO_TEST_KAKAO_ID, kakao_nickname: AUTO_TEST_NAME, first_login_at: nowIso, last_login_at: nowIso,
    live_alert_optin: false, live_alert_optin_at: nowIso, live_alert_optin_source: "auto_test_account",
  }).select("id").limit(1);
  if (error) throw new Error(`테스트 회원 만들기 실패: ${error.message}`);
  return String((ins as Row[] | null)?.[0]?.id ?? "");
}

/** 화면 방식은 손님 화면이 주문을 만든다 — 이 번호를 운영자 테스트 계정으로 등록해 두면 화면이 «테스트 주문»으로 제출한다 */
async function ensureOperatorTestAccount(sb: Db): Promise<void> {
  const { data } = await sb.from("operator_test_accounts").select("customer_phone, is_active").eq("customer_phone", AUTO_TEST_PHONE).maybeSingle();
  if (data && (data as Row).is_active === true) return;
  const row = {
    customer_phone: AUTO_TEST_PHONE, display_label: "자동 테스트", is_active: true,
    allow_point_test: false, allow_amount_test: false,
    exclude_from_settlement: true, exclude_from_payment_match: true, exclude_from_shipping: true, exclude_from_picking: true,
  };
  const { error } = data
    ? await sb.from("operator_test_accounts").update(row).eq("customer_phone", AUTO_TEST_PHONE)
    : await sb.from("operator_test_accounts").insert(row);
  if (error) throw new Error(`테스트 계정 등록 실패: ${error.message}`);
}

async function freshNickname(sb: Db): Promise<string> {
  // 목록 전체를 랜덤으로 섞어 한 번에 확인 → 안 쓴 것 중 맨 앞(=랜덤). 다 쓰면 숫자 붙인 이름으로.
  const rounds = [pickNicknameCandidates(AUTO_TEST_NICKNAME_POOL.length), numberedNicknameCandidates(40), nicknameCandidates(40)];
  for (const cands of rounds) {
    const used = new Set<string>();
    for (let i = 0; i < cands.length; i += 100) {
      const part = cands.slice(i, i + 100);
      const [c, o] = await Promise.all([
        sb.from("customers").select("youtube_nickname").in("youtube_nickname", part),
        sb.from("orders").select("youtube_nickname").in("youtube_nickname", part),
      ]);
      if (c.error || o.error) throw new Error("닉네임 중복 확인 실패");
      for (const r of [...(c.data ?? []), ...(o.data ?? [])]) used.add(String((r as Row).youtube_nickname ?? "").trim().toLowerCase());
    }
    const free = cands.find((n) => !used.has(n.toLowerCase()));
    if (free) return free;
  }
  throw new Error("겹치지 않는 닉네임을 못 찾았어요");
}

async function postJson(url: string, body: unknown): Promise<{ status: number; json: Row | null }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) as Row | null;
  return { status: res.status, json };
}

type Prepared = { lines: AutoTestPick[]; paymentMethod: "무통장입금" | "카드결제"; nickname: string; settings: AutoTestSettings } | { skip: string };

/** 상품·옵션·수량·결제·새 닉네임 정하기 + 테스트 회원 닉네임 바꾸기(서버·화면 방식 공통) */
async function prepareRun(sb: Db, bc: Row, fixed: { choices: AutoTestChoice[]; nickname: string } | null = null): Promise<Prepared> {
    if (fixed) {
      // 질문했던 그 상품 하나·같은 닉네임(옵션·수량만 랜덤)
      const { s: settings } = await readSettings(sb);
      const lines = pickOrderLines(fixed.choices);
      return { lines, paymentMethod: choosePayment(lines, settings), nickname: fixed.nickname, settings };
    }
    const bcId = String(bc.id ?? "");
    // 1. 지금 방송 상품
    const { data: bp, error: bpErr } = await sb.from("broadcast_products").select("product_id").eq("broadcast_id", bcId).limit(2000);
    if (bpErr) throw new Error(`방송 상품 읽기 실패: ${bpErr.message}`);
    const ids = [...new Set(((bp ?? []) as Row[]).map((r) => String(r.product_id ?? "").trim()).filter((x) => /^\d+$/.test(x)))];
    const products: Row[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await sb.from("products").select("*").in("id", ids.slice(i, i + 200).map(Number));
      if (error) throw new Error(`상품 읽기 실패: ${error.message}`);
      products.push(...((data ?? []) as Row[]));
    }
    const { s: settings, overseasOn } = await readSettings(sb);
    const all = products.flatMap((p) => productChoices(p, overseasOn));
    // 11/6 이후 실제 주문이 있었던 상품 이름(테스트·삭제 주문 제외)
    const names = [...new Set(all.map((c) => c.productName))];
    const orderedNames = new Set<string>();
    for (let i = 0; i < names.length; i += 100) {
      const { data, error } = await sb.from("orders").select("product_name").in("product_name", names.slice(i, i + 100))
        .gte("created_at", new Date(AUTO_TEST_ORDERED_SINCE).toISOString()).neq("is_test_order", true).neq("is_deleted", true).limit(5000);
      if (error) throw new Error(`주문 이력 읽기 실패: ${error.message}`);
      for (const r of (data ?? []) as Row[]) orderedNames.add(String(r.product_name ?? "").trim());
    }
    const choices = filterTestChoices(all, orderedNames);
    if (!choices.length) return { skip: "건너뜀 — 지금 방송에 테스트할 상품(11/6 이후 주문 있었던 재고 무제한 상품)이 없어요." };
    const lines = pickOrderLines(choices);
    const paymentMethod = choosePayment(lines, settings);

    // 2. 새 닉네임 → 테스트 회원 닉네임 바꿈
    await ensureTestCustomer(sb);
    const nickname = await freshNickname(sb);
    const { error: nickErr } = await sb.from("customers").update({ youtube_nickname: nickname, last_login_at: new Date().toISOString() }).eq("kakao_id", AUTO_TEST_KAKAO_ID);
    if (nickErr) throw new Error(`닉네임 바꾸기 실패: ${nickErr.message}`);
    return { lines, paymentMethod, nickname, settings };
}

const lineText = (lines: AutoTestPick[]) => lines.map((l) => {
  const opt = [l.color, l.size].filter((x) => x && x !== "없음").join("/");
  return `${l.productName}${opt ? ` ${opt}` : ""} ×${l.qty}`;
}).join(", ");

/** 한 차례 실행(서버 방식) — 질문만 / 취소 / 주문. finish 에 넘길 상태 조각도 돌려줌 */
async function runStep(sb: Db, origin: string, bc: Row, state: AutoTestState): Promise<{ last: AutoTestLast; patch: Partial<AutoTestState> }> {
  try {
    const step = await decideStep(sb, origin, bc, state);
    if (step.kind === "asked") return { last: step.last, patch: { pending: step.pending, nextRunAt: step.pending.dueAt } };
    if (step.kind === "cancelled") return { last: step.last, patch: { pending: null, nextRunAt: Date.now() } };
    return { last: await runOnce(sb, origin, bc, state.chatEnabled, step), patch: { pending: null } };
  } catch (e) {
    return { last: { at: Date.now(), ok: false, message: e instanceof Error ? e.message : "테스트 실패" }, patch: { pending: null } };
  }
}

async function runOnce(sb: Db, origin: string, bc: Row, withChat = false, step: Extract<Step, { kind: "order" }> = { kind: "order", fixed: null, greet: false }): Promise<AutoTestLast> {
  const at = Date.now();
  try {
    const bcId = String(bc.id ?? "");
    const prep = await prepareRun(sb, bc, step.fixed);
    if ("skip" in prep) return { at, ok: true, message: prep.skip };
    const { lines, paymentMethod, nickname, settings } = prep;
    // 채팅 켜짐: 질문은 1~2분 전에 이미 올림(fixed) / 카드가 없으면 상품 질문 없이 인사 한 줄 → 잠깐 기다림
    let chatAfter = "";
    if (withChat && step.fixed) chatAfter = step.fixed.after; // 질문 때 같이 만들어 둔 한 줄(추가 AI 호출 없음)
    else if (withChat && step.greet) {
      // [2026-11-13] 인사·주문 뒤 한 줄은 준비된 문장(Gemini 안 씀 — 무료 한도는 카드 상품 질문에만)
      const mode = await streamModeOf(sb, bc);
      chatAfter = fallbackChatLine("after", mode, null); await postTestChat(origin, bcId, fallbackChatLine("before", mode, null)); await wait(between(6_000, 12_000));
    }

    // 3. 장바구니 담기(손님과 같은 주소) — 테스트마다 새 장바구니
    const sessionKey = `autotest-${randomBytes(8).toString("hex")}`;
    const hold = await postJson(`${origin}/api/cart-reservations`, {
      action: "sync", sessionKey, phone: AUTO_TEST_PHONE, nickname, customerName: AUTO_TEST_NAME, kakaoId: AUTO_TEST_KAKAO_ID,
      items: lines.map((l) => ({ productId: l.productId, productName: l.productName, color: l.color, size: l.size, qty: l.qty, unitPrice: l.unitPrice, cartSeq: -1 })),
    });
    const holdResults = Array.isArray(hold.json?.results) ? (hold.json!.results as Row[]) : [];
    if (hold.status !== 200 || hold.json?.ok !== true || holdResults.some((r) => r.ok !== true)) {
      const bad = holdResults.find((r) => r.ok !== true);
      throw new Error(`장바구니 담기 실패: ${String(hold.json?.error ?? "")}${bad ? ` (${String(bad.productName ?? bad.productId)} ${String(bad.color ?? "")}/${String(bad.size ?? "")})` : ""}`.trim());
    }

    // 4. 주문서 제출(손님과 같은 주소)
    const groupId = randomUUID();
    const lookupCode = `RURU-${Date.now().toString(36).toUpperCase()}`;
    const title = String(bc.broadcast_public_title || bc.public_title || "현재 방송");
    const orderRows = buildOrderRows({
      lines, paymentMethod, nickname, groupId, lookupCode,
      broadcast: { id: bcId, title, subtitle: String(bc.broadcast_admin_subtitle || bc.admin_subtitle || "") },
      settings,
    });
    const submit = await postJson(`${origin}/api/customer-orders/submit`, {
      orderRows, point_use_amount: 0, customer_phone: AUTO_TEST_PHONE, youtube_nickname: nickname, customer_name: AUTO_TEST_NAME,
      cart_session_key: sessionKey, recipient_name: AUTO_TEST_NAME, recipient_phone: AUTO_TEST_PHONE,
      kakao_id: AUTO_TEST_KAKAO_ID, purchase_consent_accepted: true,
    });
    if (submit.status !== 200 || submit.json?.ok !== true) throw new Error(`주문서 제출 실패: ${String(submit.json?.message ?? submit.json?.error ?? submit.status)}`);

    // 5. DB 에 실제로 저장됐는지 확인
    const { data: saved, error: savedErr } = await sb.from("orders").select("id, product_id, product_name, color, size, qty, youtube_nickname, payment_method, is_test_order").eq("order_group_id", groupId);
    if (savedErr) throw new Error(`저장 확인 실패: ${savedErr.message}`);
    const problems = verifySavedRows(orderRows, (saved ?? []) as Row[]);
    const summary = `${nickname} · ${paymentMethod === "카드결제" ? "카드" : "무통장"} · ${lineText(lines)}`;
    if (problems.length) return { at, ok: false, message: `저장 내용이 달라요 — ${problems.join(" · ")} (${summary})`, orderCode: lookupCode, nickname };
    if (chatAfter) { await wait(between(8_000, 15_000)); if ((await readAutoTestState(sb)).chatEnabled) await postTestChat(origin, bcId, chatAfter); }
    return { at, ok: true, message: `주문서 제출 확인 — ${summary}`, orderCode: lookupCode, nickname };
  } catch (e) {
    return { at, ok: false, message: e instanceof Error ? e.message : "테스트 실패" };
  }
}

/** 자동 테스트 주문서 영구 삭제 — groupIds 없으면 전부. 일반 주문이 하나라도 섞인 주문서는 건너뜀. */
export async function deleteAutoTestOrders(sb: Db, groupIds: string[] | null): Promise<{ deleted: number; groups: number; skipped: string[] }> {
  const data = await readAutoTestRows(sb, groupIds);
  const groups = [...new Set(data.map((r) => String(r.order_group_id ?? "")).filter(Boolean))];
  const skipped: string[] = [];
  if (groupIds) for (const g of groupIds) if (!groups.includes(g)) skipped.push(g);
  let deleted = 0, done = 0;
  for (let i = 0; i < groups.length; i += 100) {
    const batch = groups.slice(i, i + 100);
    // 주문서의 «모든» 줄 다시 읽기 — 하나라도 자동 테스트가 아니면 그 주문서는 손대지 않음
    const { data: all, error: allErr } = await sb.from("orders").select("id, order_group_id, is_test_order, test_order_reason, operator_test_phone, youtube_nickname, broadcast_id").in("order_group_id", batch);
    if (allErr) throw new Error(allErr.message);
    const rows = (all ?? []) as Row[];
    const bad = new Set(rows.filter((r) => !isAutoTestRow(r)).map((r) => String(r.order_group_id)));
    const okRows = rows.filter((r) => !bad.has(String(r.order_group_id)));
    // 재고 기록이 있는 줄(재고가 실제로 빠진 주문)은 일반 삭제로 — 여기선 건너뜀
    const ids = okRows.map((r) => Number(r.id));
    const { data: led } = ids.length ? await sb.from("inventory_ledger").select("order_id").in("order_id", ids) : { data: [] };
    const ledgerOrders = new Set(((led ?? []) as Row[]).map((r) => String(r.order_id)));
    const ledgerGroups = new Set(okRows.filter((r) => ledgerOrders.has(String(r.id))).map((r) => String(r.order_group_id)));
    for (const g of bad) skipped.push(g);
    for (const g of ledgerGroups) skipped.push(g);
    const finalRows = okRows.filter((r) => !ledgerGroups.has(String(r.order_group_id)));
    const finalGroups = [...new Set(finalRows.map((r) => String(r.order_group_id)))];
    if (!finalRows.length) continue;
    const { data: del, error: delErr } = await sb.from("orders").delete()
      .in("id", finalRows.map((r) => Number(r.id))).eq("is_test_order", true).select("id");
    if (delErr) throw new Error(delErr.message);
    deleted += (del ?? []).length;
    done += finalGroups.length;
    // 그 주문서에 딸린 채팅 글(주문 감사·카드 안내·결제 완료·장바구니 담음·그 테스트 닉네임 글) — 테스트 표식 글만.
    // 지우지 않고 «관리자 채팅 지우기»와 같은 칸(hidden_at)을 채움 → 기존 소식 길로 열려 있는 손님 화면에서도 바로 사라짐
    const nicknames = [...new Set(finalRows.map((r) => String(r.youtube_nickname ?? "").trim()).filter(Boolean))];
    const bcs = [...new Set(finalRows.map((r) => String(r.broadcast_id ?? "")).filter(Boolean))];
    if (bcs.length) {
      const { data: msgs } = await sb.from("live_chat_messages").select("id, avatar_url, nickname, body, bot_ref")
        .in("broadcast_id", bcs).eq("avatar_url", AUTO_TEST_AVATAR).is("hidden_at", null).limit(3000);
      const hideIds = ((msgs ?? []) as Row[]).filter((m) => isTestOrderChatLine(m, finalGroups, nicknames)).map((m) => Number(m.id));
      for (let j = 0; j < hideIds.length; j += 200) {
        await sb.from("live_chat_messages").update({ hidden_at: new Date().toISOString(), hidden_by: "autotest" }).in("id", hideIds.slice(j, j + 200)).eq("avatar_url", AUTO_TEST_AVATAR);
      }
    }
  }
  return { deleted, groups: done, skipped: [...new Set(skipped)] };
}

/** 자동 테스트 주문 줄(서버 방식 + 화면 방식) */
export async function readAutoTestRows(sb: Db, groupIds: string[] | null): Promise<Row[]> {
  const cols = "id, order_group_id, is_test_order, test_order_reason, operator_test_phone";
  const qa = () => { let q = sb.from("orders").select(cols).eq("is_test_order", true).limit(5000); if (groupIds) q = q.in("order_group_id", groupIds.slice(0, 500)); return q; };
  const [a, b] = await Promise.all([qa().eq("test_order_reason", AUTO_TEST_REASON), qa().eq("operator_test_phone", AUTO_TEST_PHONE)]);
  if (a.error) throw new Error(a.error.message);
  if (b.error) throw new Error(b.error.message);
  const byId = new Map<string, Row>();
  for (const r of [...((a.data ?? []) as Row[]), ...((b.data ?? []) as Row[])]) if (isAutoTestRow(r)) byId.set(String(r.id), r);
  return [...byId.values()];
}

// ── 화면 방식(관리자 화면이 손님 주문 화면을 띄워 버튼을 직접 누름) ──
export type ScreenPlan = {
  chatAfter?: string;
  nickname: string; paymentMethod: "무통장입금" | "카드결제"; broadcastId: string;
  lines: Array<{ productId: string; productName: string; color: string; size: string; qty: number; brand: boolean }>;
  identity: { kakaoId: string; phone: string; name: string; zipcode: string; address: string; detailAddress: string };
};

/** 화면 테스트 준비 — 방송 중일 때만. 상품·옵션·수량·결제·새 닉네임을 정해 돌려준다(주문은 화면이 낸다) */
export async function screenTestPlan(sb: Db, origin: string, scheduled = false): Promise<ScreenPlan | { skip: string }> {
  const bc = await onBroadcast(sb);
  if (!bc) return { skip: "방송 중일 때만 테스트할 수 있어요." };
  // 서버 방식·다른 화면과 겹치지 않게 잠금(화면 테스트는 길어서 2분 30초) — 결과 확인(screenTestVerify) 때 풀림
  const { raw, state } = await readStateRaw(sb);
  const now = Date.now();
  if (state.lockUntil > now) return { skip: "다른 테스트가 진행 중이에요." };
  if (scheduled && ((!state.enabled && !state.pending) || state.nextRunAt === null || now < state.nextRunAt)) return { skip: "아직 차례가 아니에요." };
  const nextRunAt = scheduled || state.enabled ? now + randomGapMs() : state.nextRunAt;
  if (!(await casState(sb, raw, { ...state, lockUntil: now + 180_000, nextRunAt, pending: null }))) return { skip: "다른 테스트가 진행 중이에요." };
  let prep: Prepared;
  let step: Step;
  try {
    await ensureOperatorTestAccount(sb);
    step = await decideStep(sb, origin, bc, state);
    if (step.kind === "asked") { await finish(sb, step.last, { pending: step.pending, nextRunAt: step.pending.dueAt }); return { skip: step.last.message.replace(/^\[질문\] /, "질문 올림 · ") }; }
    if (step.kind === "cancelled") { await finish(sb, step.last, { nextRunAt: Date.now() }); return { skip: step.last.message.replace(/^\[질문\] /, "") }; }
    prep = await prepareRun(sb, bc, step.fixed);
  } catch (e) {
    await finish(sb, { at: now, ok: false, message: `[화면] ${e instanceof Error ? e.message : "준비 실패"}` });
    throw e;
  }
  if ("skip" in prep) { await finish(sb, { at: now, ok: true, message: `[화면] ${prep.skip}` }); return { skip: prep.skip }; }
  const brandIds = new Set<string>();
  const ids = [...new Set(prep.lines.map((l) => l.productId))];
  const { data } = await sb.from("products").select("id, product_note").in("id", ids.map(Number));
  for (const r of (data ?? []) as Row[]) {
    let n: unknown = r.product_note;
    if (typeof n === "string") { try { n = JSON.parse(n); } catch { n = null; } }
    if ((n as Row | null)?.brand_group && ((n as Row).brand_group as Row).enabled === true) brandIds.add(String(r.id));
  }
  // 채팅 켜짐: 주문 전 한 줄은 지금 올리고, 주문 후 한 줄은 화면이 주문을 마친 뒤 올림(chat-after)
  let chatAfter = "";
  if (state.chatEnabled) {
    try {
      if (step.fixed) chatAfter = step.fixed.after; // 질문 때 같이 만들어 둔 한 줄
      else if (step.greet) {
        const mode = await streamModeOf(sb, bc); // 카드 없을 때만 인사(상품 질문 아님) — 준비된 문장, Gemini 안 씀
        await postTestChat(origin, String(bc.id ?? ""), fallbackChatLine("before", mode, null)); chatAfter = fallbackChatLine("after", mode, null);
      }
    } catch { /* 채팅 실패는 주문 테스트와 무관 */ }
  }
  return {
    chatAfter,
    nickname: prep.nickname, paymentMethod: prep.paymentMethod, broadcastId: String(bc.id ?? ""),
    lines: prep.lines.map((l) => ({ productId: l.productId, productName: l.productName, color: l.color, size: l.size, qty: l.qty, brand: brandIds.has(l.productId) })),
    identity: { kakaoId: AUTO_TEST_KAKAO_ID, phone: AUTO_TEST_PHONE, name: AUTO_TEST_NAME, zipcode: "00000", address: "자동 테스트 주소", detailAddress: "자동 테스트" },
  };
}

/** 화면 테스트 결과 확인 — 그 닉네임 주문이 DB 에 저장됐는지·줄이 맞는지. 결과 한 줄을 남긴다. */
export async function screenTestVerify(sb: Db, plan: ScreenPlan, clientNote: string): Promise<AutoTestLast> {
  const at = Date.now();
  const tag = "[화면] ";
  const { data, error } = await sb.from("orders").select("id, order_group_id, order_lookup_code, product_id, product_name, color, size, qty, youtube_nickname, payment_method, is_test_order, kakao_id, created_at")
    .eq("youtube_nickname", plan.nickname).eq("kakao_id", AUTO_TEST_KAKAO_ID);
  let last: AutoTestLast;
  const saved = (error ? [] : (data ?? [])) as Row[];
  const summary = `${plan.nickname} · ${plan.paymentMethod === "카드결제" ? "카드" : "무통장"} · ${plan.lines.map((l) => `${l.productName}${[l.color, l.size].filter((x) => x && x !== "없음").length ? ` ${[l.color, l.size].filter((x) => x && x !== "없음").join("/")}` : ""} ×${l.qty}`).join(", ")}`;
  if (error) last = { at, ok: false, message: `${tag}저장 확인 실패: ${error.message}` };
  else if (!saved.length) last = { at, ok: false, message: `${tag}주문이 저장되지 않았어요 — ${clientNote || "화면에서 멈춤"} (${summary})`, nickname: plan.nickname };
  else {
    const sent = plan.lines.map((l) => ({ product_id: l.productId, product_name: l.productName, color: l.color, size: l.size, qty: l.qty, youtube_nickname: plan.nickname, payment_method: plan.paymentMethod }));
    const problems = verifySavedRows(sent, saved);
    const code = String(saved[0].order_lookup_code ?? "");
    last = problems.length
      ? { at, ok: false, message: `${tag}저장 내용이 달라요 — ${problems.join(" · ")} (${summary})`, orderCode: code, nickname: plan.nickname }
      : { at, ok: true, message: `${tag}주문서 제출 확인 — ${summary}`, orderCode: code, nickname: plan.nickname };
  }
  await finish(sb, last);
  return last;
}
