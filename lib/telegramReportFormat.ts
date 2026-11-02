// [2026-10-22 사장님] 텔레그램 결산 문구 — 한 곳. 방송 종료 자동(서버 liveSummary)·수동 「텔레그램」 버튼(화면 조회범위) 둘 다 이 형식.
//   [2026-11-02 재설계] 매출 → 무통장입금·카드결제완료·미입금·카드미결제·포인트 사용 → 상품별 판매(전부) → 구매 TOP3 → 월 누적. 순수익은 안 넣음(사장님).
//   포인트 사용금액은 사장님이 수동으로 넣으면 그 값(표시는 같은 「포인트 사용」), 안 넣으면 실제 사용금액.
//   HTML parse_mode 라 상품명·방송명의 < > & 는 반드시 이스케이프(안 하면 텔레그램이 거부).

export type ReportBuyer = { name: string; sum: number; count: number; qty?: number };

export type SettlementReportData = {
  /** 「결산」「중간보고」「조회범위 보고」 */
  kind: string;
  title: string;
  /** 기간 한 줄(예: 11.01(일) 20:04 ~ 23:58 · 3시간 54분) */
  when: string;
  paidSum: number;
  paidCount: number;
  bankPaidSum: number;
  cardPaidSum: number;
  /** 결제완료 건수(무통장/카드) — 없으면 건수 표시 안 함 */
  bankPaidCount?: number;
  cardPaidCount?: number;
  goodsSum: number;
  pointUsedActual: number;
  /** 사장님이 직접 넣은 값(null 이면 실제값) */
  pointUsedManual?: number | null;
  unpaidSum: number;
  unpaidBankSum?: number;
  unpaidCardSum?: number;
  unpaidBankCount: number;
  unpaidCardCount: number;
  /** 결제완료 기준 상품별 수량(많이 팔린 순) */
  products: { name: string; qty: number }[];
  /** 구매 TOP 3(결제 금액 순) */
  buyers?: ReportBuyer[];
  monthLabel?: string;
  monthSum?: number;
};

export const won = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;

export function escapeTelegramHtml(text: unknown): string {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 상품 줄 최대 개수(텔레그램 한 메시지 4,096자 안에서 «모든 품목»이 들어가게) */
export const REPORT_PRODUCT_LINE_MAX = 80;
const PRODUCT_NAME_MAX = 22;
const MEDALS = ["🥇", "🥈", "🥉"];

export function formatSettlementReport(d: SettlementReportData): string {
  const L: string[] = [];
  const line = "━━━━━━━━━━━━━━";
  L.push(`📊 <b>${escapeTelegramHtml(d.kind)}</b> · ${escapeTelegramHtml(d.title)}`);
  if (d.when) L.push(escapeTelegramHtml(d.when));
  L.push(line);

  // [2026-11-02 사장님 「순수익은 빼라, 심플하게」] 돈 줄 6개만: 매출·무통장입금·카드결제완료·미입금·카드미결제·포인트 사용
  L.push(`💰 매출 <b>${won(d.paidSum)}</b> · ${d.paidCount}건`);
  L.push(line);
  const cnt = (n?: number) => (typeof n === "number" ? ` (${n}건)` : "");
  L.push(`· 무통장입금 ${won(d.bankPaidSum)}${cnt(d.bankPaidCount)}`);
  L.push(`· 카드결제완료 ${won(d.cardPaidSum)}${cnt(d.cardPaidCount)}`);
  const unpaidBankSum = typeof d.unpaidBankSum === "number" ? d.unpaidBankSum : d.unpaidBankCount === 0 ? 0 : d.unpaidCardCount > 0 ? null : d.unpaidSum;
  const unpaidCardSum = typeof d.unpaidCardSum === "number" ? d.unpaidCardSum : d.unpaidCardCount === 0 ? 0 : d.unpaidBankCount > 0 ? null : d.unpaidSum;
  L.push(`· 미입금 ${unpaidBankSum == null ? `${d.unpaidBankCount}건` : `${won(unpaidBankSum)} (${d.unpaidBankCount}건)`}`);
  L.push(`· 카드미결제 ${unpaidCardSum == null ? `${d.unpaidCardCount}건` : `${won(unpaidCardSum)} (${d.unpaidCardCount}건)`}`);
  const manual = d.pointUsedManual != null && Number.isFinite(Number(d.pointUsedManual));
  const point = manual ? Number(d.pointUsedManual) : d.pointUsedActual;
  L.push(`· 포인트 사용 ${won(point)}`);

  // ④ 상품별 판매(옵션 생략·상품명 기준)
  const products = [...d.products].filter((p) => p.qty > 0).sort((a, b) => b.qty - a.qty);
  if (products.length > 0) {
    const totalQty = products.reduce((s, p) => s + p.qty, 0);
    L.push("", `<b>🏆 상품별 판매</b> · 총 ${totalQty}개 · ${products.length}종`);
    products.slice(0, REPORT_PRODUCT_LINE_MAX).forEach((p, i) => {
      const name = p.name.length > PRODUCT_NAME_MAX ? p.name.slice(0, PRODUCT_NAME_MAX) + "…" : p.name;
      L.push(`${i + 1}. ${escapeTelegramHtml(name)} <b>${p.qty}개</b>`);
    });
    if (products.length > REPORT_PRODUCT_LINE_MAX) L.push(`… 외 ${products.length - REPORT_PRODUCT_LINE_MAX}종`);
  }

  // ⑤ 구매 TOP 3
  const buyers = (d.buyers || []).filter((b) => b.sum > 0).slice(0, 3);
  if (buyers.length > 0) {
    L.push("", "<b>👑 구매 TOP 3</b>");
    buyers.forEach((b, i) => {
      const nm = b.name.length > 14 ? b.name.slice(0, 14) + "…" : b.name;
      const qty = typeof b.qty === "number" && b.qty > 0 ? ` · ${b.qty}개` : "";
      L.push(`${MEDALS[i]} ${escapeTelegramHtml(nm)} <b>${won(b.sum)}</b> (${b.count}건${qty})`);
    });
  }

  if (d.monthLabel && typeof d.monthSum === "number") L.push("", `🗓 ${escapeTelegramHtml(d.monthLabel)} 누적 매출 ${won(d.monthSum)}`);
  return L.join("\n");
}

/** 입력칸 값 → 수동 포인트. 빈값·숫자 아님 → null(실제값 사용) */
export function parseManualPoint(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/[^0-9]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
