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
export function maskSensitive(text: string): { masked: string; restore: (s: string) => string } {
  const found: string[] = [];
  const masked = String(text ?? "").replace(/(?:\+?82[-\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|\d[\d\s-]{8,}\d/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 9) return m;
    found.push(m);
    return `[번호${found.length}]`;
  });
  const restore = (s: string) => String(s ?? "").replace(/\[번호(\d+)\]/g, (all, n) => found[Number(n) - 1] ?? all);
  return { masked, restore };
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

/** AI 없이 정리: 줄·쉼표·「그리고」로 나눠서 분류 */
export function organizeByRule(text: string, nowMs: number): MemoItem[] {
  const parts = String(text ?? "")
    .split(/\n|,|，|·|;|\s그리고\s/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.slice(0, 20).map((body) => {
    const due = parseDueWords(body, nowMs);
    const kind: MemoKind = PRODUCT_WORDS.test(body) && !/(연락|답장|전화)/.test(body) ? "product" : TODO_WORDS.test(body) || due ? "todo" : "note";
    return { kind, body, due_date: due, who: null, product: null };
  });
}

/** AI 가 돌려준 JSON 검사 — 정해진 모양만 통과. 이상하면 null */
export function parseOrganizeJson(text: string, restore: (s: string) => string = (s) => s): MemoItem[] | null {
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
      const due = /^\d{4}-\d{2}-\d{2}$/.test(String(r.due ?? r.due_date ?? "")) ? String(r.due ?? r.due_date) : null;
      const who = restore(String(r.who ?? "").trim()).slice(0, 40) || null;
      const product = restore(String(r.product ?? "").trim()).slice(0, 60) || null;
      items.push({ kind, body: text, due_date: due, who, product });
    }
    return items.length ? items : null;
  } catch {
    return null;
  }
}

export function organizePrompt(maskedText: string, nowMs: number): string {
  const today = kstDateText(nowMs);
  const dow = WEEKDAYS[new Date(nowMs + KST).getUTCDay()];
  return `너는 쇼핑몰 사장님의 메모 정리 비서다. 아래 메모를 짧은 줄로 나눠 JSON 으로만 답한다.
모양: {"items":[{"kind":"todo|customer|product|note","text":"한 줄 요약(사장님 말투 그대로, 50자 안)","due":"YYYY-MM-DD 또는 빈칸","who":"손님 이름·닉네임 또는 빈칸","product":"상품 이름 또는 빈칸"}]}
- todo = 해야 할 일(연락·발송·확인·주문 등), customer = 손님에 대한 정보·부탁, product = 상품·재고·입고, note = 그냥 기억할 것
- 날짜 말(오늘·내일·금요일·10월 25일)은 due 로. 오늘은 ${today}(${dow}).
- 없는 내용을 만들지 말 것. [번호1] 같은 자리표는 그대로 둘 것. 설명 없이 JSON 하나만.
메모:
${maskedText}`;
}
