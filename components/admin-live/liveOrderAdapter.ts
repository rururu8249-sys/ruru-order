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
import { isCanceledStatus } from "@/lib/admin-v2/statusDisplay";

function safeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTruthyTestOrderFlag(value: unknown) {
  return value === true || value === "true" || value === "t" || value === 1 || value === "1";
}

function cleanTestOrderText(value: unknown) {
  return String(value ?? "").trim();
}

function firstTextFromGroupRows(group: OrderGroup, key: string) {
  for (const row of group.rows || []) {
    const value = cleanTestOrderText((row as any)[key]);
    if (value) return value;
  }

  return null;
}

function groupHasTruthyFlag(group: OrderGroup, key: string) {
  return (group.rows || []).some((row) => isTruthyTestOrderFlag((row as any)[key]));
}

function parseItemChangeHistory(value: unknown) {
  if (Array.isArray(value)) return value;

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getItemEditCounts(row: OrderRow) {
  const history = parseItemChangeHistory((row as any).item_change_history);

  return {
    productEditCount: history.filter((entry: any) => entry?.product_changed || entry?.productChanged).length,
    amountEditCount: history.filter((entry: any) => entry?.amount_changed || entry?.amountChanged).length,
  };
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


function isCanceledStatusText(value: unknown) {
  const text = String(value || "").trim();
  return text === "주문취소" || text === "주문서취소" || text.includes("주문취소") || text.includes("주문서취소");
}

function getPaymentStatus(group: OrderGroup): LiveOrderPaymentStatus {
  const first = group.first;
  const adminStatus = String(first.admin_order_status_v2 || "").trim();
  const manageStatus = String(first.order_manage_status || "").trim();
  const status = adminStatus || manageStatus;
  if (isCanceledStatusText(adminStatus) || isCanceledStatusText(manageStatus)) return "canceled";

  if (isCanceledStatus(adminStatus) || isCanceledStatus(manageStatus)) return "canceled";
  if (isCardPaid(first)) return "card_paid";
  if (isCardUnpaid(first)) return "card_unpaid";
  if (status === "자동입금확인") return "auto_paid";
  if (status === "수동입금확인") return "manual_paid";
  if (isBankPaid(first)) return "paid";
  if (isBankUnpaid(first)) return "manual_match_needed";

  return "unpaid";
}


function isCardPaymentGroup(group: any) {
  const first = Array.isArray(group?.rows) ? group.rows[0] : null;
  const method = String(first?.payment_method ?? first?.paymentMethod ?? first?.payment_type ?? "");
  return method.includes("카드");
}

function getGroupCardExtraAmount(group: any) {
  const rows = Array.isArray(group?.rows) ? group.rows : [];
  return rows.reduce((sum: number, row: any) => {
    return sum + safeNumber(row.vat_amount ?? row.vatAmount ?? 0);
  }, 0);
}

function getRowCardTotalAmount(row: any) {
  return safeNumber(
    row.final_amount ??
      row.finalAmount ??
      row.adjusted_total_price ??
      row.adjustedTotalPrice ??
      row.total_price ??
      row.totalPrice ??
      0
  );
}

function getGroupCardPaymentTotalAmount(group: any) {
  const rows = Array.isArray(group?.rows) ? group.rows : [];
  const summedRowTotal = rows.reduce((sum: number, row: any) => {
    return sum + getRowCardTotalAmount(row);
  }, 0);

  if (summedRowTotal > 0) return summedRowTotal;

  return getGroupProductAmount(group) + getGroupShippingFee(group) + getGroupCardExtraAmount(group);
}

function getGroupDisplayTotalAmount(group: any) {
  if (isCardPaymentGroup(group)) {
    const cardTotal = getGroupCardPaymentTotalAmount(group);
    if (cardTotal > 0) return cardTotal;
  }

  return safeNumber(group?.totalAmount ?? 0);
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
  const color = String(row.color || "").trim();
  const size = String(row.size || "").trim();
  const optionParts = [color, size].filter((value) => value && value !== "없음");

  const qty = safeNumber(row.qty || 1) || 1;
  const shippingFee = safeNumber(row.adjusted_shipping_fee ?? row.shipping_fee ?? 0);
  const productAmount =
    row.adjusted_product_price !== null && row.adjusted_product_price !== undefined
      ? safeNumber(row.adjusted_product_price)
      : row.product_price !== null && row.product_price !== undefined
        ? safeNumber(row.product_price) * qty
        : Math.max(0, orderBaseAmount(row) - shippingFee);

  const unitPrice =
    row.product_price !== null && row.product_price !== undefined
      ? safeNumber(row.product_price)
      : qty > 0
        ? Math.round(productAmount / qty)
        : productAmount;

  const editCounts = getItemEditCounts(row);
  const changeHistory = parseItemChangeHistory((row as any).item_change_history);

  return {
    id: String(row.id),
    productName: row.product_name || "상품명 없음",
    optionText: optionParts.join(" / ") || "옵션 없음",
    color,
    size,
    qty,
    unitPrice,
    amount: productAmount,
    inventoryDeductionStatus: row.inventory_deduction_status || null,
    inventoryDeductionMemo: row.inventory_deduction_memo || null,
    inventoryDeductedAt: row.inventory_deducted_at || null,
    inventoryRestoreStatus: row.inventory_restore_status || null,
    inventoryRestoreMemo: row.inventory_restore_memo || null,
    inventoryRestoredAt: row.inventory_restored_at || null,
    productEditCount: editCounts.productEditCount,
    amountEditCount: editCounts.amountEditCount,
    changeHistory,
  };
}


function getGroupPointOriginalAmount(group: OrderGroup) {
  const rows = Array.isArray(group?.rows) ? group.rows : [];

  return rows.reduce((sum: number, row: any) => {
    return sum + safeNumber(row.point_original_amount ?? row.pointOriginalAmount ?? 0);
  }, 0);
}

function getGroupPointUsedAmount(group: OrderGroup) {
  const rows = Array.isArray(group?.rows) ? group.rows : [];

  return rows.reduce((sum: number, row: any) => {
    return sum + safeNumber(row.point_used_amount ?? row.pointUsedAmount ?? 0);
  }, 0);
}

function getGroupFinalAmount(group: OrderGroup) {
  const rows = Array.isArray(group?.rows) ? group.rows : [];
  const summedFinalAmount = rows.reduce((sum: number, row: any) => {
    return sum + safeNumber(row.final_amount ?? row.finalAmount ?? 0);
  }, 0);

  if (summedFinalAmount > 0) return summedFinalAmount;

  const pointOriginalAmount = getGroupPointOriginalAmount(group);
  const pointUsedAmount = getGroupPointUsedAmount(group);

  if (pointUsedAmount > 0) {
    return Math.max(0, pointOriginalAmount - pointUsedAmount);
  }

  return 0;
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
    createdAt: first.created_at,
    submittedAt: formatTime(first.created_at),
    paidAt: first.deposit_confirmed_at ? formatTime(first.deposit_confirmed_at) : null,
    paidAtFull: first.deposit_confirmed_at || null,
    nickname: first.youtube_nickname || first.customer_name || "-",
    name: first.customer_name || "-",
    phone: first.customer_phone || first.phone || "-",
    zipcode: first.zipcode || null,
    address: first.address || null,
    detailAddress: first.detail_address || null,
    paymentMethod: first.payment_method || "무통장입금",
    broadcastId: first.broadcast_id || null,
    broadcastName: first.broadcast_name || null,
    orderSummary: buildItemSummary(group),
    productAmount: getGroupProductAmount(group),
    shippingFee: getGroupShippingFee(group),
    totalAmount: getGroupDisplayTotalAmount(group),
    pointOriginalAmount: getGroupPointOriginalAmount(group),
    pointUsedAmount: getGroupPointUsedAmount(group),
    finalAmount: getGroupFinalAmount(group),
    cardExtraAmount: getGroupCardExtraAmount(group),
    cardPaymentTotalAmount: getGroupCardPaymentTotalAmount(group),
    memo: getMemo(group),
    deliveryMemo: getShippingRequestMemo(first) || "",
    isTestOrder: groupHasTruthyFlag(group, "is_test_order"),
    testOrderReason: firstTextFromGroupRows(group, "test_order_reason"),
    operatorTestPhone: firstTextFromGroupRows(group, "operator_test_phone"),
    excludeFromSettlement: groupHasTruthyFlag(group, "exclude_from_settlement"),
    excludeFromPaymentMatch: groupHasTruthyFlag(group, "exclude_from_payment_match"),
    excludeFromShipping: groupHasTruthyFlag(group, "exclude_from_shipping"),
    excludeFromPicking: groupHasTruthyFlag(group, "exclude_from_picking"),
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
