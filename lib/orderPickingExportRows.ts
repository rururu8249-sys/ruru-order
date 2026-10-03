import type { LiveOrder, LiveOrderItem } from "../components/admin-live/types";
import { classifyPickingAttention, isPaidPickingOrder } from "./orderPickingWorkspace";

export type PickingMainExportRow = {
  itemId: string;
  orderedAt: string;
  nickname: string;
  productName: string;
  option: string;
  qty: number;
  amount: number;
  payment: string;
  kind: "일반" | "뒤늦게 결제" | "결제시각 확인" | "변경 후 재챙김";
};

export type PickingAttentionExportRow = {
  itemId: string;
  kind: "뒤늦게 결제" | "결제시각 확인" | "변경 후 재챙김";
  orderedAt: string;
  attentionAt: string;
  broadcast: string;
  customer: string;
  orderNo: string;
  before: string;
  current: string;
  detail: string;
};

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();

export function formatPickingKstDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return clean(value);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

function optionText(item: LiveOrderItem): string {
  return [clean(item.color), clean(item.size)].filter((value) => value && value !== "없음").join(" / ") || clean(item.optionText);
}

function currentText(item: LiveOrderItem): string {
  return [clean(item.productName) || "상품", optionText(item), `${Number(item.qty || 1)}개`].filter(Boolean).join(" · ");
}

function beforeText(item: LiveOrderItem): string {
  const before = item.repickBefore;
  if (!before) return "";
  return [clean(before.product_name) || "상품", [clean(before.color), clean(before.size)].filter(Boolean).join(" / "), `${Number(before.qty || 1)}개`].filter(Boolean).join(" · ");
}

export function buildPickingExportRows(orders: readonly LiveOrder[], visibleItemIds?: readonly string[]) {
  const visible = visibleItemIds ? new Set(visibleItemIds.map(String)) : null;
  const mainRows: PickingMainExportRow[] = [];
  const attentionRows: PickingAttentionExportRow[] = [];

  for (const order of orders) {
    for (const item of order.items || []) {
      const itemId = String(item.id);
      if (visible && !visible.has(itemId)) continue;
      const attention = classifyPickingAttention(order, item);
      const kind = attention === "repick" ? "변경 후 재챙김" : attention === "late_paid" ? "뒤늦게 결제" : attention === "payment_time_missing" ? "결제시각 확인" : "일반";
      mainRows.push({
        itemId,
        orderedAt: formatPickingKstDateTime(order.createdAt || order.submittedAt),
        nickname: clean(order.nickname || order.name),
        productName: clean(item.productName) || "상품명없음",
        option: optionText(item),
        qty: Math.max(1, Number(item.qty || 1)),
        amount: Number(item.amount || 0),
        payment: isPaidPickingOrder(order) ? "완료" : "미입금",
        kind,
      });
      if (!attention) continue;
      const attentionKind: PickingAttentionExportRow["kind"] = attention === "repick" ? "변경 후 재챙김" : attention === "payment_time_missing" ? "결제시각 확인" : "뒤늦게 결제";
      const orderedAt = formatPickingKstDateTime(order.createdAt || order.submittedAt);
      const attentionAt = formatPickingKstDateTime(attention === "repick" ? item.repickRequiredAt : order.paidAtFull || order.paidAt);
      attentionRows.push({
        itemId,
        kind: attentionKind,
        orderedAt,
        attentionAt,
        broadcast: clean(order.broadcastName),
        customer: clean(order.nickname || order.name),
        orderNo: clean(order.orderNo || order.groupId || order.id),
        before: attention === "repick" ? beforeText(item) : "미결제",
        current: currentText(item),
        detail: attention === "repick"
          ? `변경일 ${attentionAt}`
          : attention === "payment_time_missing"
            ? `카드결제 완료 상태이나 결제시각이 없어 반드시 챙김 여부 확인`
            : `주문일 ${orderedAt} · 결제일 ${attentionAt}`,
      });
    }
  }
  return { mainRows, attentionRows };
}

export function partitionPickingAttentionRows(rows: readonly PickingAttentionExportRow[]) {
  return {
    latePaymentRows: rows.filter((row) => row.kind !== "변경 후 재챙김"),
    repickRows: rows.filter((row) => row.kind === "변경 후 재챙김"),
  };
}
