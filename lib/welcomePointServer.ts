// [2026-11-12] 방송 시청 선물 포인트 — 서버 전용(service_role).
//   설정은 비공개 저장소(admin-private/welcome-point.json) — settings 표는 손님도 쓸 수 있어 금액을 거기 두지 않는다.
//   주문은 읽기만. 지급은 기존 admin_change_customer_points RPC(중복 방지 키) 하나뿐.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAID_STATUS_VALUES } from "@/lib/admin-v2/statusDisplay";
import { koreanPhoneVariants } from "@/lib/order/phone";
import { AUTO_TEST_KAKAO_ID } from "@/lib/autoTestOrder";
import {
  decideWelcome, kstDayStartIso, parseWelcomePointConfig, parseWelcomeSourceKey, WELCOME_POINT_DEFAULT, WELCOME_REASON,
  welcomeOrderResult, welcomeTierKey, type WelcomeOrderRow,
  type PaidHistory, type WelcomeDecision, type WelcomeKind, type WelcomePointConfig,
} from "@/lib/welcomePoint";

const PAID = new Set(PAID_STATUS_VALUES);
export const WELCOME_BUCKET = "admin-private";
export const WELCOME_FILE = "welcome-point.json";

const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");

function isNotFound(error: unknown): boolean {
  const e = (error || {}) as { message?: string; statusCode?: string | number; status?: number; error?: string; originalError?: { status?: number } };
  const msg = `${e.message || ""} ${e.error || ""}`.toLowerCase();
  return String(e.statusCode) === "404" || e.status === 404 || e.originalError?.status === 404 || msg.includes("not found");
}

let cfgCache: { at: number; value: WelcomePointConfig } | null = null;
const CFG_MS = 30_000;
export function clearWelcomeConfigCache() { cfgCache = null; }

/** 설정 읽기 — 없으면 기본값(둘 다 꺼짐). 읽기 오류는 throw(모르면 안 줌). */
export async function readWelcomeConfig(sb: SupabaseClient, fresh = false): Promise<WelcomePointConfig> {
  if (!fresh && cfgCache && Date.now() - cfgCache.at < CFG_MS) return cfgCache.value;
  const { data, error } = await sb.storage.from(WELCOME_BUCKET).download(WELCOME_FILE);
  let value: WelcomePointConfig;
  if (error) {
    if (!isNotFound(error)) throw new Error(error.message || "설정을 읽지 못했어요");
    value = parseWelcomePointConfig(WELCOME_POINT_DEFAULT);
  } else {
    const text = data && typeof data.text === "function" ? await data.text() : "";
    value = parseWelcomePointConfig(text);
  }
  cfgCache = { at: Date.now(), value };
  return value;
}

export async function writeWelcomeConfig(sb: SupabaseClient, cfg: WelcomePointConfig): Promise<WelcomePointConfig> {
  const clean = parseWelcomePointConfig(cfg);
  const { data, error } = await sb.storage.getBucket(WELCOME_BUCKET);
  if (error || !data) {
    const { error: ce } = await sb.storage.createBucket(WELCOME_BUCKET, { public: false, fileSizeLimit: 2 * 1024 * 1024 });
    if (ce && !String(ce.message || "").toLowerCase().includes("already")) throw new Error(ce.message);
  }
  const { error: ue } = await sb.storage.from(WELCOME_BUCKET)
    .upload(WELCOME_FILE, new Blob([JSON.stringify(clean)], { type: "application/json" }), { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (ue) throw new Error(ue.message || "설정 저장 실패");
  cfgCache = { at: Date.now(), value: clean };
  return clean;
}

export type WelcomeCustomer = { id: string; phone: string; nickname: string; name: string; joinedAt: string | null };

/** 카카오 계정 + 지금 전화번호가 «같은 회원 줄»일 때만. 차단 회원은 null. */
export async function findWelcomeCustomer(sb: SupabaseClient, kakaoId: string, phone: string): Promise<WelcomeCustomer | null> {
  const k = String(kakaoId || "").replace(/[^0-9A-Za-z_-]/g, "");
  const p = digits(phone);
  if (!k || p.length < 10 || p.length > 11) return null;
  if (k === AUTO_TEST_KAKAO_ID) return null; // [2026-11-13] 자동 테스트 회원은 선물 대상 아님
  const { data, error } = await sb.from("customers").select("*").eq("kakao_id", k).order("created_at", { ascending: false }).limit(3);
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as Record<string, unknown>[]).find((r) => digits(r.customer_phone) === p);
  if (!row) return null;
  const blocked = row.is_blocked;
  if (blocked === true || ["true", "y", "1"].includes(String(blocked ?? "").trim().toLowerCase())) return null;
  return {
    id: String(row.id ?? ""),
    phone: p,
    nickname: String(row.youtube_nickname ?? row.nickname ?? "").slice(0, 80),
    name: String(row.customer_name ?? row.name ?? "").slice(0, 80),
    joinedAt: String(row.first_login_at ?? row.created_at ?? "") || null,
  };
}

/** 결제완료 주문 이력(카카오 계정 + 지금 전화번호, 테스트·취소·삭제 제외). 읽기만. */
export async function paidHistoryOf(sb: SupabaseClient, kakaoId: string, phone: string): Promise<PaidHistory> {
  const k = String(kakaoId || "").replace(/[^0-9A-Za-z_-]/g, "");
  const p = digits(phone);
  const ors: string[] = [];
  if (k) ors.push(`kakao_id.eq.${k}`);
  if (p.length >= 9) {
    const vs = Array.from(new Set([p, ...koreanPhoneVariants(p)])).map((v) => `"${v}"`).join(",");
    ors.push(`customer_phone.in.(${vs})`);
  }
  if (!ors.length) return { paidCount: 0, lastPaidAt: null, lastPaidKey: null };
  const groups = new Map<string, string>(); // 주문서 키 → 가장 늦은 줄 시각
  for (let page = 0; page < 10; page++) {
    const { data, error } = await sb.from("orders")
      .select("id,order_group_id,created_at,admin_order_status_v2,order_manage_status,is_test_order,is_deleted")
      .or(ors.join(","))
      .order("id", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    const list = (data ?? []) as Record<string, unknown>[];
    for (const r of list) {
      if (r.is_deleted === true || r.is_test_order === true) continue;
      const a = String(r.admin_order_status_v2 || "").trim();
      const b = String(r.order_manage_status || "").trim();
      if (a.includes("취소") || b.includes("취소")) continue;
      if (!PAID.has(a) && !PAID.has(b)) continue;
      const key = String(r.order_group_id || `o${r.id}`);
      const at = String(r.created_at || "");
      const prev = groups.get(key);
      if (!prev || at > prev) groups.set(key, at);
    }
    if (list.length < 1000) break;
  }
  let lastKey: string | null = null;
  let lastAt: string | null = null;
  for (const [key, at] of groups) if (!lastAt || at > lastAt) { lastAt = at; lastKey = key; }
  return { paidCount: groups.size, lastPaidAt: lastAt, lastPaidKey: lastKey };
}

/** 이 선물 키로 이미 받았는지 */
export async function alreadyGranted(sb: SupabaseClient, sourceKey: string): Promise<boolean> {
  const { data, error } = await sb.from("customer_point_ledger").select("id").eq("source_key", sourceKey).limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** 이 선물의 구간 키 중 이미 받은 것 */
export async function grantedTierKeys(sb: SupabaseClient, keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const { data, error } = await sb.from("customer_point_ledger").select("source_key").in("source_key", keys).limit(keys.length * 2);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { source_key?: unknown }[]).map((r) => String(r.source_key ?? "")));
}

/** 오늘(한국 시간) 선물 받은 «사람» 수 — 첫 구간 지급만 셈(#2·#3 추가 구간은 같은 사람) */
export async function grantedTodayCount(sb: SupabaseClient, dayStartIso: string): Promise<number> {
  const { count, error } = await sb.from("customer_point_ledger")
    .select("id", { count: "exact", head: true })
    .like("source_key", "welcome_%")
    .not("source_key", "like", "%#%")
    .gte("created_at", dayStartIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** 같은 전화번호로 «다른 회원»이 이미 처음 오신 선물을 받은 적 있는지(카카오 계정을 새로 만들어 또 받는 것 막기).
 *  [2026-11-14] 자기 자신이 받은 앞 구간은 막지 않음(다음 구간 받아야 하므로). customerId 없으면 예전처럼 누구든 막음. */
export async function phoneHadFirstGift(sb: SupabaseClient, phone: string, customerId = ""): Promise<boolean> {
  const p = digits(phone);
  if (p.length < 9) return false;
  const vs = Array.from(new Set([p, ...koreanPhoneVariants(p)]));
  const { data, error } = await sb.from("customer_point_ledger").select("id,source_key").in("customer_phone", vs).like("source_key", "welcome_first:%").limit(20);
  if (error) throw new Error(error.message);
  const own = customerId ? `welcome_first:${customerId}` : "";
  return ((data ?? []) as { source_key?: unknown }[]).some((r) => {
    const k = String(r.source_key ?? "");
    return !own || !(k === own || k.startsWith(`${own}#`));
  });
}

// ── [2026-11-14] 보기 시작 표(서명) — 서버가 실제로 몇 초 지났는지 확인 ──
//   GET 때 «언제 보기 시작했는지»를 서명해 손님 화면에 주고, 받기(POST) 때 그 시각부터 지금까지가 구간 초 이상인지 본다.
//   DB 쓰기 없음. 다른 앱으로 나가면 화면이 새 표를 받아 처음부터 다시 셈.
const TICKET_AUD = "ruru-welcome-v1";
const TICKET_MAX_MS = 3 * 3600_000;
const TICKET_SLACK_MS = 1500; // 손님 폰 1초 셈·네트워크 오차
type WelcomeTicket = { c: string; k: string; t: number; aud: string };
const ticketMac = (body: string, secret: string) => createHmac("sha256", secret).update(`${TICKET_AUD}:${body}`).digest("base64url");

export function signWelcomeTicket(customerId: string, kakaoId: string, startMs: number, secret: string): string {
  if (!secret) throw new Error("서명 설정이 없어요");
  const body = Buffer.from(JSON.stringify({ c: customerId, k: kakaoId, t: Math.floor(startMs), aud: TICKET_AUD })).toString("base64url");
  return `${body}.${ticketMac(body, secret)}`;
}

/** 표가 이 손님 것이고 서명이 맞으면 보기 시작 시각(ms), 아니면 null */
export function verifyWelcomeTicket(token: unknown, customerId: string, kakaoId: string, nowMs: number, secret: string): number | null {
  try {
    if (!secret) return null;
    const [body, mac, extra] = String(token ?? "").split(".");
    if (!body || !mac || extra) return null;
    const a = Buffer.from(ticketMac(body, secret));
    const b = Buffer.from(mac);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as WelcomeTicket;
    if (p.aud !== TICKET_AUD || p.c !== customerId || p.k !== kakaoId || !Number.isFinite(p.t)) return null;
    if (p.t > nowMs + 5000 || nowMs - p.t > TICKET_MAX_MS) return null;
    return p.t;
  } catch { return null; }
}

/** 지금 켜진 방송이 있는지 */
export async function liveBroadcastOn(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb.from("broadcasts").select("id").eq("status", "ON").limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** tierIndex = 다음에 받을 구간(0부터). decision 이 null 이면 의미 없음. */
export type WelcomeEvaluation = { cfg: WelcomePointConfig; decision: WelcomeDecision; customer: WelcomeCustomer | null; tierIndex: number };

/** 이 손님이 지금 받을 수 있는 선물(지급 전 공통 판단). 모르면 null(안 줌). */
export async function evaluateWelcome(sb: SupabaseClient, kakaoId: string, phone: string, nowMs: number): Promise<WelcomeEvaluation> {
  const cfg = await readWelcomeConfig(sb);
  const none = (customer: WelcomeCustomer | null): WelcomeEvaluation => ({ cfg, decision: null, customer, tierIndex: 0 });
  if (!cfg.first.on && !cfg.back.on) return none(null);
  if (!(await liveBroadcastOn(sb))) return none(null);
  const customer = await findWelcomeCustomer(sb, kakaoId, phone);
  if (!customer) return none(null);
  const history = await paidHistoryOf(sb, kakaoId, customer.phone);
  const decision = decideWelcome(cfg, customer.id, history, nowMs, customer.joinedAt);
  if (!decision) return none(customer);
  const keys = decision.tiers.map((_, i) => welcomeTierKey(decision.sourceKey, i));
  const got = await grantedTierKeys(sb, keys);
  const tierIndex = keys.findIndex((k, i) => !got.has(k) && decision.tiers[i].amount > 0);
  if (tierIndex < 0) return none(customer);
  if (decision.kind === "first" && (await phoneHadFirstGift(sb, customer.phone, customer.id))) return none(customer);
  return { cfg, decision, customer, tierIndex };
}

export type WelcomeClaimResult =
  | { ok: true; granted: boolean; amount: number; kind: WelcomeKind; tier: number; next: number | null }
  | { ok: false; status: number; message: string };

/** 받기 — 조건을 다시 확인하고, 보기 시작 표로 «실제 지난 시간»을 확인한 뒤 다음 구간 하나만 기존 포인트 지급 RPC(중복 방지 키)로 지급 */
export async function claimWelcome(
  sb: SupabaseClient, kakaoId: string, phone: string, nowMs: number,
  opts: { ticket: unknown; secret: string },
): Promise<WelcomeClaimResult> {
  const { cfg, decision, customer, tierIndex } = await evaluateWelcome(sb, kakaoId, phone, nowMs);
  if (!decision || !customer) return { ok: false, status: 409, message: "받을 수 있는 선물이 없어요" };
  const tier = decision.tiers[tierIndex];
  const startMs = verifyWelcomeTicket(opts.ticket, customer.id, String(kakaoId || "").replace(/[^0-9A-Za-z_-]/g, ""), nowMs, opts.secret);
  if (startMs == null) return { ok: false, status: 409, message: "다시 열어 주세요" };
  if (nowMs - startMs < tier.sec * 1000 - TICKET_SLACK_MS) return { ok: false, status: 409, message: "아직 시간이 안 됐어요" };
  if (tierIndex === 0 && (await grantedTodayCount(sb, kstDayStartIso(nowMs))) >= cfg.dailyCap) return { ok: false, status: 409, message: "오늘 선물이 모두 나갔어요" };
  const { data, error } = await sb.rpc("admin_change_customer_points", {
    p_phone: customer.phone, p_action: "grant", p_amount: tier.amount,
    p_reason: WELCOME_REASON[decision.kind] + (tierIndex > 0 ? " · 추가" : ""), p_admin_memo: "방송 시청 선물 자동 지급",
    p_nickname: customer.nickname, p_customer_name: customer.name,
    p_customer_visible: true, p_source_key: welcomeTierKey(decision.sourceKey, tierIndex),
  });
  const d = (data || null) as { ok?: unknown; duplicate?: unknown; message?: unknown } | null;
  if (error || !d || typeof d.ok !== "boolean") return { ok: false, status: 503, message: "지급 결과를 확인하지 못했어요" };
  if (!d.ok) return { ok: false, status: 409, message: String(d.message || "지급 실패") };
  let next: number | null = null;
  for (let i = tierIndex + 1; i < decision.tiers.length; i++) if (decision.tiers[i].amount > 0) { next = i; break; }
  return { ok: true, granted: d.duplicate !== true, amount: tier.amount, kind: decision.kind, tier: tierIndex, next };
}


// ── 관리자: 선물 받은 사람 목록(페이지) + 최근 30일 요약 — 전부 읽기만 ──
export type WelcomeRecipientRow = {
  id: string; at: string; kind: "first" | "back"; amount: number; tier: number;
  nickname: string; name: string; phoneTail: string;
  orders: number; paidOrders: number; paidAmount: number;
};
export type WelcomeSummary = { days: number; gifts: number; points: number; ordered: number; paid: number; paidAmount: number; capped: boolean };

type LedgerRow = { id: unknown; customer_phone: unknown; youtube_nickname: unknown; customer_name: unknown; amount: unknown; source_key: unknown; created_at: unknown };
const LEDGER_COLS = "id,customer_phone,youtube_nickname,customer_name,amount,source_key,created_at";

/** 선물 줄들에 «선물 뒤 주문» 결과 붙이기 — 회원 표로 카카오 계정을 찾고, 주문은 100명씩 한 번에 읽음 */
async function attachResults(sb: SupabaseClient, rows: LedgerRow[]): Promise<WelcomeRecipientRow[]> {
  const parsed = rows.map((r) => ({ r, k: parseWelcomeSourceKey(r.source_key) }));
  const ids = Array.from(new Set(parsed.map((x) => x.k?.customerId).filter((v): v is string => !!v)));
  const kakaoOf = new Map<string, { kakao: string; nick: string; name: string }>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb.from("customers").select("id,kakao_id,youtube_nickname,customer_name").in("id", ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const c of (data ?? []) as Record<string, unknown>[]) kakaoOf.set(String(c.id), { kakao: String(c.kakao_id ?? ""), nick: String(c.youtube_nickname ?? ""), name: String(c.customer_name ?? "") });
  }
  const gifts = parsed.map(({ r, k }) => {
    const c = k ? kakaoOf.get(k.customerId) : undefined;
    return { r, kind: (k?.kind ?? "first") as "first" | "back", tier: k?.tier ?? 0, at: String(r.created_at ?? ""), kakaoId: c?.kakao ?? "", phone: digits(r.customer_phone), c };
  });
  const orders: WelcomeOrderRow[] = [];
  for (let i = 0; i < gifts.length; i += 100) {
    const part = gifts.slice(i, i + 100);
    const minAt = part.map((g) => g.at).filter(Boolean).sort()[0];
    if (!minAt) continue;
    const ks = Array.from(new Set(part.map((g) => g.kakaoId.replace(/[^0-9A-Za-z_-]/g, "")).filter(Boolean)));
    const ps = Array.from(new Set(part.flatMap((g) => (g.phone.length >= 9 ? [g.phone, ...koreanPhoneVariants(g.phone)] : []))));
    const ors: string[] = [];
    if (ks.length) ors.push(`kakao_id.in.(${ks.map((v) => `"${v}"`).join(",")})`);
    if (ps.length) ors.push(`customer_phone.in.(${ps.map((v) => `"${v}"`).join(",")})`);
    if (!ors.length) continue;
    for (let page = 0; page < 5; page++) {
      const { data, error } = await sb.from("orders")
        .select("id,order_group_id,kakao_id,customer_phone,created_at,admin_order_status_v2,order_manage_status,is_test_order,is_deleted,final_amount")
        .or(ors.join(",")).gte("created_at", minAt)
        .order("id", { ascending: true }).range(page * 1000, page * 1000 + 999);
      if (error) throw new Error(error.message);
      const list = (data ?? []) as WelcomeOrderRow[];
      orders.push(...list);
      if (list.length < 1000) break;
    }
  }
  return gifts.map((g) => {
    const res = welcomeOrderResult({ at: g.at, kakaoId: g.kakaoId, phone: g.phone }, orders, PAID);
    return {
      id: String(g.r.id ?? ""), at: g.at, kind: g.kind, tier: g.tier, amount: Math.abs(Number(g.r.amount) || 0),
      nickname: String(g.r.youtube_nickname || g.c?.nick || ""), name: String(g.r.customer_name || g.c?.name || ""),
      phoneTail: g.phone.slice(-4), ...res,
    };
  });
}

/** 선물 받은 사람 한 페이지(최신순) */
export async function listWelcomeRecipients(sb: SupabaseClient, page: number, size: number): Promise<{ rows: WelcomeRecipientRow[]; total: number }> {
  const from = (page - 1) * size;
  const { data, error, count } = await sb.from("customer_point_ledger")
    .select(LEDGER_COLS, { count: "exact" })
    .like("source_key", "welcome_%")
    .order("created_at", { ascending: false })
    .range(from, from + size - 1);
  if (error) throw new Error(error.message);
  return { rows: await attachResults(sb, (data ?? []) as LedgerRow[]), total: count ?? 0 };
}

/** 최근 N일 요약 — 선물 몇 명·그중 주문/결제 몇 명. 너무 많으면 최신 2,000명까지만(capped) */
export async function summarizeWelcome(sb: SupabaseClient, nowMs: number, days = 30): Promise<WelcomeSummary> {
  const since = new Date(nowMs - days * 86400000).toISOString();
  const all: LedgerRow[] = [];
  for (let page = 0; page < 2; page++) {
    const { data, error } = await sb.from("customer_point_ledger").select(LEDGER_COLS)
      .like("source_key", "welcome_%").gte("created_at", since)
      .order("created_at", { ascending: false }).range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    const list = (data ?? []) as LedgerRow[];
    all.push(...list);
    if (list.length < 1000) break;
  }
  const rows = await attachResults(sb, all);
  const people = rows.filter((r) => r.tier === 0); // 사람 수·주문은 첫 구간 줄로만(추가 구간은 같은 사람)
  return {
    days, gifts: people.length, points: rows.reduce((s, r) => s + r.amount, 0),
    ordered: people.filter((r) => r.orders > 0).length, paid: people.filter((r) => r.paidOrders > 0).length,
    paidAmount: people.reduce((s, r) => s + r.paidAmount, 0), capped: all.length >= 2000,
  };
}
