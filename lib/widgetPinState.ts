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

export function widgetPinTargetBroadcastId(selectedBroadcastId: unknown, activeBroadcastId: unknown): string {
  const selected = String(selectedBroadcastId ?? "").trim();
  const active = String(activeBroadcastId ?? "").trim();
  return selected && active && selected === active ? active : "";
}
