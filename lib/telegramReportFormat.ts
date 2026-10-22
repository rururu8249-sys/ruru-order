// [2026-10-22 사장님] 텔레그램 결산 문구 — 한 곳. 방송 종료 자동(서버 liveSummary)·수동 「텔레그램」 버튼(화면 조회범위) 둘 다 이 형식.
//   「정말 직관적이고 심플하게」: 매출 → 상품값 → 포인트 사용 → 미결제 → 상품별 판매개수 → 월 누적.
//   포인트 사용금액은 사장님이 수동으로 넣으면 그 값(「(직접 입력)」 표시), 안 넣으면 실제 사용금액.
//   HTML parse_mode 라 상품명·방송명의 < > & 는 반드시 이스케이프(안 하면 텔레그램이 거부).

export type SettlementReportData = {
  /** 「결산」「중간보고」「조회범위 보고」 */
  kind: string;
  title: string;
  /** 기간 한 줄(예: 10.22(목) 20:00 ~ 23:40) */
  when: string;
  paidSum: number;
  paidCount: number;
  bankPaidSum: number;
  cardPaidSum: number;
  goodsSum: number;
  pointUsedActual: number;
  /** 사장님이 직접 넣은 값(null 이면 실제값) */
  pointUsedManual?: number | null;
  unpaidSum: number;
  unpaidBankCount: number;
  unpaidCardCount: number;
  /** 결제완료 기준 상품별 수량(많이 팔린 순) */
  products: { name: string; qty: number }[];
  monthLabel?: string;
  monthSum?: number;
};

export const won = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;

export function escapeTelegramHtml(text: unknown): string {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const REPORT_PRODUCT_LINE_MAX = 30;

export function formatSettlementReport(d: SettlementReportData): string {
  const L: string[] = [];
  L.push(`📊 <b>${escapeTelegramHtml(d.kind)}</b> · ${escapeTelegramHtml(d.title)}`);
  if (d.when) L.push(escapeTelegramHtml(d.when));
  L.push("━━━━━━━━━━━━");
  L.push(`💰 매출 <b>${won(d.paidSum)}</b> · ${d.paidCount}건`);
  L.push(`　무통장 ${won(d.bankPaidSum)} · 카드 ${won(d.cardPaidSum)}`);
  L.push(`📦 상품값 ${won(d.goodsSum)}`);
  const manual = d.pointUsedManual != null && Number.isFinite(Number(d.pointUsedManual));
  L.push(`🪙 포인트 사용 ${won(manual ? Number(d.pointUsedManual) : d.pointUsedActual)}${manual ? " (직접 입력)" : ""}`);
  const unpaidCnt = d.unpaidBankCount + d.unpaidCardCount;
  L.push(unpaidCnt > 0 ? `⏳ 미결제 ${won(d.unpaidSum)} · ${unpaidCnt}건 (무통장 ${d.unpaidBankCount} · 카드 ${d.unpaidCardCount})` : "⏳ 미결제 없음");

  const products = [...d.products].filter((p) => p.qty > 0).sort((a, b) => b.qty - a.qty);
  if (products.length > 0) {
    const totalQty = products.reduce((s, p) => s + p.qty, 0);
    L.push("", `🏆 <b>상품별 판매</b> · 총 ${totalQty}개 · ${products.length}종`);
    products.slice(0, REPORT_PRODUCT_LINE_MAX).forEach((p, i) => {
      const name = p.name.length > 18 ? p.name.slice(0, 18) + "…" : p.name;
      L.push(`${i + 1}. ${escapeTelegramHtml(name)} ${p.qty}개`);
    });
    if (products.length > REPORT_PRODUCT_LINE_MAX) L.push(`… 외 ${products.length - REPORT_PRODUCT_LINE_MAX}종`);
  }
  if (d.monthLabel && typeof d.monthSum === "number") L.push("", `🗓 ${escapeTelegramHtml(d.monthLabel)} 누적 ${won(d.monthSum)}`);
  return L.join("\n");
}

/** 입력칸 값 → 수동 포인트. 빈값·숫자 아님 → null(실제값 사용) */
export function parseManualPoint(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/[^0-9]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
