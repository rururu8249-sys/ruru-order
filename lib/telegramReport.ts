import { computeLiveSummary, kstDateTimeLabel, type LiveSummary } from "@/lib/liveSummary";
import { formatSettlementReport } from "@/lib/telegramReportFormat";

// 텔레그램 "방송 결산" 리포트 텍스트 생성(읽기 전용).
//   계산은 lib/liveSummary.computeLiveSummary 단일 출처 사용(주문 그룹 단위 집계 + 상품별 수량).
//   범위 = "현재(가장 최근) 방송" 시간창[방송 시작~지금], 방송 없으면 오늘. 돈/입금 로직은 읽기만, 변경 없음.
// [2026-10-22 사장님] 문구는 lib/telegramReportFormat 한 곳(수동 「텔레그램」 버튼과 같은 형식) —
//   매출·무통장/카드·상품값·포인트 사용(수동 입력 가능)·미결제·상품별 판매개수·월 누적.

export function formatReport(s: LiveSummary, opts?: { pointUsedManual?: number | null }): string {
  const live = s.scope === "broadcast" && s.live;
  const when =
    s.scope === "broadcast"
      ? `${live ? "🔴" : "⏹"} ${kstDateTimeLabel(s.startedAt)} ~ ${live ? "지금" : kstDateTimeLabel(s.endedAt)}`
      : "📅 오늘 (00:00~24:00)";
  return formatSettlementReport({
    kind: live ? "중간보고" : "결산",
    title: s.title,
    when,
    paidSum: s.paidSum,
    paidCount: s.paidCount,
    bankPaidSum: s.bankPaidSum,
    cardPaidSum: s.cardPaidSum,
    goodsSum: s.goodsSum,
    pointUsedActual: s.pointUsedSum,
    pointUsedManual: opts?.pointUsedManual ?? null,
    unpaidSum: s.unpaidBankSum + s.unpaidCardSum,
    unpaidBankCount: s.unpaidBankCount,
    unpaidCardCount: s.unpaidCardCount,
    products: s.productAll.map((p) => ({ name: p.name, qty: p.qty })),
    monthLabel: s.monthLabel,
    monthSum: s.monthSum,
  });
}

export async function buildTodayReport(opts?: { pointUsedManual?: number | null }): Promise<string> {
  const s = await computeLiveSummary("broadcast"); // 방송 있으면 방송 기준, 없으면 오늘
  return formatReport(s, opts);
}
