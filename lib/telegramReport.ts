import { computeLiveSummary, kstDateTimeLabel, type LiveSummary } from "@/lib/liveSummary";
import { formatSettlementReport } from "@/lib/telegramReportFormat";

// 텔레그램 "방송 결산" 리포트 텍스트 생성(읽기 전용).
//   계산은 lib/liveSummary.computeLiveSummary 단일 출처 사용(주문 그룹 단위 집계 + 상품별 수량).
//   범위 = "현재(가장 최근) 방송" 시간창[방송 시작~지금], 방송 없으면 오늘. 돈/입금 로직은 읽기만, 변경 없음.
// [2026-10-22 사장님] 문구는 lib/telegramReportFormat 한 곳(수동 「텔레그램」 버튼과 같은 형식) —
//   매출·무통장/카드·상품값·포인트 사용(수동 입력 가능)·미결제·상품별 판매개수·월 누적.

function durationLabel(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

/** 끝 시각 — 시작과 같은 날이면 시:분만, 날짜가 넘어가면 날짜까지 */
function endLabel(startIso: string, endIso: string): string {
  const a = kstDateTimeLabel(startIso);
  const b = kstDateTimeLabel(endIso);
  return a && b && a.slice(0, 14) === b.slice(0, 14) ? b.slice(-5) : b;
}

export function formatReport(s: LiveSummary, opts?: { pointUsedManual?: number | null }): string {
  const live = s.scope === "broadcast" && s.live;
  const endIso = live || !s.endedAt ? new Date().toISOString() : s.endedAt;
  const dur = s.scope === "broadcast" ? durationLabel(s.startedAt, endIso) : "";
  const when =
    s.scope === "broadcast"
      ? `${live ? "🔴" : "⏹"} ${kstDateTimeLabel(s.startedAt)} ~ ${live ? "지금" : endLabel(s.startedAt, s.endedAt)}${dur ? ` · ${dur}` : ""}`
      : "📅 오늘 (00:00~24:00)";
  return formatSettlementReport({
    kind: live ? "중간보고" : "결산",
    title: s.title,
    when,
    paidSum: s.paidSum,
    paidCount: s.paidCount,
    bankPaidSum: s.bankPaidSum,
    cardPaidSum: s.cardPaidSum,
    bankPaidCount: s.bankPaidCount,
    cardPaidCount: s.cardPaidCount,
    goodsSum: s.goodsSum,
    pointUsedActual: s.pointUsedSum,
    pointUsedManual: opts?.pointUsedManual ?? null,
    unpaidSum: s.unpaidBankSum + s.unpaidCardSum,
    unpaidBankCount: s.unpaidBankCount,
    unpaidCardCount: s.unpaidCardCount,
    profit: {
      cardFeeRate: s.cardFeeRate,
      cardFeeSum: s.cardFeeSum,
      productCostSum: s.productCostSum,
      costedQty: s.costedQty,
      costMissingQty: s.costMissingQty,
    },
    products: s.productAll.map((p) => ({ name: p.name, qty: p.qty })),
    buyers: s.buyerTop,
    monthLabel: s.monthLabel,
    monthSum: s.monthSum,
  });
}

export async function buildTodayReport(opts?: { pointUsedManual?: number | null; broadcastId?: string }): Promise<string> {
  const s = await computeLiveSummary("broadcast", { broadcastId: opts?.broadcastId }); // 방송 있으면 방송 기준, 없으면 오늘
  return formatReport(s, opts);
}
