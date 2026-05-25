import type { LiveOrder } from "./types";

export function canSoftHideLiveOrder(order: LiveOrder) {
  return order.paymentStatus === "canceled";
}
