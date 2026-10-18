// [㉛ 2026-10-17] 장바구니 「비움 기록」(cart_clear_marks) 판단 — 순수 함수(DB·화면 무관).
//   관리자 비우기·제출·만료 뒤 옛 장바구니가 다른 탭·다른 브라우저에서 되살아나지 않게, 서버가 기준을 쥔다.
//   손님 화면은 상품을 담을 때 그때 알던 「현재 seq」를 상품에 붙이고(cartSeq), 서버는
//   이 손님에게 그보다 큰 seq 의 비움 기록이 있으면 그 줄을 거절한다. 비운 뒤 새로 담은 줄은 seq 가 커서 통과.
//   표시용 선점 전용 — 주문·재고·금액·입금·포인트 무관.

export type CartClearReason = "admin_clear" | "admin_clear_all" | "submitted" | "expired";
export type CartClearMark = {
  seq: number;
  reason?: CartClearReason | string | null;
  session_key?: string | null;
  kakao_id?: string | null;
  customer_phone?: string | null;
  product_id?: string | null;
  color?: string | null;
  size?: string | null;
};

export type CartIdentity = { sessionKey: string; kakaoId?: string | null; phone?: string | null };

export type CartSeqItem = { productId: string; color: string; size: string; cartSeq: number };

const clean = (v: unknown) => String(v ?? "").trim();
/** 옵션 정규화 — 담기 선점(buildCartHoldSnapshotItem·claim_cart_hold)과 같은 규칙: 공백 제거, 「없음」→"". */
export const normCartOpt = (v: unknown) => {
  const t = clean(v);
  return t === "없음" ? "" : t;
};
const digits = (v: unknown) => clean(v).replace(/[^0-9]/g, "");

/**
 * 이 비움 기록이 이 손님 것인가.
 *   ① 세션키가 같으면 항상 해당.
 *   ② 둘 다 kakao_id 가 있으면 kakao_id 로만 판단(전화는 바뀔 수 있는 정보 — 고객 식별 원칙).
 *   ③ 어느 한쪽이라도 kakao_id 가 없을 때만 전화번호(숫자만)로 판단.
 */
export function cartMarkMatchesIdentity(mark: CartClearMark, who: CartIdentity): boolean {
  const session = clean(who.sessionKey);
  if (session && clean(mark.session_key) === session) return true;
  const markKakao = clean(mark.kakao_id);
  const whoKakao = clean(who.kakaoId);
  if (markKakao && whoKakao) return markKakao === whoKakao;
  const markPhone = digits(mark.customer_phone);
  const whoPhone = digits(who.phone);
  return markPhone.length >= 9 && markPhone === whoPhone;
}

/** 이 비움 기록이 이 상품·옵션에 해당하는가(product_id 비어 있으면 장바구니 전체). */
export function cartMarkMatchesItem(mark: CartClearMark, item: Pick<CartSeqItem, "productId" | "color" | "size">): boolean {
  const pid = clean(mark.product_id);
  if (!pid) return true;
  return pid === clean(item.productId) && normCartOpt(mark.color) === normCartOpt(item.color) && normCartOpt(mark.size) === normCartOpt(item.size);
}

/** 손님 화면이 「이번 화면에서 새로 담았고 아직 번호 전」인 줄을 보내는 값(-1). 서버는 «지금» 담은 것으로 본다. */
export const CART_SEQ_NEW = -1;

/**
 * 이 줄을 거절하게 만든 비움 기록(가장 큰 seq). 없으면 null.
 *   item.cartSeq 보다 큰 seq 의 해당 기록이 하나라도 있으면 거절(그 상품을 담은 «뒤에» 비워졌다는 뜻).
 *   cartSeq 가 CART_SEQ_NEW(-1)면 방금 담은 줄 → 거절하지 않는다. 없음·0 = 옛 장바구니 → 모든 기록 대상.
 *   돌려주는 reason 으로 손님 안내를 고른다(제출 후 정리는 조용히, 관리자 비우기·만료만 안내).
 */
export function cartItemClearedBy(item: CartSeqItem, marks: readonly CartClearMark[], who: CartIdentity): { seq: number; reason: string } | null {
  if (item.cartSeq === CART_SEQ_NEW) return null;
  const itemSeq = Number.isFinite(item.cartSeq) && item.cartSeq > 0 ? item.cartSeq : 0;
  let hit: { seq: number; reason: string } | null = null;
  for (const mark of marks) {
    const seq = Number(mark.seq) || 0;
    if (seq <= itemSeq || (hit && seq <= hit.seq)) continue;
    if (!cartMarkMatchesItem(mark, item) || !cartMarkMatchesIdentity(mark, who)) continue;
    hit = { seq, reason: String(mark.reason || "") };
  }
  return hit;
}

/** 손님에게 「시간이 지나 비워졌어요」 안내를 보여줄 이유인가(관리자 비우기·만료). 제출 후 정리는 안내 없음. */
export function cartClearNeedsNotice(reason: string): boolean {
  return reason === "admin_clear" || reason === "admin_clear_all" || reason === "expired";
}

/**
 * 임시 장바구니(localStorage)에 저장된 담은 번호 해석 — 숫자(≥0)=그 번호로 담음,
 *   -1(CART_SEQ_NEW)=화면에서 담았지만 아직 번호 전(복원 때 「새로 담음」으로), 없음·이상한 값=옛 임시 장바구니(0).
 */
export function readCartSeqField(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? -1 : Math.floor(n);
}

type ProductLike = { status?: unknown; is_visible?: unknown; product_note?: unknown } | null | undefined;

function suggestionEnabled(note: unknown): boolean {
  let parsed: unknown = note;
  if (typeof note === "string") {
    const t = note.trim();
    if (!t) return true;
    try { parsed = JSON.parse(t); } catch { return true; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return true;
  return (parsed as { name_suggestion_enabled?: unknown }).name_suggestion_enabled !== false;
}

/**
 * 손님 화면에서 «담을 수 없는» 상품인가 — 손님 주문서 규칙(order/page.tsx)과 똑같이:
 *   그리드 = status 숨김·deleted 제외 + is_visible=false 제외 / 검색 = deleted 제외 + 검색 노출(name_suggestion_enabled) 켜진 것.
 *   → 상품 행 없음 · deleted · (숨김 또는 is_visible=false 이면서 검색 노출도 꺼짐) 만 거절. 검색으로 담을 수 있으면 허용.
 */
export function cartProductUnavailable(product: ProductLike): boolean {
  if (!product) return true;
  const status = clean(product.status);
  if (status === "deleted") return true;
  const hiddenFromGrid = status === "숨김" || product.is_visible === false;
  return hiddenFromGrid && !suggestionEnabled(product.product_note);
}
