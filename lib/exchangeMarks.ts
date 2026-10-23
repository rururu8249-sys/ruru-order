// [2026-10-23 14:57 사장님 「바꿀 옵션 설정하면 송장에도 교환 상품·사이즈 뭐에서 뭐로 다 보여야」]
//   교환 «바꿀 상품»은 refund_ledger.exchange_option(글자)에만 있다 — 주문 행은 안 바꾼다(재고·금액 무접촉).
//   그래서 물건챙기기·송장·주문서가 같은 표식을 쓰도록 «주문 행 id → 「교환: 아크네 청바지 XS → S」»를 한 곳에서 만든다.
//   진행 중(완료·거절 아님)인 교환 기록만. 기록의 product_snapshot 에 lineId(주문 행 id)가 있는 줄에만 붙인다(추정 매칭 없음).

export type LedgerLike = { kind?: unknown; stage?: unknown; done_at?: unknown; exchange_option?: unknown; product_snapshot?: unknown; order_lookup_code?: unknown };

const s = (v: unknown) => String(v ?? "").trim();

export function exchangeOpen(l: LedgerLike): boolean {
  if (!["교환", "재발송"].includes(s(l.kind))) return false;
  if (s(l.done_at) || ["완료", "거절·취소"].includes(s(l.stage))) return false;
  return Boolean(s(l.exchange_option));
}

/** 주문 행 id → 「교환: …」 */
export function exchangeMarksFromLedgers(ledgers: readonly LedgerLike[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of ledgers) {
    if (!exchangeOpen(l)) continue;
    const snap = Array.isArray(l.product_snapshot) ? (l.product_snapshot as Array<Record<string, unknown>>) : [];
    for (const e of snap) {
      const id = s(e.lineId);
      if (id) out.set(id, `교환: ${s(l.exchange_option)}`);
    }
  }
  return out;
}

/** 관리자 화면에서 주문번호 묶음으로 교환 표식 받기(refund-ledger 라우트 60개씩). 실패하면 빈 표식(화면은 그대로). */
export async function fetchExchangeMarks(orderCodes: readonly string[]): Promise<Map<string, string>> {
  const codes = Array.from(new Set(orderCodes.map(s).filter(Boolean)));
  const all: LedgerLike[] = [];
  try {
    for (let i = 0; i < codes.length; i += 60) {
      const res = await fetch(`/api/admin-live/refund-ledger?orderCodes=${encodeURIComponent(codes.slice(i, i + 60).join(","))}`, { cache: "no-store" });
      const p = await res.json().catch(() => null) as { ok?: boolean; items?: LedgerLike[] } | null;
      if (p?.ok && Array.isArray(p.items)) all.push(...p.items);
    }
  } catch { /* 보조 표시 — 실패해도 목록은 정상 */ }
  return exchangeMarksFromLedgers(all);
}
