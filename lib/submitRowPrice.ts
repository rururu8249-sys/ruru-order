// [2026-09-20 위험분석 후 승인] 주문 저장 API 가 손님 payload 의 금액 칸을 읽는 규칙 — 한 곳에 모아 둔다.
//
//   손님 화면(app/order/page.tsx 제출 payload)은
//     product_price          = 단가
//     adjusted_product_price = 단가 × 수량 = «줄 합계»
//   를 보낸다. 관리자 화면·정산·채팅 문구도 전부 adjusted_product_price 를 줄 합계로 본다.
//   예전 route.ts 는 이 값을 «단가»로 읽어 (A) 배송비 0원 설정일 때 줄 합계×수량으로 부풀리고,
//   (B) 금액 검증에서 줄 합계를 단가 하한과 비교해 수량이 많을수록 느슨해지는 문제가 있었다.
//
//   ⚠️ 돈 경로. 여기 함수는 payload 를 «읽기만» 하며 값을 만들어내지 않는다.

type AnyRow = Record<string, any>;

function num(value: unknown, fallback: number): number {
  const n =
    typeof value === "number" ? value
    : typeof value === "string" ? Number(value.replace(/,/g, ""))
    : Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function submitRowQty(row: AnyRow | null | undefined): number {
  return Math.max(1, Math.round(num(row?.qty, 1)));
}

// 줄 합계(상품금액, 배송비·카드수수료 제외). adjusted_product_price 가 있으면 그대로, 없으면 단가 × 수량.
export function submitRowLineTotal(row: AnyRow | null | undefined): number {
  if (present(row?.adjusted_product_price)) {
    const n = num(row?.adjusted_product_price, NaN);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return Math.max(0, Math.floor(num(row?.product_price, 0) * submitRowQty(row)));
}

// 검증용 단가 — 실제로 돈이 되는 줄 합계를 수량으로 나눈 값과, 손님이 보낸 단가 중 «더 작은 쪽».
//   둘 중 하나만 낮게 조작해도 걸리게 하기 위함. (정상 주문은 두 값이 같다)
export function submitRowUnitPriceForCheck(row: AnyRow | null | undefined): number {
  const qty = submitRowQty(row);
  const fromLine = Math.floor(submitRowLineTotal(row) / qty);
  if (present(row?.product_price)) {
    const unit = num(row?.product_price, NaN);
    if (Number.isFinite(unit) && unit >= 0) return Math.min(fromLine, Math.floor(unit));
  }
  return fromLine;
}
