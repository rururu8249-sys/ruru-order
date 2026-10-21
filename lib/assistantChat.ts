// lib/assistantChat.ts
// [2026-10-22 AI 비서 7단계] 자유 질문 — 숫자·날짜·방송·상품 질문을 «아무 말로» 해도 답하게.
//   방식: 서버가 기간 안 주문을 판매분석과 같은 규칙으로 집계한 «표»(날짜별·방송별·상품별·손님 순위)를 만들고,
//   AI(Gemini) 는 그 표만 보고 말로 답한다. 표엔 손님 이름·전화·주소가 없다(손님 순위는 유튜브 닉네임만, 최대 30명).
//   AI 가 표에 없는 숫자를 지어내지 않게 「표에 없으면 없다고 말하라」를 규칙으로 넣는다. 순수 함수(DB·화면 코드 없음).
import type { SalesAnswer } from "./salesQuestion";

export type ChatTurn = { role: "user" | "assistant"; text: string };

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/** 집계 결과 → AI 가 읽을 글자 표(크기 제한: 날짜 120줄·방송 60줄·상품 80줄·손님 30줄) */
export function buildSalesDataPack(a: SalesAnswer, periodLabel: string): string {
  const lines: string[] = [];
  lines.push(`[기간] ${periodLabel}`);
  lines.push(`[합계] 결제금액 ${won(a.amount)} · 결제완료 주문 ${a.orderCount}건 · 구매 손님 ${a.buyerCount}명 · 판매 수량 ${a.qty}개 · 미결제 ${a.unpaidCount}건 ${won(a.unpaidAmount)}`);
  const days = [...a.topDays, ...a.bottomDays.filter((d) => !a.topDays.some((t) => t.date === d.date))]
    .sort((x, y) => x.date.localeCompare(y.date))
    .slice(-120);
  lines.push(`[날짜별 · ${days.length}일] 날짜 | 방송 | 방송 시간 | 결제금액 | 주문 | 수량`);
  for (const d of days) {
    lines.push(`${d.date.slice(0, 4)}.${d.label} | ${d.shopOnly ? "방송 없음(쇼핑몰 주문만)" : d.broadcastTitle} | ${d.shopOnly ? "-" : `${d.timeRange}${d.hours != null ? ` ${d.hours}시간` : ""}`} | ${won(d.amount)} | ${d.orderCount}건 | ${d.qty}개`);
  }
  const bcs = a.byBroadcast.slice(0, 60);
  lines.push(`[방송별 · ${bcs.length}개] 날짜 | 방송 제목 | 방송 시간 | 결제금액 | 주문 | 손님 | 수량`);
  for (const b of bcs) lines.push(`${b.date || "-"} | ${b.title} | ${b.timeRange ? `${b.timeRange}${b.hours != null ? ` ${b.hours}시간` : ""}` : "-"} | ${won(b.amount)} | ${b.orderCount}건 | ${b.buyerCount}명 | ${b.qty}개`);
  const products = a.topProducts.slice(0, 80);
  lines.push(`[상품별 · 많이 팔린 순 ${products.length}개] 상품 | 수량 | 판매금액 | 옵션별`);
  for (const p of products) lines.push(`${p.name} | ${p.qty}개 | ${won(p.sales)} | ${p.option.split("\n").join(", ").slice(0, 120)}`);
  const buyers = a.topBuyers.slice(0, 30);
  lines.push(`[손님 순위 · 결제금액 많은 순 ${buyers.length}명 · 닉네임만] 닉네임 | 주문 | 수량 | 결제금액`);
  for (const b of buyers) lines.push(`${b.nickname} | ${b.orderCount}건 | ${b.qty}개 | ${won(b.amount)}`);
  return lines.join("\n");
}

const KST = 9 * 3600 * 1000;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export function chatPrompt(pack: string, history: ChatTurn[], question: string, nowMs: number): string {
  const d = new Date(nowMs + KST);
  const today = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}(${WEEK[d.getUTCDay()]})`;
  const hist = history.slice(-6).map((t) => `${t.role === "user" ? "사장님" : "비서"}: ${t.text}`).join("\n");
  return `너는 유튜브 라이브 쇼핑몰 「루루동이」 사장님의 비서다. 아래 [자료]는 사장님이 고른 기간의 판매 집계표다(결제완료 기준). 사장님 질문에 자료만 근거로 한국어로 답한다.
규칙:
- 자료에 있는 숫자만 쓴다. 자료에 없으면 「이 자료엔 없어요」라고 말하고 어떤 기간·자료가 더 필요한지 한 줄로 말한다. 숫자·날짜·이름을 지어내지 않는다.
- 답은 짧고 바로 쓸 수 있게: 핵심 한 줄 먼저, 필요하면 줄바꿈으로 항목 3~7개. 금액은 1,234,567원 형식, 날짜는 10.18(토) 형식.
- 「제일 적은/안 팔린」은 자료 중 가장 작은 값, 「주말/평일」은 요일로, 「몇 시간」은 방송 시간 칸으로 계산한다. 비교·합계·평균은 직접 계산해서 말한다.
- 사장님 말투에 맞춰 존댓말(…했어요). 이모지 없음. 설명 없이 JSON 하나만: {"answer":"답 글"}
오늘: ${today}

[자료]
${pack}
${hist ? `\n[앞선 대화]\n${hist}\n` : ""}
[사장님 질문]
${question}`;
}

export function parseChatJson(text: string | null): string | null {
  if (!text) return null;
  try {
    const body = String(text).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const obj = JSON.parse(body) as { answer?: unknown };
    const answer = String(obj?.answer ?? "").trim();
    return answer ? answer.slice(0, 3000) : null;
  } catch {
    return null;
  }
}

/** 손님·상품 찾기가 아닌 질문인지(자유 질문으로 보낼지) — 규칙 해석이 unknown 이거나 숫자 질문이면 true */
export function looksLikeChatQuestion(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  return /(매출|팔[린렸]|나[간갔]|주문|손님|구매|방송|날|때|시간|요일|평균|합계|비교|얼마|몇|언제|어느|뭐|무슨|제일|가장|최대|최소|적|많)/.test(t);
}
