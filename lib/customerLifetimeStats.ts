/** Full-history member stats. Shared by list API and the member detail panel.
 * Read-only: never mutates orders, payments, points or customer identity.
 * Order count = distinct order forms; payment = sum of final item amounts for paid forms.
 */
export type LifetimeOrderRow = {
  id?: string | number | null;
  order_group_id?: string | null;
  created_at?: string | null;
  kakao_id?: string | null;
  customer_phone?: string | null;
  is_deleted?: boolean | null;
  final_amount?: number | string | null;
  adjusted_total_price?: number | string | null;
  total_price?: number | string | null;
  order_manage_status?: string | null;
  shipping_status?: string | null;
  admin_order_status_v2?: string | null;
};
export type LifetimeMemberRef = { id?: string | number | null; kakao_id?: string | null; customer_phone?: string | null };
export type LifetimeStats = {
  all: number; paid: number; unpaid: number; canceled: number; paidAmount: number; totalAmount: number;
  latestOrderAt: string; manualNeededCount: number;
};
export const EMPTY_LIFETIME_STATS: LifetimeStats = Object.freeze({
  all: 0, paid: 0, unpaid: 0, canceled: 0, paidAmount: 0, totalAmount: 0, latestOrderAt: '', manualNeededCount: 0,
});
const txt = (v: unknown) => String(v ?? '').trim();
const digits = (v: unknown) => txt(v).replace(/\D/g, '');
const amountNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export type LifetimeOrderKind = 'paid' | 'unpaid' | 'canceled';
export function classifyLifetimeOrder(text: string): { kind: LifetimeOrderKind; label: string } {
  const s = txt(text).toLowerCase();
  if (/주문서취소|주문취소|취소|환불|cancel|refund/.test(s)) return { kind: 'canceled', label: '주문서취소' };
  if (/manual_match_needed|입금확인 필요|입금매칭 필요|수동확인/.test(s)) return { kind: 'unpaid', label: '매칭필요' };
  if (/card_unpaid|카드 미결제|카드미결제/.test(s)) return { kind: 'unpaid', label: '카드미결제' };
  // Keep the existing member-list payment contract: explicit unpaid wins.
  // "unpaid" contains "paid", and shipping wait is not payment completion.
  if (/unpaid|미입금|입금대기|결제대기/.test(s)) return { kind: 'unpaid', label: '미입금' };
  if (/카드결제완료|card_paid/.test(s)) return { kind: 'paid', label: '카드결제완료' };
  if (/자동입금확인|auto_paid/.test(s)) return { kind: 'paid', label: '자동입금확인' };
  if (/수동입금확인|manual_paid/.test(s)) return { kind: 'paid', label: '수동입금확인' };
  if (/입금확인|결제완료|출고완료|택배출고|paid/.test(s)) return { kind: 'paid', label: '입금확인' };
  return { kind: 'unpaid', label: '미입금' };
}
export function lifetimeLineAmount(row: LifetimeOrderRow): number {
  const v = row.final_amount;
  if (v !== null && v !== undefined && Number.isFinite(Number(v))) return amountNum(v);
  return amountNum(row.adjusted_total_price ?? row.total_price ?? 0);
}
export const lifetimeGroupKey = (row: LifetimeOrderRow) => txt(row.order_group_id) || `id:${row.id ?? ''}`;
export function lifetimeStatusText(row: LifetimeOrderRow): string {
  return [row.order_manage_status,row.shipping_status,row.admin_order_status_v2].map(txt).filter(Boolean).join(' ');
}
export function calculateLifetimeStats(rows: readonly LifetimeOrderRow[]): LifetimeStats {
  const grouped = new Map<string, LifetimeOrderRow[]>();
  for (const row of rows) {
    if (row.is_deleted === true) continue;
    const k = lifetimeGroupKey(row);
    const previous = grouped.get(k);
    if (previous) previous.push(row); else grouped.set(k,[row]);
  }
  const result: LifetimeStats = {...EMPTY_LIFETIME_STATS};
  for (const group of grouped.values()) {
    result.all++;
    const status = group.map(lifetimeStatusText).join(' ');
    const kind = classifyLifetimeOrder(status).kind;
    result[kind]++;
    const groupAmount=group.reduce((s,row)=>s+lifetimeLineAmount(row),0);
    result.totalAmount+=groupAmount;
    if (kind === 'paid') result.paidAmount+=groupAmount;
    if (/manual_match_needed|입금확인 필요|입금매칭 필요|수동확인/i.test(status) && kind !== 'canceled') result.manualNeededCount++;
    for (const item of group) {
      const date = txt(item.created_at);
      if (date>result.latestOrderAt) result.latestOrderAt=date;
    }
  }
  return result;
}
/**
 * Assign orders to member profiles without crossing two different Kakao identities.
 * A Kakao-linked order belongs to that Kakao account (phone changes are allowed).
 * An old unlinked order may use a phone only if the phone has an unambiguous owner.
 * Unmatched/ambiguous rows are audited, not silently assigned to another person.
 */
export function buildLifetimeStatsByProfile(profiles: readonly LifetimeMemberRef[], orders: readonly LifetimeOrderRow[]) {
  const byKakao = new Map<string,Set<string>>();
  const byPhone = new Map<string,Set<string>>();
  const owner = new Map<string,LifetimeMemberRef>();
  for (const profile of profiles) {
    const id = txt(profile.id);
    if (!id) continue;
    owner.set(id,profile);
    const kid=txt(profile.kakao_id),phone=digits(profile.customer_phone);
    if(kid){if(!byKakao.has(kid))byKakao.set(kid,new Set());byKakao.get(kid)!.add(id);}
    if(phone){if(!byPhone.has(phone))byPhone.set(phone,new Set());byPhone.get(phone)!.add(id);}
  }
  const history = new Map<string,LifetimeOrderRow[]>();
  let unmatchedRows=0, ambiguousRows=0, matchedRows=0;
  for (const row of orders) {
    if (row.is_deleted === true) continue;
    const kid=txt(row.kakao_id),phone=digits(row.customer_phone);
    let ids: Set<string> | undefined;
    if(kid && byKakao.has(kid)) ids=byKakao.get(kid);
    else if(phone) ids=byPhone.get(phone);
    if(!ids||ids.size===0){unmatchedRows++;continue;}
    // Different logged-in Kakao identities with the same phone must not be merged.
    const permitted=[...ids].filter(id=>{
      const profileKid=txt(owner.get(id)?.kakao_id);
      return !kid||!profileKid||kid===profileKid;
    });
    const distinctLinkedOwners=new Set(permitted.map(id=>txt(owner.get(id)?.kakao_id)).filter(Boolean));
    if(permitted.length===0){unmatchedRows++;continue;}
    if(distinctLinkedOwners.size>1){ambiguousRows++;continue;}
    matchedRows++;
    for(const id of permitted){const arr=history.get(id);if(arr)arr.push(row);else history.set(id,[row]);}
  }
  const byProfile:Record<string,LifetimeStats>={};
  for(const [id,items] of history) byProfile[id]=calculateLifetimeStats(items);
  return {byProfile,matchedRows,unmatchedRows,ambiguousRows,profileCount:owner.size,orderRows:orders.length};
}
