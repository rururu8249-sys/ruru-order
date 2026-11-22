export type OrderSubmitAmounts = {
  productAmount: number;
  shippingFee: number;
  cardExtra: number;
  totalAmount: number;
  customerCardRate: number;
};

/** Existing-order acknowledgements must display what was saved, even when
 * the same cart is now eligible for combined shipping or a different rate.
 */
export function readOrderSubmitAmounts(
  payload: Record<string, unknown>,
  fallback: OrderSubmitAmounts,
): OrderSubmitAmounts {
  if (payload.duplicate !== true) return fallback;
  const raw = payload.order_summary;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("접수된 주문의 금액을 확인하지 못했습니다. 주문내역을 확인해 주세요.");
  }
  const summary = raw as Record<string, unknown>;
  const read = (key: keyof OrderSubmitAmounts) => {
    const value = summary[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
        (key !== "customerCardRate" && !Number.isSafeInteger(value))) {
      throw new Error("접수된 주문의 금액을 확인하지 못했습니다. 주문내역을 확인해 주세요.");
    }
    return value;
  };
  const result = {
    productAmount: read("productAmount"), shippingFee: read("shippingFee"),
    cardExtra: read("cardExtra"), totalAmount: read("totalAmount"),
    customerCardRate: read("customerCardRate"),
  };
  if (result.productAmount + result.shippingFee + result.cardExtra !== result.totalAmount ||
      result.totalAmount !== Number(payload.point_original_amount)) {
    throw new Error("접수된 주문의 금액을 확인하지 못했습니다. 주문내역을 확인해 주세요.");
  }
  return result;
}
