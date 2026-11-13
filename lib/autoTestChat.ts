// lib/autoTestChat.ts
// [2026-11-13 사장님 요청서 「자동 테스트 계정 — 실시간 채팅」] 테스트 닉네임으로 보낼 채팅 문장 만들기.
//   - 유튜브 라이브 중: 인사·가격·사이즈·색상·배송 질문 / 라이브 끝(다시보기): 가벼운 인사·주문 안내만(답이 필요한 질문 금지)
//   - 다이슨 = 가전(키·몸무게·사이즈 질문 금지) · 「마야」 = 상품 정보 기준(성별 단정 안 함) · 그 밖의 의류 = 여성 기준 · 모르면 인사·주문 문장만
//   - 주문 뒤 문장은 실제 상태대로: 결제 확인 전에는 「결제 완료」 표현 금지
//   - Gemini(무료)로 한 번에 앞·뒤 두 문장, 실패하면 아래 문장 목록에서 랜덤. 주문 테스트와 무관하게 실패해도 조용히.
import { callGeminiJson } from "@/lib/geminiJson";

export type ChatProductKind = "appliance" | "maya" | "clothing" | "unknown";
export type ChatProduct = { name: string; category: string; price: number; colors: string[]; sizes: string[] };

const pick = <T,>(list: T[], rand = Math.random): T => list[Math.floor(rand() * list.length)];
const CLOTHING_WORDS = ["의류", "옷", "패딩", "코트", "자켓", "재킷", "니트", "가디건", "원피스", "바지", "팬츠", "셔츠", "블라우스", "맨투맨", "후드", "점퍼", "트렌치", "스커트", "티", "베스트"];

export function chatProductKind(p: { name: string; category: string }): ChatProductKind {
  const t = `${p.name} ${p.category}`;
  if (/다이슨|dyson/i.test(t)) return "appliance";
  if (/마야/.test(t)) return "maya";
  if (CLOTHING_WORDS.some((w) => t.includes(w)) || /^(PD|BB|MC|MX|MIU|DR|LOE|CL|BC|CH|GC)-\d/i.test(p.name)) return "clothing";
  return "unknown";
}

/** 현실적인 키·몸무게·평소 사이즈(여성) */
export function randomBody(rand = Math.random): { height: number; weight: number; usual: string } {
  const height = 150 + Math.floor(rand() * 21); // 150~170
  const bmi = 19 + rand() * 6; // 19~25
  const weight = Math.round((bmi * (height / 100) ** 2));
  const usual = weight < 50 ? pick(["44", "55", "S"], rand) : weight < 58 ? pick(["55", "55반", "M"], rand) : weight < 65 ? pick(["66", "M", "L"], rand) : pick(["66반", "77", "L"], rand);
  return { height, weight, usual };
}

export type ChatPhase = "before" | "after";

/** 문장 목록(제미나이 실패 때) — 라이브/다시보기 × 앞/뒤 × 상품 종류 */
export function fallbackChatLine(phase: ChatPhase, live: boolean, product: ChatProduct | null, rand = Math.random): string {
  if (phase === "after") {
    return pick(["주문서 제출했어요~", "방금 주문했어요!", "주문 잘했어요~", "장바구니 담고 주문했어요", "주문했어요 😊", "방금 주문서 냈어요~"], rand);
  }
  if (!live) return pick(["안녕하세요~", "구경 왔어요", "다시보기 보고 있어요~", "다시보기 편하네요", "잘 보고 있어요~", "오늘도 구경 왔어요"], rand);
  const greet = ["안녕하세요~ 오늘도 구경 왔어요", "안녕하세요!", "왔어요~ 오늘 예쁜 거 많네요", "언니 안녕하세요~"];
  if (!product) return pick(greet, rand);
  const kind = chatProductKind(product);
  const short = product.name.replace(/\s+/g, " ").slice(0, 18);
  const qs: string[] = [...greet, `${short} 가격 얼마예요?`, "지금 주문 가능한가요?", "배송은 얼마나 걸리나요?"];
  if (kind === "appliance") qs.push(`${short} 구성품 다 들어있나요?`, `${short} 정품 맞죠?`, "색상은 어떤 거 있어요?");
  else if (kind === "clothing" || kind === "maya") {
    const b = randomBody(rand);
    if (kind === "clothing") qs.push(`${b.height}에 ${b.weight}kg인데 ${pick(product.sizes.length ? product.sizes : ["S", "M"], rand)} 괜찮을까요?`, `평소 ${b.usual} 입는데 어떤 사이즈 추천하세요?`, "이 상품 정사이즈인가요?");
    if (product.colors.length > 1) qs.push(`${pick(product.colors, rand)}도 있나요?`);
  }
  return pick(qs, rand);
}

const TONES = ["짧고 상냥한 존댓말", "친근한 반말 섞인 존댓말", "물결(~)을 자주 쓰는 말투", "이모티콘 한 개 정도 쓰는 말투", "차분한 존댓말", "신난 말투"];

/** 앞·뒤 두 문장 — 제미나이로 만들고, 안 되면 문장 목록. 절대 예외를 던지지 않음 */
export async function makeChatLines(input: { nickname: string; live: boolean; product: ChatProduct | null; withOrder: boolean }, rand = Math.random): Promise<{ before: string; after: string; source: "ai" | "list" }> {
  const fb = { before: fallbackChatLine("before", input.live, input.product, rand), after: fallbackChatLine("after", input.live, input.product, rand), source: "list" as const };
  try {
    const kind = input.product ? chatProductKind(input.product) : "unknown";
    const body = randomBody(rand);
    const rules = [
      "너는 유튜브 라이브 쇼핑 방송을 보는 40~60대 여성 손님이다. 사이트 채팅에 올릴 짧은 한국어 문장을 만든다.",
      `닉네임: ${input.nickname} / 말투: ${pick(TONES, rand)}`,
      input.live
        ? "지금 방송이 진행 중이다. before 문장은 인사 또는 상품 질문(가격·사이즈·색상·배송·주문 가능 여부) 중 하나."
        : "지금은 방송이 끝나고 다시보기 중이다. before 문장은 가벼운 인사만(예: 안녕하세요~, 다시보기 보고 있어요). 답이 필요한 질문(가격·사이즈·재고·배송)은 절대 쓰지 마.",
      input.product ? `상품: ${input.product.name} (${input.product.category || "분류 없음"}, ${input.product.price.toLocaleString()}원, 색상 ${input.product.colors.join("/") || "-"}, 사이즈 ${input.product.sizes.join("/") || "-"})` : "상품 정보 없음 — 인사만.",
      kind === "appliance" ? "이 상품은 가전이다. 키·몸무게·옷 사이즈 질문 금지. 가격·구성품·색상 같은 질문만." :
        kind === "maya" ? "이 상품은 상품 정보에 맞게만 묻는다. 성별·몸 치수를 단정하지 마." :
        kind === "clothing" ? `여성 의류다. 사이즈 질문을 한다면 키 ${body.height}cm·몸무게 ${body.weight}kg·평소 ${body.usual} 같은 현실적인 값으로.` :
        "상품 종류가 불명확하다. 사이즈 질문 대신 인사나 주문 관련 문장만.",
      input.withOrder ? "after 문장은 방금 주문서를 냈다는 짧은 말(예: 주문서 제출했어요~). 결제는 아직 안 했으니 「결제 완료」·「입금 완료」 표현 금지." : "after 문장은 빈 글자.",
      "각 문장 30자 이내, 상품 이름을 통째로 반복하지 말고, 광고 문구처럼 쓰지 마. 운영자 이름·전화번호·링크 금지.",
      '답은 JSON 하나: {"before":"...","after":"..."}',
    ].join("\n");
    const r = await callGeminiJson(rules, { timeoutMs: 6000, maxTokens: 200 });
    if (!r.text) return fb;
    const j = JSON.parse(r.text) as { before?: unknown; after?: unknown };
    const clean = (v: unknown) => String(v ?? "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    let before = clean(j.before);
    let after = clean(j.after);
    if (!before) return fb;
    if (!input.live && /\?|얼마|사이즈|재고|배송|있나요|되나요/.test(before)) before = fb.before; // 다시보기 중 질문 금지
    if (kind === "appliance" && /키|몸무게|kg|사이즈|55|66/.test(before)) before = fb.before;
    if (!after || /결제|입금/.test(after)) after = fb.after;
    return { before, after, source: "ai" };
  } catch {
    return fb;
  }
}
