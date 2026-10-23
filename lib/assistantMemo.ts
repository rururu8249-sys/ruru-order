// lib/assistantMemo.ts
// [2026-10-22 AI 비서 3단계] 메모함 — 막 적은 메모를 「할 일 · 손님 · 상품 · 기억할 것」 줄로 정리하는 순수 함수.
//   - AI(Gemini)로 보내기 전 전화번호·계좌번호(긴 숫자)를 [번호1] 같은 자리표로 바꾸고, 돌아온 글자에서 다시 되돌린다.
//   - AI 가 안 되면 규칙으로 정리(줄·쉼표로 나누고 날짜 말·할 일 말로 분류). 원문은 항상 따로 저장(지우지 않음).

export type MemoKind = "todo" | "customer" | "product" | "note";
export const MEMO_KINDS: MemoKind[] = ["todo", "customer", "product", "note"];
export const MEMO_KIND_LABEL: Record<MemoKind, string> = {
  todo: "할 일",
  customer: "손님",
  product: "상품·재고",
  note: "기억할 것",
};

export type MemoItem = { kind: MemoKind; body: string; due_date: string | null; who: string | null; product: string | null };

const KST = 9 * 3600 * 1000;
const DAY = 86400000;

function kstDateText(ms: number): string {
  const d = new Date(ms + KST);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 전화번호·계좌번호(9자리 이상 숫자 덩어리)를 자리표로 — AI 로 개인정보가 안 가게 */
export function maskSensitive(text: string): { masked: string; restore: (s: string) => string; count: number } {
  const found: string[] = [];
  const masked = String(text ?? "").replace(/(?:\+?82[-\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|\d[\d\s-]{8,}\d/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 9) return m;
    found.push(m);
    return `[번호${found.length}]`;
  });
  const restore = (s: string) => String(s ?? "").replace(/\[번호(\d+)\]/g, (all, n) => found[Number(n) - 1] ?? all);
  return { masked, restore, count: found.length };
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 「오늘·내일·모레·금요일·10월 25일·10/25」 → YYYY-MM-DD (한국 날짜). 없으면 null */
export function parseDueWords(text: string, nowMs: number): string | null {
  const t = String(text ?? "");
  const today = Math.floor((nowMs + KST) / DAY) * DAY - KST;
  if (/모레/.test(t)) return kstDateText(today + 2 * DAY);
  if (/내일/.test(t)) return kstDateText(today + DAY);
  if (/오늘/.test(t)) return kstDateText(today);
  const md = t.match(/(\d{1,2})\s*(?:월\s*|[./])\s*(\d{1,2})\s*일?/);
  if (md) {
    const y = new Date(today + KST).getUTCFullYear();
    return `${y}-${String(Number(md[1])).padStart(2, "0")}-${String(Number(md[2])).padStart(2, "0")}`;
  }
  const wd = t.match(/(다음\s*주\s*)?([일월화수목금토])요일/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[2]);
    const dow = new Date(today + KST).getUTCDay();
    if (wd[1]) {
      // 「다음 주 ○요일」 = 다음 주(월~일)의 그 요일
      const mondayThis = today - ((dow + 6) % 7) * DAY;
      return kstDateText(mondayThis + 7 * DAY + ((target + 6) % 7) * DAY);
    }
    return kstDateText(today + ((target - dow + 7) % 7) * DAY);
  }
  return null;
}

const TODO_WORDS = /(해야|하기|확인|연락|보내|발송|전화|문의|답장|챙기|주문하|사입|입고|환불|교환|반품|처리|까지|해주|해 주|올리|등록)/;
const PRODUCT_WORDS = /(재고|입고|품절|사입|추가\s*주문|사이즈|색상|컬러|상품)/;

/** AI 없이 정리: «줄»로만 나눠서 분류 — [2026-10-23 사장님] 쉼표로 쪼개면 「몽상가8277, 몽몽이」 같은 한 문장이 갈라져 헷갈림 */
export function organizeByRule(text: string, nowMs: number): MemoItem[] {
  const parts = String(text ?? "")
    .split(/\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.slice(0, 20).map((body) => {
    const due = parseDueWords(body, nowMs);
    const kind: MemoKind = PRODUCT_WORDS.test(body) && !/(연락|답장|전화)/.test(body) ? "product" : TODO_WORDS.test(body) || due ? "todo" : "note";
    return { kind, body, due_date: due, who: null, product: null };
  });
}

/** AI 가 돌려준 JSON 검사 — 정해진 모양만 통과. 이상하면 null */
// AI 가 상품 칸에 «일» 이름을 넣는 경우(실측: 「교환」) — 상품 이름이 아니면 버린다
const NOT_PRODUCT = /^(교환|반품|환불|택배|배송|발송|재고|주문|입고|연락|문의|입금|결제|사이즈|색상|옵션)$/;

export function parseOrganizeJson(text: string, restore: (s: string) => string = (s) => s, nowMs: number = Date.now()): MemoItem[] | null {
  try {
    const body = String(text ?? "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const obj = JSON.parse(body) as { items?: unknown };
    const list = Array.isArray(obj) ? obj : Array.isArray(obj?.items) ? obj.items : null;
    if (!list || list.length === 0) return null;
    const items: MemoItem[] = [];
    for (const raw of list.slice(0, 20)) {
      const r = (raw || {}) as Record<string, unknown>;
      const kind = MEMO_KINDS.includes(r.kind as MemoKind) ? (r.kind as MemoKind) : "note";
      const text = restore(String(r.text ?? r.body ?? "").trim()).slice(0, 300);
      if (!text) continue;
      // 날짜는 AI 계산을 믿지 않는다(실측: 「금요일」을 하루 틀림) — 그 줄 글자에서 우리 규칙으로 계산
      const due = parseDueWords(text, nowMs);
      const who = restore(String(r.who ?? "").trim()).slice(0, 40) || null;
      const productRaw = restore(String(r.product ?? "").trim()).slice(0, 60);
      const product = productRaw && !NOT_PRODUCT.test(productRaw) ? productRaw : null;
      items.push({ kind, body: text, due_date: due, who, product });
    }
    return items.length ? items : null;
  } catch {
    return null;
  }
}

/** [2026-10-23 15:14 사장님 「문장이 하나인데 멋대로 3개로 나눠 헷갈려」] 한 줄로 적은 메모는 한 장으로.
 *  여러 건은 사장님이 «줄을 바꿔» 적은 경우에만 나뉜다. AI 가 한 줄을 여러 개로 쪼개 오면 합친다:
 *  내용 = 사장님 원문 그대로, 손님·상품 = AI 가 찾은 첫 값, 종류 = 할 일 > 손님 > 상품 > 기억할 것. */
export function mergeSingleLine(raw: string, items: MemoItem[], nowMs: number = Date.now()): MemoItem[] {
  const lines = String(raw ?? "").split(/\n/).map((x) => x.trim()).filter(Boolean);
  if (items.length <= lines.length) return items;
  if (lines.length !== 1) return items;
  const body = lines[0].slice(0, 300);
  const order: MemoKind[] = ["todo", "customer", "product", "note"];
  const kind = order.find((k) => items.some((it) => it.kind === k)) || "note";
  const who = items.map((it) => it.who).filter(Boolean)[0] || null;
  const product = items.map((it) => it.product).filter(Boolean)[0] || null;
  return [{ kind, body, due_date: parseDueWords(body, nowMs), who, product }];
}

export function organizePrompt(maskedText: string, nowMs: number): string {
  const today = kstDateText(nowMs);
  const dow = WEEKDAYS[new Date(nowMs + KST).getUTCDay()];
  return `너는 쇼핑몰 사장님의 메모 정리 비서다. 아래 메모를 정리해 JSON 으로만 답한다.
- 사장님이 «줄을 바꿔» 적은 줄마다 item 하나. 한 줄 안의 내용은 절대 여러 item 으로 나누지 말 것(쉼표가 있어도 한 이야기다).
- 「닉네임 ○○」「○○님」처럼 적힌 손님은 who 에(여러 이름이면 쉼표로 함께), 상품 번호·이름은 product 에.
모양: {"items":[{"kind":"todo|customer|product|note","text":"그 줄을 다듬은 한 문장(사장님 말투 그대로, 100자 안)","due":"YYYY-MM-DD 또는 빈칸","who":"손님 이름·닉네임 또는 빈칸","product":"상품 이름 또는 빈칸"}]}
- todo = 해야 할 일(연락·발송·확인·주문 등), customer = 손님에 대한 정보·부탁, product = 상품·재고·입고, note = 그냥 기억할 것
- text 는 그 줄을 보기 좋게 다듬은 한 문장(손님·상품·내용이 다 들어가게, 빠뜨리지 말 것).
- 날짜 말(오늘·내일·금요일·10월 25일)은 text 안에 그대로 남길 것(due 는 빈칸으로 둬도 됨). 오늘은 ${today}(${dow}).
- product 는 상품 이름만(교환·반품·택배 같은 일 이름은 넣지 말 것).
- 없는 내용을 만들지 말 것. [번호1] 같은 자리표는 그대로 둘 것. 설명 없이 JSON 하나만.
메모:
${maskedText}`;
}

// ───── [AI-5] 메모 줄 → 고객이슈 등록 «제안» (자동 등록 없음 — 사장님이 카드에서 [등록] 눌러야 함) ─────
export type IssueSuggestion = { issueType: "exchange" | "refund" | "return" | "general"; label: string };

/** 손님 이슈처럼 보이는 줄인지(교환·반품·환불·불량·오배송·사이즈 교환 등). 재고·입고 같은 상품 메모는 아님 */
export function suggestIssueFromMemo(item: { kind: MemoKind; body: string; who: string | null }): IssueSuggestion | null {
  const t = String(item.body ?? "");
  if (/(교환)/.test(t)) return { issueType: "exchange", label: "교환" };
  if (/(환불)/.test(t)) return { issueType: "refund", label: "환불" };
  if (/(반품)/.test(t)) return { issueType: "return", label: "반품" };
  if (/(불량|오배송|파손|잘못\s*감|누락|안\s*왔|못\s*받|클레임|항의|컴플레인)/.test(t)) return { issueType: "general", label: "기타" };
  return null;
}
