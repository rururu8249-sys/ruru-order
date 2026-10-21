// lib/salesQuestion.ts
// [2026-10-22 AI 비서 2단계] 「오늘 누가 많이 샀어?」「이번 주 뭐 잘 나갔어?」 숫자 답 — 읽기 전용 계산.
//   ⚠ 판매분석 화면(components/admin-live/SalesAnalysisPanel)과 «같은 계산»을 쓴다:
//     - 제외: 삭제·완전삭제·테스트·정산제외·이벤트 선물·취소(salesVisibleRow — 판매분석도 이 함수를 import)
//     - 방송(쇼핑몰) 단위로 나눈 뒤 주문 묶기 → toAdminLiveOrder → 결제완료(paid·auto·manual·card)만
//     - 결제금액 = 주문 totalAmount 합, 상품 순위 = aggregateSalesItems(판매분석과 같은 인자)
//     - 손님 묶기 = 전화(없으면 닉네임|이름) — 판매분석 「구매자」 탭과 같은 키
//   돈·주문상태 값을 바꾸지 않는다(계산만).

import type { OrderRow } from "./admin-v2/types";
import { isCanceledStatus } from "./admin-v2/statusDisplay";
import { aggregateSalesItems } from "./salesHistory";
import { buildAdminLiveOrderGroups, toAdminLiveOrder } from "../components/admin-live/liveOrderAdapter";

export const SALES_PAID_CODES = new Set(["paid", "auto_paid", "manual_paid", "card_paid"]);
const UNPAID_CODES = new Set(["unpaid", "manual_match_needed", "card_unpaid"]);
const SHOP = "__shop__";

/** 판매분석과 같은 제외 규칙(삭제·테스트·정산제외·선물·취소) */
export function salesVisibleRow(row: OrderRow): boolean {
  const raw = row as Record<string, unknown>;
  const flag = (value: unknown) => [true, "true", "t", 1, "1"].includes(value as never);
  return (
    !["is_deleted", "is_permanently_deleted", "is_test_order", "exclude_from_settlement"].some((key) => flag(raw[key])) &&
    raw.event_gift_winner_id == null &&
    ![row.admin_order_status_v2, row.order_manage_status, raw.order_status].some((status) => isCanceledStatus(String(status || "")))
  );
}
export const salesChannelOf = (row: OrderRow) => (row.broadcast_id == null ? SHOP : String(row.broadcast_id));

import type { PeriodKey } from "./statQuestionParse";
export type { StatKind, PeriodKey } from "./statQuestionParse";

export type ResolvedPeriod = {
  key: PeriodKey;
  label: string;
  /** 주문 시각 범위(UTC ISO). 방송 기준이면 null */
  fromIso: string | null;
  toIso: string | null;
  broadcastId: string | null;
};

const KST = 9 * 3600 * 1000;
const DAY = 86400000;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 한국 날짜 0시(UTC ms) */
function kstMidnight(ms: number): number {
  return Math.floor((ms + KST) / DAY) * DAY - KST;
}
function kstLabel(ms: number): string {
  const d = new Date(ms + KST);
  return `${d.getUTCMonth() + 1}.${String(d.getUTCDate()).padStart(2, "0")}(${WEEK[d.getUTCDay()]})`;
}

/** 기간 말 → 한국 시간 범위. 방송 기준(last_broadcast)은 그 방송 주문 전부(판매분석의 방송별 숫자와 같음). */
export function resolvePeriod(
  key: PeriodKey,
  nowMs: number,
  opts: { date?: string; broadcasts?: { id: string; title: string; started_at: string }[] } = {},
): ResolvedPeriod {
  const today = kstMidnight(nowMs);
  const range = (from: number, to: number, label: string): ResolvedPeriod => ({
    key, label, fromIso: new Date(from).toISOString(), toIso: new Date(to).toISOString(), broadcastId: null,
  });
  switch (key) {
    case "today": return range(today, today + DAY, `오늘 ${kstLabel(today)}`);
    case "yesterday": return range(today - DAY, today, `어제 ${kstLabel(today - DAY)}`);
    case "last_7_days": return range(today - 6 * DAY, today + DAY, `최근 7일 ${kstLabel(today - 6 * DAY)}~${kstLabel(today)}`);
    case "this_week":
    case "last_week": {
      const dow = new Date(today + KST).getUTCDay(); // 0=일
      const monday = today - ((dow + 6) % 7) * DAY;
      const start = key === "this_week" ? monday : monday - 7 * DAY;
      const end = key === "this_week" ? today + DAY : monday;
      return range(start, end, `${key === "this_week" ? "이번 주" : "지난주"} ${kstLabel(start)}~${kstLabel(end - DAY)}`);
    }
    case "this_month":
    case "last_month": {
      const d = new Date(today + KST);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() - (key === "last_month" ? 1 : 0);
      const start = Date.UTC(y, m, 1) - KST;
      const end = key === "this_month" ? today + DAY : Date.UTC(y, m + 1, 1) - KST;
      const mm = new Date(start + KST).getUTCMonth() + 1;
      return range(start, end, `${key === "this_month" ? "이번 달" : "지난달"} ${mm}월`);
    }
    case "date": {
      const m = String(opts.date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return range(today, today + DAY, `오늘 ${kstLabel(today)}`);
      const start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - KST;
      return range(start, start + DAY, kstLabel(start));
    }
    case "last_broadcast": {
      const list = [...(opts.broadcasts || [])]
        .filter((b) => Date.parse(b.started_at) <= nowMs)
        .sort((a, b) => (Date.parse(b.started_at) || 0) - (Date.parse(a.started_at) || 0));
      const b = list[0];
      if (!b) return { key, label: "방송 기록 없음", fromIso: null, toIso: null, broadcastId: "__none__" };
      return { key, label: `${b.title} · ${kstLabel(Date.parse(b.started_at))} 방송`, fromIso: null, toIso: null, broadcastId: b.id };
    }
    case "all":
    default:
      return { key: "all", label: "전체 기간", fromIso: null, toIso: null, broadcastId: null };
  }
}

export function rowInPeriod(row: OrderRow, p: ResolvedPeriod): boolean {
  if (p.broadcastId) return String(row.broadcast_id ?? "") === p.broadcastId;
  if (!p.fromIso && !p.toIso) return true;
  const at = String(row.created_at || "");
  if (!at) return false;
  const t = Date.parse(at);
  return (!p.fromIso || t >= Date.parse(p.fromIso)) && (!p.toIso || t < Date.parse(p.toIso));
}

export type SalesAnswer = {
  amount: number;
  productAmount: number;
  orderCount: number;
  buyerCount: number;
  qty: number;
  unpaidCount: number;
  unpaidAmount: number;
  topProducts: { name: string; productId: string; qty: number; price: number; sales: number; option: string }[];
  topBuyers: { key: string; nickname: string; name: string; orderCount: number; qty: number; amount: number }[];
};

/** 기간 안 주문(판매분석과 같은 제외·묶기·결제완료 판정)으로 숫자 계산 */
export function computeSalesAnswer(orders: OrderRow[], period: ResolvedPeriod, topN = 10): SalesAnswer {
  const scoped = orders.filter((row) => salesVisibleRow(row) && rowInPeriod(row, period));
  const byChannel = new Map<string, OrderRow[]>();
  for (const row of scoped) {
    const id = salesChannelOf(row);
    const list = byChannel.get(id) || [];
    list.push(row);
    byChannel.set(id, list);
  }
  const allOrders = [...byChannel.values()].flatMap((rows) => buildAdminLiveOrderGroups(rows).map(toAdminLiveOrder));
  const paidOrders = allOrders.filter((o) => SALES_PAID_CODES.has(o.paymentStatus));
  const unpaidOrders = allOrders.filter((o) => UNPAID_CODES.has(o.paymentStatus));
  const sold = paidOrders.flatMap((o) => o.items);

  const originals = new Map(scoped.map((row) => [String(row.id), row]));
  const products = aggregateSalesItems(
    sold.map((item) => ({
      ...originals.get(item.id),
      product_name: item.productName,
      product_id: item.productId,
      qty: item.qty,
      adjusted_product_price: null,
      product_price: item.unitPrice,
      lineAmount: item.amount,
    })),
    (row) => Number(row.lineAmount),
    (row) => String(row.product_id || ""),
  );

  const buyerMap = new Map<string, { key: string; nickname: string; name: string; orderCount: number; qty: number; amount: number }>();
  for (const order of paidOrders) {
    const key = order.phone && order.phone !== "-" ? order.phone : `${order.nickname}|${order.name}`;
    const b = buyerMap.get(key) || { key, nickname: order.nickname, name: order.name, orderCount: 0, qty: 0, amount: 0 };
    b.orderCount += 1;
    b.amount += order.totalAmount;
    b.qty += order.items.reduce((s, it) => s + it.qty, 0);
    buyerMap.set(key, b);
  }
  const buyers = [...buyerMap.values()].sort((a, b) => b.amount - a.amount);

  return {
    amount: paidOrders.reduce((s, o) => s + o.totalAmount, 0),
    productAmount: products.reduce((s, p) => s + p.sales, 0),
    orderCount: paidOrders.length,
    buyerCount: buyers.length,
    qty: sold.reduce((s, it) => s + it.qty, 0),
    unpaidCount: unpaidOrders.length,
    unpaidAmount: unpaidOrders.reduce((s, o) => s + o.totalAmount, 0),
    topProducts: [...products]
      .sort((a, b) => b.qty - a.qty || b.sales - a.sales)
      .slice(0, topN)
      .map((p) => ({ name: p.name, productId: p.productId, qty: p.qty, price: p.price, sales: p.sales, option: p.option })),
    // 전화번호는 화면에 안 보냄(키는 순번으로 바꿔 보냄)
    topBuyers: buyers.slice(0, topN).map((b, i) => ({ ...b, key: `b${i}` })),
  };
}
