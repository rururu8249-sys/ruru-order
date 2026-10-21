// lib/statQuestionParse.ts
// [2026-10-22 AI 비서 2단계] 숫자 질문 알아듣기(순수 함수 — DB·화면 코드 import 없음).
//   AI(Gemini) 키가 없거나 실패할 때 쓰는 규칙 해석 + AI 응답 값 검사용 목록.

// [10/22 실측 보정] top_days = 「어느 날 제일 많이 팔렸어?」(날짜별 순위) · 기간 말이 없으면 period 비움(호출한 쪽이 칩 「최근 3개월/전체」로 정함)
export type StatKind = "top_products" | "top_buyers" | "top_days" | "bottom_days" | "summary";
export type PeriodKey =
  | "today" | "yesterday" | "last_7_days" | "this_week" | "last_week"
  | "this_month" | "last_month" | "last_3_months" | "last_broadcast" | "date" | "custom" | "all";
export const STAT_KINDS: StatKind[] = ["top_products", "top_buyers", "top_days", "bottom_days", "summary"];
export const PERIOD_KEYS: PeriodKey[] = ["today", "yesterday", "last_7_days", "this_week", "last_week", "this_month", "last_month", "last_3_months", "last_broadcast", "date", "custom", "all"];

const KST = 9 * 3600 * 1000;

// ───── AI 없이 숫자 질문 알아듣기(키 없음·AI 실패 시) ─────
export function parseStatQuestion(text: string, nowMs: number): { stat: StatKind; period?: PeriodKey; date?: string } | null {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  let stat: StatKind | null = null;
  if (/((어느|무슨|어떤|언제)\s*(날|요일|일|때)|날짜\s*별|일자\s*별|요일\s*별|방송\s*별|(날|때)[은는]?\s*\??$|나온\s*(날|때))/.test(t)) stat = /(적[은었]|낮[은았]|최저|안\s*팔|못\s*팔|제일\s*덜|가장\s*덜|꼴찌|망한)/.test(t) ? "bottom_days" : "top_days";
  else if (/(잘\s*나[간갔가]|잘\s*팔[린렸리]|많이\s*팔[린렸리]|인기|베스트|뭐가\s*팔|뭐\s*팔)/.test(t)) stat = "top_products";
  else if (/(많이\s*[산샀사]|누가\s*많이|큰손|많이\s*구매|구매\s*많|제일\s*많이\s*주문)/.test(t)) stat = "top_buyers";
  else if (/(매출|얼마\s*팔|판매액|결제금액|미입금|입금\s*안|몇\s*건|주문\s*수)/.test(t)) stat = "summary";
  if (!stat) return null;
  const pd = parsePeriodWords(t, nowMs);
  return { stat, ...pd };
}

/** 기간 말이 없으면 period 를 안 돌려준다(빈 객체) — 호출한 쪽이 화면 칩(최근 3개월/전체)으로 정한다 */
export function parsePeriodWords(t: string, nowMs: number): { period?: PeriodKey; date?: string } {
  if (/(지난\s*방송|최근\s*방송|저번\s*방송|어제\s*방송|오늘\s*방송|방송에서)/.test(t)) return { period: "last_broadcast" };
  if (/오늘/.test(t)) return { period: "today" };
  if (/(어제)/.test(t)) return { period: "yesterday" };
  if (/(지난\s*주|저번\s*주)/.test(t)) return { period: "last_week" };
  if (/(이번\s*주|금주)/.test(t)) return { period: "this_week" };
  if (/(일주일|7일)/.test(t)) return { period: "last_7_days" };
  if (/(지난\s*달|저번\s*달)/.test(t)) return { period: "last_month" };
  if (/(3\s*개월|세\s*달|석\s*달|90일)/.test(t)) return { period: "last_3_months" };
  if (/(이번\s*달|이달)/.test(t)) return { period: "this_month" };
  if (/(전체|지금까지|여태)/.test(t)) return { period: "all" };
  const m = t.match(/(\d{1,2})\s*(?:월\s*|[./-])\s*(\d{1,2})\s*일?/);
  if (m) {
    const y = new Date(nowMs + KST).getUTCFullYear();
    return { period: "date", date: `${y}-${String(Number(m[1])).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}` };
  }
  return {};
}
