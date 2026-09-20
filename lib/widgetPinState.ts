export type WidgetPinExpected = { productId: string; detailName?: string };

type WidgetPinRow = {
  widget_pin_mode?: unknown;
  widget_pin_product_id?: unknown;
  widget_pin_detail_name?: unknown;
};

export function savedWidgetPinMatches(row: WidgetPinRow | null | undefined, expected: WidgetPinExpected): boolean {
  if (!row) return false;
  const mode = String(row.widget_pin_mode || "auto").trim().toLowerCase();
  const productId = String(row.widget_pin_product_id ?? "").trim();
  const detailName = String(row.widget_pin_detail_name ?? "").trim();
  return mode === "pin" && productId === String(expected.productId || "").trim() && detailName === String(expected.detailName || "").trim();
}

export function savedWidgetAutoMatches(row: WidgetPinRow | null | undefined): boolean {
  if (!row) return false;
  const mode = String(row.widget_pin_mode || "auto").trim().toLowerCase();
  const productId = String(row.widget_pin_product_id ?? "").trim();
  const detailName = String(row.widget_pin_detail_name ?? "").trim();
  return mode === "auto" && !productId && !detailName;
}

// [2026-09-20 사장님] 「위젯 고정하면 고객 페이지에서도 맨 처음 보여야 하는 것 아니냐」
//   맞는 지적이었다. 고객 페이지(app/order/page.tsx)는 정렬·「라이브 소개중」 배지를
//   «죽은 컬럼» products.is_pinned 로 판단하고 있었다(저장 위치를 broadcasts.widget_pin_* 로
//   옮기면서 고객 쪽을 같이 안 바꾼 것). 이제 양쪽이 이 함수 하나를 본다.
/** 지금 방송에 «고정된» 상품 id. 고정 모드가 아니면 빈 문자열. */
export function widgetPinnedProductId(row: WidgetPinRow | null | undefined): string {
  if (!row) return "";
  if (String(row.widget_pin_mode || "auto").trim().toLowerCase() !== "pin") return "";
  return String(row.widget_pin_product_id ?? "").trim();
}

export function widgetPinTargetBroadcastId(selectedBroadcastId: unknown, activeBroadcastId: unknown): string {
  const selected = String(selectedBroadcastId ?? "").trim();
  const active = String(activeBroadcastId ?? "").trim();
  return selected && active && selected === active ? active : "";
}
