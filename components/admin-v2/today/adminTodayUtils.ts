// components/admin-v2/today/adminTodayUtils.ts
// 목적: 오늘할일 관제탑 표시용 계산/필터 유틸
// 주의: 조회/계산 전용. DB 저장, 입금매칭, 정산 저장, 배송비 계산 변경 없음.

import type { BroadcastRow, OrderGroup, OrderRow } from "@/lib/admin-v2/types";
import {
  buildProductSummaryFromRow,
  getOrderStatusValue,
  groupCanceledAmount,
  groupGrossBaseAmount,
  groupNetSalesAmount,
  isBankPaid,
  isBankUnpaid,
  isCardPaid,
  isCardUnpaid,
  isOrderCanceled,
  orderBaseAmount,
  orderNetSalesAmount,
  shortOrderCode,
} from "@/lib/admin-v2/orderHelpers";
import { formatDateLabel, money, toDateKey } from "@/lib/admin-v2/formatters";
import { getAdminOrderStatusLabel, getDeliveryStageStatusLabel } from "@/lib/admin-v2/statusDisplay";

export type TodayWorkTab =
  | "all"
  | "payment"
  | "new"
  | "shipping"
  | "issue"
  | "canceled";

export type TodayWorkItem = {
  id: string;
  tab: TodayWorkTab;
  tone: "blue" | "amber" | "emerald" | "rose" | "violet" | "neutral";
  label: string;
  nickname: string;
  product: string;
  amountText: string;
  timeText: string;
  createdAt: string;
  statusText: string;
  orderStatusText: string;
  deliveryStageText: string;
  orderCode: string;
  productLines: string[];
  itemQuantityText: string;
  rowCountText: string;
  memoPreview: string;
  metaBadges: string[];
};

export const getKstTodayInfo = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    label: `${parts.month || ""} ${parts.day || ""} (${parts.weekday || ""})`,
    time: `${parts.hour || "00"}:${parts.minute || "00"}`,
    dateKey: toDateKey(now.toISOString()),
  };
};

export const getLatestBroadcast = (broadcasts: BroadcastRow[]) => {
  return broadcasts.find((broadcast) => Boolean(broadcast.started_at)) || null;
};

export const getTodayGroups = (groups: OrderGroup[]) => {
  const todayKey = getKstTodayInfo().dateKey;
  return groups.filter((group) => toDateKey(group.first.created_at) === todayKey);
};

export const buildMoneySummary = (groups: OrderGroup[]) => {
  const rows = groups.flatMap((group) => group.rows);

  const totalOrderAmount = groups.reduce((sum, group) => sum + groupGrossBaseAmount(group), 0);
  const bankPaidAmount = rows.reduce((sum, row) => sum + (isBankPaid(row) ? orderNetSalesAmount(row) : 0), 0);
  const bankUnpaidAmount = rows.reduce((sum, row) => sum + (isBankUnpaid(row) ? orderBaseAmount(row) : 0), 0);
  const cardPaidAmount = rows.reduce((sum, row) => sum + (isCardPaid(row) ? orderNetSalesAmount(row) : 0), 0);
  const cardUnpaidAmount = rows.reduce((sum, row) => sum + (isCardUnpaid(row) ? orderBaseAmount(row) : 0), 0);
  const canceledAmount = groups.reduce((sum, group) => sum + groupCanceledAmount(group), 0);
  const netSalesAmount = groups.reduce((sum, group) => sum + groupNetSalesAmount(group), 0);

  return {
    totalOrderAmount,
    bankPaidAmount,
    bankUnpaidAmount,
    cardPaidAmount,
    cardUnpaidAmount,
    canceledAmount,
    netSalesAmount,
  };
};

const containsIssueKeyword = (row: OrderRow) => {
  const memoText = [
    row.memo,
    row.admin_memo,
    row.request_memo,
    row.special_note,
  ]
    .map((value) => String(value || ""))
    .join(" ");

  return ["환불", "교환", "반품", "별도", "주소", "연락", "확인", "보류"].some((word) =>
    memoText.includes(word)
  );
};


const compactWorkText = (value: unknown) =>
  String(value ?? "").replace(/\s+/g, " ").trim();

const readWorkField = (row: OrderRow, keys: string[]) => {
  const source = row as unknown as Record<string, unknown>;

  for (const key of keys) {
    const value = source[key];
    const text = compactWorkText(value);

    if (text) return text;
  }

  return "";
};

const buildWorkProductLines = (rows: OrderRow[]) => {
  const lines = rows
    .map((row) => compactWorkText(buildProductSummaryFromRow(row)))
    .filter(Boolean);

  return lines.length > 0 ? lines.slice(0, 4) : ["상품명 없음"];
};

const getWorkQuantity = (row: OrderRow) => {
  const source = row as unknown as Record<string, unknown>;
  const raw = Number(source.qty ?? source.quantity ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
};

const buildWorkMemoPreview = (rows: OrderRow[]) => {
  const memo = rows
    .map((row) =>
      [
        row.memo,
        row.admin_memo,
        row.request_memo,
        row.special_note,
        readWorkField(row, ["item_memo", "product_memo", "order_item_memo"]),
      ]
        .map((value) => compactWorkText(value))
        .filter(Boolean)
        .join(" / ")
    )
    .filter(Boolean)
    .join(" / ");

  return memo.slice(0, 80);
};

const buildWorkMetaBadges = (group: OrderGroup) => {
  const rows = group.rows;
  const qty = rows.reduce((sum, row) => sum + getWorkQuantity(row), 0);
  const memoPreview = buildWorkMemoPreview(rows);
  const badges: string[] = [];

  if (rows.length > 1) badges.push(`상품 ${rows.length.toLocaleString()}줄`);
  if (qty > 0) badges.push(`총 ${qty.toLocaleString()}개`);
  if (memoPreview) badges.push("메모있음");

  const couponText = [
    "coupon_code",
    "coupon_name",
    "coupon_title",
    "coupon_text",
    "applied_coupon",
  ]
    .map((key) => readWorkField(group.first, [key]))
    .find(Boolean);

  if (couponText) badges.push("쿠폰있음");

  return badges.slice(0, 4);
};


export const buildWorkItems = (groups: OrderGroup[]) => {
  return groups.map<TodayWorkItem>((group) => {
    const first = group.first;
    const status = getOrderStatusValue(first);
    const nickname = first.youtube_nickname || first.customer_name || "-";
    const product = buildProductSummaryFromRow(group.rows[0]);
    const amountText = money(groupGrossBaseAmount(group));
    const timeText = formatDateLabel(first.created_at);
    const orderCode = shortOrderCode(group);
    const productLines = buildWorkProductLines(group.rows);
    const totalQuantity = group.rows.reduce((sum, row) => sum + getWorkQuantity(row), 0);
    const memoPreview = buildWorkMemoPreview(group.rows);
    const metaBadges = buildWorkMetaBadges(group);
    const orderStatusText = getAdminOrderStatusLabel({
      status,
      paymentMethod: first.payment_method,
    });
    const deliveryStageText = getDeliveryStageStatusLabel(status);

    const baseItem = {
      id: group.groupId,
      nickname,
      product,
      amountText,
      timeText,
      createdAt: first.created_at || "",
      statusText: orderStatusText,
      orderStatusText,
      deliveryStageText,
      orderCode,
      productLines,
      itemQuantityText: totalQuantity > 0 ? `${totalQuantity.toLocaleString()}개` : "-",
      rowCountText: `${group.rows.length.toLocaleString()}줄`,
      memoPreview,
      metaBadges,
    };

    if (isOrderCanceled(first)) {
      return {
        ...baseItem,
        tab: "canceled",
        tone: "rose",
        label: "주문서 취소",
      };
    }

    if (isBankUnpaid(first) || isCardUnpaid(first)) {
      return {
        ...baseItem,
        tab: "payment",
        tone: "amber",
        label: isCardUnpaid(first) ? "카드미결제" : "미결제",
      };
    }

    if (containsIssueKeyword(first)) {
      return {
        ...baseItem,
        tab: "issue",
        tone: "violet",
        label: "특이사항 확인",
      };
    }

    if (["입금확인", "자동입금확인", "수동입금확인", "출고대기", "미설정"].includes(status) && !first.shipped_at) {
      return {
        ...baseItem,
        tab: "shipping",
        tone: "blue",
        label: "배송처리 필요",
      };
    }

    return {
      ...baseItem,
      tab: "new",
      tone: "emerald",
      label: "신규주문",
    };
  });
};

export const buildBuyerRanking = (groups: OrderGroup[]) => {
  const map = new Map<string, { name: string; count: number; amount: number }>();

  groups.forEach((group) => {
    if (isOrderCanceled(group.first)) return;

    const name = group.first.youtube_nickname || group.first.customer_name || "이름없음";
    const current = map.get(name) || { name, count: 0, amount: 0 };
    current.count += 1;
    current.amount += groupNetSalesAmount(group);
    map.set(name, current);
  });

  return Array.from(map.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 7);
};

export const buildProductRanking = (groups: OrderGroup[]) => {
  const map = new Map<string, { name: string; qty: number; amount: number }>();

  groups.forEach((group) => {
    if (isOrderCanceled(group.first)) return;

    group.rows.forEach((row) => {
      const name = row.product_name || "상품명 없음";
      const current = map.get(name) || { name, qty: 0, amount: 0 };
      current.qty += Number(row.qty || 0);
      current.amount += orderNetSalesAmount(row);
      map.set(name, current);
    });
  });

  return Array.from(map.values())
    .sort((a, b) => b.qty - a.qty || b.amount - a.amount)
    .slice(0, 7);
};
