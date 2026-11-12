// [2026-11-12] 방송 시청 선물 포인트 — 서버 전용(service_role).
//   설정은 비공개 저장소(admin-private/welcome-point.json) — settings 표는 손님도 쓸 수 있어 금액을 거기 두지 않는다.
//   주문은 읽기만. 지급은 기존 admin_change_customer_points RPC(중복 방지 키) 하나뿐.
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAID_STATUS_VALUES } from "@/lib/admin-v2/statusDisplay";
import { koreanPhoneVariants } from "@/lib/order/phone";
import {
  decideWelcome, kstDayStartIso, parseWelcomePointConfig, parseWelcomeSourceKey, WELCOME_POINT_DEFAULT, WELCOME_REASON,
  welcomeOrderResult, type WelcomeOrderRow,
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

export type WelcomeCustomer = { id: string; phone: string; nickname: string; name: string };

/** 카카오 계정 + 지금 전화번호가 «같은 회원 줄»일 때만. 차단 회원은 null. */
export async function findWelcomeCustomer(sb: SupabaseClient, kakaoId: string, phone: string): Promise<WelcomeCustomer | null> {
  const k = String(kakaoId || "").replace(/[^0-9A-Za-z_-]/g, "");
  const p = digits(phone);
  if (!k || p.length < 10 || p.length > 11) return null;
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

/** 오늘(한국 시간) 선물 지급 수 */
export async function grantedTodayCount(sb: SupabaseClient, dayStartIso: string): Promise<number> {
  const { count, error } = await sb.from("customer_point_ledger")
    .select("id", { count: "exact", head: true })
    .like("source_key", "welcome_%")
    .gte("created_at", dayStartIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** 같은 전화번호로 이미 «처음 오신 선물»을 받은 적 있는지(카카오 계정을 새로 만들어 또 받는 것 막기) */
export async function phoneHadFirstGift(sb: SupabaseClient, phone: string): Promise<boolean> {
  const p = digits(phone);
  if (p.length < 9) return false;
  const vs = Array.from(new Set([p, ...koreanPhoneVariants(p)]));
  const { data, error } = await sb.from("customer_point_ledger").select("id").in("customer_phone", vs).like("source_key", "welcome_first:%").limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** 지금 켜진 방송이 있는지 */
export async function liveBroadcastOn(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb.from("broadcasts").select("id").eq("status", "ON").limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export type WelcomeEvaluation = { cfg: WelcomePointConfig; decision: WelcomeDecision; customer: WelcomeCustomer | null };

/** 이 손님이 지금 받을 수 있는 선물(지급 전 공통 판단). 모르면 null(안 줌). */
export async function evaluateWelcome(sb: SupabaseClient, kakaoId: string, phone: string, nowMs: number): Promise<WelcomeEvaluation> {
  const cfg = await readWelcomeConfig(sb);
  if (!cfg.first.on && !cfg.back.on) return { cfg, decision: null, customer: null };
  if (!(await liveBroadcastOn(sb))) return { cfg, decision: null, customer: null };
  const customer = await findWelcomeCustomer(sb, kakaoId, phone);
  if (!customer) return { cfg, decision: null, customer: null };
  const history = await paidHistoryOf(sb, kakaoId, customer.phone);
  const decision = decideWelcome(cfg, customer.id, history, nowMs);
  if (!decision) return { cfg, decision: null, customer };
  if (await alreadyGranted(sb, decision.sourceKey)) return { cfg, decision: null, customer };
  if (decision.kind === "first" && (await phoneHadFirstGift(sb, customer.phone))) return { cfg, decision: null, customer };
  return { cfg, decision, customer };
}

export type WelcomeClaimResult =
  | { ok: true; granted: boolean; amount: number; kind: WelcomeKind }
  | { ok: false; status: number; message: string };

/** 받기 — 조건을 다시 확인하고 기존 포인트 지급 RPC(중복 방지 키)로 한 번만 지급 */
export async function claimWelcome(sb: SupabaseClient, kakaoId: string, phone: string, nowMs: number): Promise<WelcomeClaimResult> {
  const { cfg, decision, customer } = await evaluateWelcome(sb, kakaoId, phone, nowMs);
  if (!decision || !customer) return { ok: false, status: 409, message: "받을 수 있는 선물이 없어요" };
  if ((await grantedTodayCount(sb, kstDayStartIso(nowMs))) >= cfg.dailyCap) return { ok: false, status: 409, message: "오늘 선물이 모두 나갔어요" };
  const { data, error } = await sb.rpc("admin_change_customer_points", {
    p_phone: customer.phone, p_action: "grant", p_amount: decision.amount,
    p_reason: WELCOME_REASON[decision.kind], p_admin_memo: "방송 시청 선물 자동 지급",
    p_nickname: customer.nickname, p_customer_name: customer.name,
    p_customer_visible: true, p_source_key: decision.sourceKey,
  });
  const d = (data || null) as { ok?: unknown; duplicate?: unknown; message?: unknown } | null;
  if (error || !d || typeof d.ok !== "boolean") return { ok: false, status: 503, message: "지급 결과를 확인하지 못했어요" };
  if (!d.ok) return { ok: false, status: 409, message: String(d.message || "지급 실패") };
  return { ok: true, granted: d.duplicate !== true, amount: decision.amount, kind: decision.kind };
}


// ── 관리자: 선물 받은 사람 목록(페이지) + 최근 30일 요약 — 전부 읽기만 ──
export type WelcomeRecipientRow = {
  id: string; at: string; kind: "first" | "back"; amount: number;
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
    return { r, kind: (k?.kind ?? "first") as "first" | "back", at: String(r.created_at ?? ""), kakaoId: c?.kakao ?? "", phone: digits(r.customer_phone), c };
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
      id: String(g.r.id ?? ""), at: g.at, kind: g.kind, amount: Math.abs(Number(g.r.amount) || 0),
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
  return {
    days, gifts: rows.length, points: rows.reduce((s, r) => s + r.amount, 0),
    ordered: rows.filter((r) => r.orders > 0).length, paid: rows.filter((r) => r.paidOrders > 0).length,
    paidAmount: rows.reduce((s, r) => s + r.paidAmount, 0), capped: all.length >= 2000,
  };
}
