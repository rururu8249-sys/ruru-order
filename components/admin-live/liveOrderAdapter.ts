import type { OrderGroup, OrderRow } from "@/lib/admin-v2/types";
import {
  buildItemSummary,
  buildProductSummaryFromRow,
  getAdminMemo,
  getLegacyProductMemo,
  getShippingRequestMemo,
  getSpecialNote,
  groupNetSalesAmount,
  isBankPaid,
  isBankUnpaid,
  isCardPaid,
  isCardUnpaid,
  orderBaseAmount,
  paymentStatusMeta,
} from "@/lib/admin-v2/orderHelpers";
import type { LiveOrder, LiveOrderItem, LiveOrderPaymentStatus } from "./types";

function safeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    const text = String(value);
    return text.includes(":") ? text.slice(11, 16) || text.slice(0, 5) : text;
  }

  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getGroupId(order: OrderRow) {
  return String(order.order_group_id || order.order_lookup_code || order.id || "");
}

export function buildAdminLiveOrderGroups(orders: OrderRow[]): OrderGroup[] {
  const map = new Map<string, OrderRow[]>();

  orders.forEach((order) => {
    const groupId = getGroupId(order);
    if (!groupId) return;
    if (!map.has(groupId)) map.set(groupId, []);
    map.get(groupId)?.push(order);
  });

  return Array.from(map.entries()).map(([groupId, rows]) => {
    const sortedRows = [...rows].sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    const group: OrderGroup = {
      groupId,
      first: sortedRows[0],
      rows: sortedRows,
      totalAmount: 0,
      totalQty: sortedRows.reduce((sum, row) => sum + safeNumber(row.qty || 0), 0),
    };

    return {
      ...group,
      totalAmount: groupNetSalesAmount(group),
    };
  });
}

function getPaymentStatus(group: OrderGroup): LiveOrderPaymentStatus {
  const first = group.first;
  const status = String(first.admin_order_status_v2 || first.order_manage_status || "").trim();

  if (isCardPaid(first)) return "card_paid";
  if (isCardUnpaid(first)) return "card_unpaid";
  if (status === "자동입금확인") return "auto_paid";
  if (status === "수동입금확인") return "manual_paid";
  if (isBankPaid(first)) return "paid";
  if (isBankUnpaid(first)) return "manual_match_needed";

  return "unpaid";
}

function getGroupShippingFee(group: OrderGroup) {
  return group.rows.reduce((sum, row) => {
    const fee = row.adjusted_shipping_fee ?? row.shipping_fee ?? 0;
    return sum + safeNumber(fee);
  }, 0);
}

function getGroupProductAmount(group: OrderGroup) {
  return group.rows.reduce((sum, row) => {
    const explicitProductAmount = row.adjusted_product_price ?? row.product_price;

    if (explicitProductAmount !== null && explicitProductAmount !== undefined) {
      return sum + safeNumber(explicitProductAmount);
    }

    const shippingFee = safeNumber(row.adjusted_shipping_fee ?? row.shipping_fee ?? 0);
    return sum + Math.max(0, orderBaseAmount(row) - shippingFee);
  }, 0);
}

function buildItem(row: OrderRow): LiveOrderItem {
  const optionParts = [row.color, row.size]
    .map((value) => String(value || "").trim())
    .filter((value) => value && value !== "없음");

  const shippingFee = safeNumber(row.adjusted_shipping_fee ?? row.shipping_fee ?? 0);
  const productAmount =
    row.adjusted_product_price !== null && row.adjusted_product_price !== undefined
      ? safeNumber(row.adjusted_product_price)
      : row.product_price !== null && row.product_price !== undefined
        ? safeNumber(row.product_price)
        : Math.max(0, orderBaseAmount(row) - shippingFee);

  return {
    id: String(row.id),
    productName: row.product_name || "상품명 없음",
    optionText: optionParts.join(" / ") || "옵션 없음",
    qty: safeNumber(row.qty || 1) || 1,
    amount: productAmount,
  };
}

function getMemo(group: OrderGroup) {
  const first = group.first;
  return (
    getShippingRequestMemo(first) ||
    getSpecialNote(first) ||
    getAdminMemo(first) ||
    getLegacyProductMemo(first) ||
    ""
  );
}

export function toAdminLiveOrder(group: OrderGroup): LiveOrder {
  const first = group.first;
  const meta = paymentStatusMeta(first);
  const paymentStatus = getPaymentStatus(group);
  const items = group.rows.map(buildItem);

  return {
    id: group.groupId,
    groupId: group.groupId,
    rowIds: group.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)),
    orderNo: first.order_lookup_code || group.groupId || String(first.id || "-"),
    paymentStatus,
    paymentLabel: meta.label,
    submittedAt: formatTime(first.created_at),
    paidAt: first.deposit_confirmed_at ? formatTime(first.deposit_confirmed_at) : null,
    nickname: first.youtube_nickname || first.customer_name || "-",
    name: first.customer_name || "-",
    phone: first.customer_phone || first.phone || "-",
    paymentMethod: first.payment_method || "무통장입금",
    orderSummary: buildItemSummary(group),
    productAmount: getGroupProductAmount(group),
    shippingFee: getGroupShippingFee(group),
    totalAmount: group.totalAmount,
    memo: getMemo(group),
    items,
  };
}

export function sortLiveOrdersByCreatedDesc(groups: OrderGroup[]) {
  return [...groups].sort((a, b) => {
    const aTime = new Date(a.first.created_at || 0).getTime();
    const bTime = new Date(b.first.created_at || 0).getTime();
    return bTime - aTime;
  });
}

export function buildCompactSummaryFromGroup(group: OrderGroup) {
  return buildProductSummaryFromRow(group.rows[0]);
}
