import type { LiveOrder, LiveOrderItem } from "@/components/admin-live/types";

export type PickingPaymentDateFilter = "all_paid" | "today_paid" | "late_paid";
export type PickingAttentionKind = "late_paid" | "payment_time_missing" | "repick" | null;

const PAID_STATUSES = new Set(["paid", "auto_paid", "manual_paid", "card_paid"]);

export function kstDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isPaidPickingOrder(order: Pick<LiveOrder, "paymentStatus">): boolean {
  return PAID_STATUSES.has(order.paymentStatus);
}

function hasOpenRepick(item: LiveOrderItem): boolean {
  if (!item.repickRequiredAt) return false;
  if (!item.repickResolvedAt) return true;
  return Date.parse(item.repickResolvedAt) < Date.parse(item.repickRequiredAt);
}

export function classifyPickingAttention(
  order: Pick<LiveOrder, "createdAt" | "submittedAt" | "paidAt" | "paidAtFull" | "paymentStatus">,
  item: LiveOrderItem,
): PickingAttentionKind {
  if (hasOpenRepick(item)) return "repick";
  if (item.pickedAt || !isPaidPickingOrder(order)) return null;
  if (order.paymentStatus === "card_paid" && !order.paidAtFull && !order.paidAt) return "payment_time_missing";
  const orderedDate = kstDateKey(order.createdAt || order.submittedAt);
  const paidDate = kstDateKey(order.paidAtFull || order.paidAt);
  return orderedDate && paidDate && paidDate > orderedDate ? "late_paid" : null;
}

export type PickingWorkspaceFilter = {
  broadcastIds?: readonly string[];
  paymentDateFilter: PickingPaymentDateFilter;
  today?: string | Date;
  attentionOnly?: boolean;
};

export function filterPickingWorkspaceOrders(
  orders: readonly LiveOrder[],
  options: PickingWorkspaceFilter,
): LiveOrder[] {
  const selected = new Set((options.broadcastIds || []).filter(Boolean));
  const today = kstDateKey(options.today || new Date());

  return orders.flatMap((order) => {
    if (order.paymentStatus === "canceled" || order.excludeFromPicking || !isPaidPickingOrder(order)) return [];
    if (selected.size && (!order.broadcastId || !selected.has(order.broadcastId))) return [];
    const paidDate = kstDateKey(order.paidAtFull || order.paidAt);
    const orderedDate = kstDateKey(order.createdAt || order.submittedAt);
    if (options.paymentDateFilter === "today_paid" && paidDate !== today) return [];
    if (options.paymentDateFilter === "late_paid" && !(orderedDate && paidDate && paidDate > orderedDate)) return [];
    const items = options.attentionOnly
      ? order.items.filter((item) => classifyPickingAttention(order, item) !== null)
      : order.items;
    return items.length ? [{ ...order, items }] : [];
  });
}

type BroadcastDateItem = {
  id: string;
  startedAt?: string | null;
  started_at?: string | null;
};

export function selectBroadcastIdsForDateKeys(
  broadcasts: readonly BroadcastDateItem[],
  dateKeys: readonly string[],
): string[] {
  const wanted = new Set(dateKeys);
  return broadcasts
    .filter((broadcast) => wanted.has(kstDateKey(broadcast.startedAt || broadcast.started_at) || ""))
    .map((broadcast) => broadcast.id);
}
