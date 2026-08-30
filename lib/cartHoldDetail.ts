const EMPTY = new Set(["", "없음", "없슴", "무", "-", "none", "n/a", "na", "null", "undefined"]);

const text = (value: unknown, max = 180) => String(value ?? "").trim().slice(0, max);
const meaningful = (value: unknown) => {
  const t = text(value, 120);
  return EMPTY.has(t.toLowerCase()) ? "" : t;
};
const positiveInt = (value: unknown, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, Math.floor(n));
};

export type CartHoldSnapshotItem = {
  productId: string;
  productName: string;
  color: string;
  size: string;
  qty: number;
  unitPrice: number | null;
};

export function buildCartHoldSnapshotItem(item: Record<string, unknown>): CartHoldSnapshotItem {
  return {
    productId: text(item.product_id ?? item.productId, 80),
    productName: text(item.product_name ?? item.productName, 180),
    color: meaningful(item.color).slice(0, 60),
    size: meaningful(item.size).slice(0, 60),
    qty: positiveInt(item.qty, 99),
    unitPrice: (() => {
      const raw = item.product_price ?? item.unitPrice;
      if (raw === null || raw === undefined || String(raw).trim() === "") return null;
      if (String(raw).replace(/[^0-9.-]/g, "").trim() === "") return null;
      const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.min(100_000_000, Math.floor(n));
    })(),
  };
}

export type CartHoldPresentationInput = {
  productName?: unknown;
  fallbackProductName?: unknown;
  color?: unknown;
  size?: unknown;
  qty?: unknown;
  unitPrice?: unknown;
  legacySnapshot?: boolean;
};

export function cartHoldPresentation(input: CartHoldPresentationInput) {
  const productName = text(input.productName, 180);
  const fallback = text(input.fallbackProductName, 180) || "상품";
  const qty = positiveInt(input.qty, 99);
  const rawUnit = input.unitPrice;
  const unitPrice = rawUnit === null || rawUnit === undefined || String(rawUnit).trim() === ""
    ? null
    : positiveInt(rawUnit, 100_000_000);
  const options = [meaningful(input.color), meaningful(input.size)].filter(Boolean);
  return {
    title: productName || fallback,
    optionText: options.join(" · "),
    qty,
    unitPrice,
    rowTotal: unitPrice === null ? null : unitPrice * qty,
    legacySnapshot: Boolean(input.legacySnapshot || !productName),
  };
}

export function checkoutReminderCopy() {
  return {
    title: "🛒 주문 확인이 필요해요",
    // [2026-08-31 사장님 지적] "선점 시간"은 손님이 못 알아듣는 말 — 누구나 아는 말로.
    message: "장바구니에 담아두신 상품이 아직 주문 완료 전이에요. 시간이 지나면 장바구니가 자동으로 비워져요. 지금 주문서를 제출하고 결제까지 마쳐주세요 🙂",
  };
}
