// lib/autoTestOrderServer.ts
// [2026-11-13 사장님 「라이브 중 자동 테스트 주문」] 실행·잠금·삭제.
//   - 켜져 있고 방송(ON) 중이면 5~10분 랜덤 간격으로 한 번. 여러 화면·cron 이 겹쳐도 settings 한 줄 값 비교(CAS)로 한 번만.
//   - 주문은 손님과 같은 주소로 보낸다: /api/cart-reservations(담기) → /api/customer-orders/submit(제출). 가짜 저장 경로 없음.
//   - 저장 뒤 DB 를 다시 읽어 보낸 줄과 맞는지 확인하고 결과 한 줄만 남긴다(별도 기록 화면 없음).
//   - 삭제는 «자동 테스트 주문서»만(is_test_order=true + test_order_reason 자동 테스트, 주문서 줄 전부가 그럴 때만).
import { randomBytes, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUTO_TEST_KAKAO_ID, AUTO_TEST_KEY, AUTO_TEST_NAME, AUTO_TEST_PHONE, AUTO_TEST_REASON,
  buildOrderRows, choosePayment, nicknameCandidates, parseAutoTestState, pickOrderLines, productChoices, randomGapMs, verifySavedRows,
  type AutoTestLast, type AutoTestSettings, type AutoTestState,
} from "@/lib/autoTestOrder";

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
async function finish(sb: Db, last: AutoTestLast): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    const { raw, state } = await readStateRaw(sb);
    if (await casState(sb, raw, { ...state, lockUntil: 0, last })) return;
  }
}

export async function readAutoTestState(sb: Db): Promise<AutoTestState> {
  return (await readStateRaw(sb)).state;
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
  if (!state.enabled) return { ran: false, reason: "off" };
  const now = Date.now();
  if (state.lockUntil > now) return { ran: false, reason: "running" };
  const bc = await onBroadcast(sb);
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
  if (!(await casState(sb, raw, { ...state, lockUntil: now + LOCK_MS, nextRunAt: now + randomGapMs() }))) return { ran: false, reason: "lost-lock" };
  const last = await runOnce(sb, origin, bc);
  await finish(sb, last);
  return { ran: true, reason: "ran", last };
}

/** 관리자 「지금 테스트」 — 켬/끔과 무관, 방송 중일 때만, 다른 실행과 겹치지 않게 */
export async function autoTestRunNow(sb: Db, origin: string): Promise<AutoTestLast> {
  const { raw, state } = await readStateRaw(sb);
  const now = Date.now();
  if (state.lockUntil > now) return { at: now, ok: false, message: "다른 테스트가 진행 중이에요. 잠시 뒤 다시 눌러 주세요." };
  const bc = await onBroadcast(sb);
  if (!bc) return { at: now, ok: false, message: "방송 중일 때만 테스트할 수 있어요." };
  if (!(await casState(sb, raw, { ...state, lockUntil: now + LOCK_MS }))) return { at: now, ok: false, message: "다른 테스트가 진행 중이에요. 잠시 뒤 다시 눌러 주세요." };
  const last = await runOnce(sb, origin, bc);
  await finish(sb, last);
  return last;
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

async function freshNickname(sb: Db): Promise<string> {
  for (let round = 0; round < 3; round += 1) {
    const cands = nicknameCandidates(12);
    const [c, o] = await Promise.all([
      sb.from("customers").select("youtube_nickname").in("youtube_nickname", cands),
      sb.from("orders").select("youtube_nickname").in("youtube_nickname", cands),
    ]);
    if (c.error || o.error) throw new Error("닉네임 중복 확인 실패");
    const used = new Set([...(c.data ?? []), ...(o.data ?? [])].map((r) => String((r as Row).youtube_nickname ?? "").trim().toLowerCase()));
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

async function runOnce(sb: Db, origin: string, bc: Row): Promise<AutoTestLast> {
  const at = Date.now();
  try {
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
    const choices = products.flatMap((p) => productChoices(p, overseasOn));
    if (!choices.length) return { at, ok: true, message: "건너뜀 — 지금 방송에 재고 무제한으로 주문할 수 있는 상품이 없어요." };
    const lines = pickOrderLines(choices);
    const paymentMethod = choosePayment(lines, settings);

    // 2. 새 닉네임 → 테스트 회원 닉네임 바꿈
    await ensureTestCustomer(sb);
    const nickname = await freshNickname(sb);
    const { error: nickErr } = await sb.from("customers").update({ youtube_nickname: nickname, last_login_at: new Date().toISOString() }).eq("kakao_id", AUTO_TEST_KAKAO_ID);
    if (nickErr) throw new Error(`닉네임 바꾸기 실패: ${nickErr.message}`);

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
    const summary = `${nickname} · ${paymentMethod === "카드결제" ? "카드" : "무통장"} · ${lines.map((l) => `${l.productName}${[l.color, l.size].filter((x) => x && x !== "없음").length ? ` ${[l.color, l.size].filter((x) => x && x !== "없음").join("/")}` : ""} ×${l.qty}`).join(", ")}`;
    if (problems.length) return { at, ok: false, message: `저장 내용이 달라요 — ${problems.join(" · ")} (${summary})`, orderCode: lookupCode, nickname };
    return { at, ok: true, message: `주문서 제출 확인 — ${summary}`, orderCode: lookupCode, nickname };
  } catch (e) {
    return { at, ok: false, message: e instanceof Error ? e.message : "테스트 실패" };
  }
}

/** 자동 테스트 주문서 영구 삭제 — groupIds 없으면 전부. 일반 주문이 하나라도 섞인 주문서는 건너뜀. */
export async function deleteAutoTestOrders(sb: Db, groupIds: string[] | null): Promise<{ deleted: number; groups: number; skipped: string[] }> {
  let q = sb.from("orders").select("id, order_group_id").eq("is_test_order", true).eq("test_order_reason", AUTO_TEST_REASON).limit(5000);
  if (groupIds) q = q.in("order_group_id", groupIds.slice(0, 500));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const groups = [...new Set(((data ?? []) as Row[]).map((r) => String(r.order_group_id ?? "")).filter(Boolean))];
  const skipped: string[] = [];
  if (groupIds) for (const g of groupIds) if (!groups.includes(g)) skipped.push(g);
  let deleted = 0, done = 0;
  for (let i = 0; i < groups.length; i += 100) {
    const batch = groups.slice(i, i + 100);
    // 주문서의 «모든» 줄 다시 읽기 — 하나라도 자동 테스트가 아니면 그 주문서는 손대지 않음
    const { data: all, error: allErr } = await sb.from("orders").select("id, order_group_id, is_test_order, test_order_reason").in("order_group_id", batch);
    if (allErr) throw new Error(allErr.message);
    const rows = (all ?? []) as Row[];
    const bad = new Set(rows.filter((r) => r.is_test_order !== true || String(r.test_order_reason ?? "") !== AUTO_TEST_REASON).map((r) => String(r.order_group_id)));
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
      .in("id", finalRows.map((r) => Number(r.id))).eq("is_test_order", true).eq("test_order_reason", AUTO_TEST_REASON).select("id");
    if (delErr) throw new Error(delErr.message);
    deleted += (del ?? []).length;
    done += finalGroups.length;
    // 그 주문서에 붙은 채팅 안내 글(주문 감사·카드 안내)도 정리
    const refs = finalGroups.flatMap((g) => [`o:${g}`, `card:${g}`, `paid:${g}`]);
    await sb.from("live_chat_messages").delete().in("bot_ref", refs);
  }
  return { deleted, groups: done, skipped: [...new Set(skipped)] };
}
