// lib/welcomeExpire.ts
// [2026-11-14 12:14 사장님 「유효기간 지급일로부터 30일」 → 「실제로 30일 뒤 소멸」]
//   방송 시청 선물(source_key welcome_first:/welcome_back:)로 준 포인트 중 «안 쓴 만큼»을 지급 30일 뒤 없앤다.
//   쓴 포인트는 «먼저 받은 포인트부터» 쓴 것으로 셈(손님에게 유리 — 오래된 선물부터 소진).
//   차감은 기존 RPC admin_change_customer_points(deduct)만 사용 — 잔액·이력 한 번에, 0 미만 거절, 같은 키 두 번 안 됨.
//   소멸 기록 키 = wexpire:<지급 이력 id> (welcome_ 로 시작하지 않게 — 하루 인원·선물 목록 집계에 안 섞임).
//   주문·입금·정산·배송·적립 로직 무접촉.

import type { SupabaseClient } from "@supabase/supabase-js";

export const WELCOME_EXPIRE_DAYS = 30;
export const WELCOME_EXPIRE_KEY_PREFIX = "wexpire:";
const DAY_MS = 86_400_000;

export type LedgerRow = { id: string; amount: number; created_at: string; source_key?: string | null };
export type ExpirePlan = { grantId: string; amount: number; grantedAt: string };

export function isWelcomeGrantKey(key: unknown): boolean {
  const k = String(key ?? "");
  return k.startsWith("welcome_first:") || k.startsWith("welcome_back:");
}

/** 한 손님 이력(시간순 아님 OK)과 지금 잔액으로 «지금 없앨 시청 선물 포인트» 계산 — 순수 함수 */
export function planWelcomeExpiry(rows: LedgerRow[], currentBalance: number, nowMs: number, days = WELCOME_EXPIRE_DAYS): ExpirePlan[] {
  const sorted = [...rows].sort((a, b) => {
    const d = Date.parse(a.created_at) - Date.parse(b.created_at);
    return d !== 0 ? d : String(a.id).localeCompare(String(b.id));
  });
  type Lot = { id: string; remaining: number; welcome: boolean; at: string; expired: boolean };
  const lots: Lot[] = [];
  const byId = new Map<string, Lot>();
  const expiredIds = new Set<string>();
  for (const r of sorted) {
    const amt = Math.trunc(Number(r.amount) || 0);
    const key = String(r.source_key ?? "");
    if (key.startsWith(WELCOME_EXPIRE_KEY_PREFIX)) {
      const id = key.slice(WELCOME_EXPIRE_KEY_PREFIX.length);
      expiredIds.add(id);
      const lot = byId.get(id);
      if (lot) { lot.remaining = Math.max(0, lot.remaining - Math.abs(amt)); lot.expired = true; }
      continue;
    }
    if (amt > 0) {
      const lot: Lot = { id: String(r.id), remaining: amt, welcome: isWelcomeGrantKey(key), at: r.created_at, expired: false };
      lots.push(lot);
      byId.set(lot.id, lot);
    } else if (amt < 0) {
      let need = -amt;
      for (const lot of lots) {
        if (need <= 0) break;
        if (lot.remaining <= 0) continue;
        const take = Math.min(lot.remaining, need);
        lot.remaining -= take;
        need -= take;
      }
    }
  }
  const cutoff = nowMs - days * DAY_MS;
  let balance = Math.max(0, Math.trunc(Number(currentBalance) || 0));
  const plans: ExpirePlan[] = [];
  for (const lot of lots) {
    if (!lot.welcome || lot.expired || expiredIds.has(lot.id) || lot.remaining <= 0) continue;
    const t = Date.parse(lot.at);
    if (!Number.isFinite(t) || t > cutoff) continue;
    const amount = Math.min(lot.remaining, balance);
    if (amount <= 0) continue;
    balance -= amount;
    plans.push({ grantId: lot.id, amount, grantedAt: lot.at });
  }
  return plans;
}

function kstMonthDay(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export type ExpireRunResult = { phones: number; expired: number; points: number; failed: number; error?: string };

/** 하루 한 번 cron 이 부름. 지급 30~90일 지난 시청 선물만 봄(매일 돌므로 그 사이에 처리됨). */
export async function runWelcomeExpiry(sb: SupabaseClient, nowMs = Date.now(), maxPhones = 300): Promise<ExpireRunResult> {
  const result: ExpireRunResult = { phones: 0, expired: 0, points: 0, failed: 0 };
  const cutoffIso = new Date(nowMs - WELCOME_EXPIRE_DAYS * DAY_MS).toISOString();
  const floorIso = new Date(nowMs - 90 * DAY_MS).toISOString();
  const { data: grants, error } = await sb.from("customer_point_ledger")
    .select("id,customer_phone,source_key")
    .eq("change_type", "grant")
    .like("source_key", "welcome%")
    .lte("created_at", cutoffIso)
    .gte("created_at", floorIso)
    .limit(5000);
  if (error) return { ...result, error: error.message };
  const welcome = ((grants ?? []) as { id: string; customer_phone: string; source_key: string }[]).filter((g) => isWelcomeGrantKey(g.source_key));
  if (!welcome.length) return result;
  // 이미 없앤 지급은 빼기
  const done = new Set<string>();
  const ids = welcome.map((g) => String(g.id));
  for (let i = 0; i < ids.length; i += 200) {
    const keys = ids.slice(i, i + 200).map((id) => WELCOME_EXPIRE_KEY_PREFIX + id);
    const { data, error: e2 } = await sb.from("customer_point_ledger").select("source_key").in("source_key", keys);
    if (e2) return { ...result, error: e2.message };
    for (const r of (data ?? []) as { source_key: string }[]) done.add(String(r.source_key).slice(WELCOME_EXPIRE_KEY_PREFIX.length));
  }
  const phones = Array.from(new Set(welcome.filter((g) => !done.has(String(g.id))).map((g) => String(g.customer_phone)))).slice(0, maxPhones);
  for (const phone of phones) {
    result.phones += 1;
    const [{ data: rows, error: e3 }, { data: bal, error: e4 }] = await Promise.all([
      sb.from("customer_point_ledger").select("id,amount,created_at,source_key").eq("customer_phone", phone).order("created_at", { ascending: true }).limit(2000),
      sb.from("customer_point_balances").select("current_points,youtube_nickname,customer_name").eq("customer_phone", phone).maybeSingle(),
    ]);
    if (e3 || e4) { result.failed += 1; continue; }
    const b = (bal || {}) as { current_points?: number; youtube_nickname?: string; customer_name?: string };
    const plans = planWelcomeExpiry((rows ?? []) as LedgerRow[], Number(b.current_points) || 0, nowMs);
    for (const p of plans) {
      const { data: res, error: e5 } = await sb.rpc("admin_change_customer_points", {
        p_phone: phone, p_action: "deduct", p_amount: p.amount,
        p_reason: `시청 선물 유효기간 만료 (${kstMonthDay(p.grantedAt)} 지급분)`,
        p_admin_memo: "시청 선물 30일 지나 자동 소멸",
        p_nickname: b.youtube_nickname || "", p_customer_name: b.customer_name || "",
        p_customer_visible: true, p_source_key: WELCOME_EXPIRE_KEY_PREFIX + p.grantId,
      });
      const d = (res || null) as { ok?: unknown; duplicate?: unknown } | null;
      if (e5 || !d || d.ok !== true) { result.failed += 1; continue; }
      if (d.duplicate !== true) { result.expired += 1; result.points += p.amount; }
    }
  }
  return result;
}
