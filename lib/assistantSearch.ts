// lib/assistantSearch.ts
// [2026-10-22 AI 비서 1단계] 닉네임·이름·상품명을 «대충» 입력해도 비슷한 것을 찾는 순수 함수 모음.
//   - 서버(app/api/admin-live/assistant)와 테스트(scripts/test-assistant-search.mjs)가 같이 쓴다.
//   - 읽기 전용 검색에만 쓴다. 돈·주문·포인트 판정과 무관.
//
// 일치 종류(순서대로 위에 보임)
//   exact   : 공백·기호·대소문자·끝 꼬리표(-f2h 같은 것)를 빼고 같음        「홍길동」 = 「홍길동-f2h」
//   partial : 일부가 들어 있음                                                「홍길」 ⊂ 「홍길동-f2h」
//   choseong: 초성만 입력                                                     「ㅎㄱㄷ」 → 「홍길동」
//   typo    : 자모 한두 개 틀림                                               「홍길돈」 → 「홍길동」
//   (여러 단어) 단어가 다 들어 있으면 partial, 일부 단어만 맞으면 word        「프라다 가방」 → 「프라다 나일론백」(word)

import { parseStatQuestion, PERIOD_KEYS, STAT_KINDS, type PeriodKey, type StatKind } from "./statQuestionParse";

export type MatchKind = "exact" | "partial" | "choseong" | "typo" | "word";
export const MATCH_KIND_RANK: Record<MatchKind, number> = { exact: 0, partial: 1, choseong: 2, typo: 3, word: 4 };
export const MATCH_KIND_LABEL: Record<MatchKind, string> = {
  exact: "일치",
  partial: "일부 일치",
  choseong: "초성",
  typo: "비슷한 글자",
  word: "단어 일부",
};

const CHOSEONG_LIST = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

/** 비교용 글자: NFKC·소문자·글자/숫자만 남김. 저장값은 건드리지 않는다. */
export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    // NFKC 가 초성 「ㅎ」(호환 자모)를 조합용 자모(U+1100~)로 바꿔 버려서 되돌린다.
    .replace(/[\u1100-\u1112]/g, (ch) => CHOSEONG_LIST[ch.charCodeAt(0) - 0x1100])
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}ㄱ-ㅎ]+/gu, "");
}

/** 「홍길동-f2h」 「홍길동_123」 「홍길동 #a1」 → 「홍길동」. 꼬리표가 없으면 그대로. */
export function stripNicknameSuffix(value: unknown): string {
  const text = String(value ?? "").normalize("NFKC").trim();
  const m = text.match(/^(.+?)\s*[-_#@.]\s*[a-z0-9]{1,8}$/i);
  if (m && /[\p{L}]/u.test(m[1])) return m[1];
  return text;
}

const CHOSEONG = CHOSEONG_LIST;
const JUNGSEONG = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
const JONGSEONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

function syllableIndex(ch: string): number {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 ? code : -1;
}

/** 초성 문자열: 「홍길동」 → 「ㅎㄱㄷ」 (한글 아닌 글자는 그대로) */
export function toChoseong(value: string): string {
  let out = "";
  for (const ch of value) {
    const i = syllableIndex(ch);
    out += i >= 0 ? CHOSEONG[Math.floor(i / 588)] : ch;
  }
  return out;
}

/** 자모 배열: 「홍」 → [ㅎ, ㅗ, ㅇ]. 오타 거리 계산용. */
export function toJamo(value: string): string[] {
  const out: string[] = [];
  for (const ch of value) {
    const i = syllableIndex(ch);
    if (i < 0) { out.push(ch); continue; }
    out.push(CHOSEONG[Math.floor(i / 588)], JUNGSEONG[Math.floor((i % 588) / 28)]);
    const jong = JONGSEONG[i % 28];
    if (jong) out.push(jong);
  }
  return out;
}

export function isChoseongOnly(value: string): boolean {
  return value.length >= 2 && /^[ㄱ-ㅎ]+$/.test(value);
}

function editDistance(a: string[], b: string[], limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** 자모 몇 개까지 틀려도 되는지 — 짧은 말은 1개, 길면 조금 더. */
function typoLimit(jamoLength: number): number {
  if (jamoLength < 4) return 0; // 한 글자 정도는 오타 판정 안 함(엉뚱한 사람이 너무 많이 나옴)
  if (jamoLength <= 9) return 1;
  return 2;
}

/**
 * 검색어 query 가 후보 candidate(닉네임·이름·상품명 등)와 얼마나 맞는지.
 * 안 맞으면 null.
 */
export function matchText(query: string, candidate: unknown): MatchKind | null {
  const single = matchSingle(query, candidate);
  if (single) return single;
  // 띄어 쓴 여러 단어: 다 들어 있으면 일부 일치, 2글자 넘는 단어 하나라도 맞으면 「단어 일부」
  const words = String(query ?? "").split(/\s+/).map(normalizeSearchText).filter((w) => w.length >= 2);
  if (words.length < 2) return null;
  const c = normalizeSearchText(candidate);
  if (!c) return null;
  const hits = words.filter((w) => c.includes(w)).length;
  if (hits === words.length) return "partial";
  if (hits > 0) return "word";
  return null;
}

function matchSingle(query: string, candidate: unknown): MatchKind | null {
  const q = normalizeSearchText(query);
  const raw = String(candidate ?? "");
  const c = normalizeSearchText(raw);
  if (!q || !c) return null;
  const core = normalizeSearchText(stripNicknameSuffix(raw));
  // 검색어 쪽 꼬리표 떼기는 한글 닉네임일 때만(「PD-206」 같은 상품번호를 「PD」로 줄이면 엉뚱한 게 다 걸림)
  const qStripped = normalizeSearchText(stripNicknameSuffix(query));
  const qCore = /[가-힣]/.test(qStripped) ? qStripped : q;

  if (c === q || (core && (core === q || core === qCore))) return "exact";
  if (c.includes(q) || (qCore && qCore !== q && c.includes(qCore))) return "partial";

  if (isChoseongOnly(q)) {
    return toChoseong(c).includes(q) ? "choseong" : null;
  }

  // 오타: 후보 앞부분(검색어와 같은 글자 수 ±1)·전체·꼬리표 뗀 이름과 자모 거리 비교
  // 숫자가 든 검색어(상품번호·사이즈)는 오타로 넓히지 않는다 — 202 ↔ 206 같은 다른 상품이 섞임
  if (/\d/.test(q)) return null;
  const qj = toJamo(qCore || q);
  const limit = typoLimit(qj.length);
  if (limit === 0) return null;
  const targets = new Set<string>([c, core]);
  const qLen = Array.from(qCore || q).length;
  const chars = Array.from(c);
  for (let start = 0; start < chars.length; start++) {
    for (const len of [qLen - 1, qLen, qLen + 1]) {
      if (len >= 2 && start + len <= chars.length) targets.add(chars.slice(start, start + len).join(""));
    }
  }
  for (const t of targets) {
    if (!t) continue;
    if (editDistance(qj, toJamo(t), limit) <= limit) return "typo";
  }
  return null;
}

/** 여러 칸(닉네임·이름·입금자명…) 중 가장 잘 맞는 것 */
export function bestMatch(
  query: string,
  fields: { label: string; value: unknown }[],
): { kind: MatchKind; label: string; value: string } | null {
  let best: { kind: MatchKind; label: string; value: string } | null = null;
  for (const f of fields) {
    const kind = matchText(query, f.value);
    if (!kind) continue;
    if (!best || MATCH_KIND_RANK[kind] < MATCH_KIND_RANK[best.kind]) {
      best = { kind, label: f.label, value: String(f.value ?? "") };
    }
  }
  return best;
}

/** 전화번호 가리기: 01012345678 → 010-****-5678 */
export function maskPhone(value: unknown): string {
  const d = String(value ?? "").replace(/\D/g, "");
  if (d.length < 8) return d ? "****" : "";
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

export type AssistantIntent = {
  intent: "customer" | "product" | "stats" | "unknown";
  /** 찾을 손님 이름/닉네임 */
  name: string;
  /** 찾을 상품 이름 */
  product: string;
  /** [AI-2] 숫자 질문: 잘 나간 상품 / 많이 산 손님 / 매출·미입금 */
  stat?: StatKind;
  period?: PeriodKey;
  /** period=date 일 때 YYYY-MM-DD */
  date?: string;
};

const PRODUCT_WORDS = /(상품|제품|챙기|챙겨|물건|옵션|사이즈|색상|컬러|재고|샀|팔렸|팔린|구매자|산\s*사람)/;
const FILLER_WORDS = /(찾아\s*줘|찾아줘|찾아|보여\s*줘|보여줘|알려\s*줘|알려줘|정리해\s*줘|정리해줘|목록|주문한\s*사람|주문자|주문|손님|고객|님|좀|누구|최근|날짜|뭐|무슨|산\s*사람|구매자|구매|누가|샀어|샀나|샀는지|팔렸어|팔린|챙기기|챙겨\s*줘|챙겨줘|해\s*줘|해줘|있어\??|이야\??|\?)/g;

/** AI 없이도 되는 간단 해석(키가 없거나 AI 호출이 실패했을 때). */
export function parseIntentByRule(text: string, nowMs: number = Date.now()): AssistantIntent {
  const raw = String(text ?? "").trim();
  const stat = parseStatQuestion(raw, nowMs);
  if (stat) return { intent: "stats", name: "", product: "", ...stat };
  const cleaned = raw.replace(FILLER_WORDS, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return { intent: "unknown", name: "", product: "" };
  if (PRODUCT_WORDS.test(raw)) {
    const product = cleaned.replace(/(상품|제품|물건|옵션)/g, " ").replace(/\s+/g, " ").trim();
    return { intent: "product", name: "", product };
  }
  return { intent: "customer", name: cleaned, product: "" };
}

/** 「홍길이라는」「홍길님」「홍길이」처럼 이름 끝에 붙은 말 떼기(찾는 결과가 없을 때 한 번 더 찾는 용도) */
export function trimNameParticle(value: string): string {
  const t = String(value ?? "").trim();
  const m = t.match(/^(.{2,}?)(이라는|라는|이란|님이|님|씨|이가|이는|이를|이|가|은|는|을|를)$/);
  return m ? m[1] : t;
}

/** AI 응답(JSON 글자)을 안전하게 읽기. 이상하면 null. */
export function parseIntentJson(text: string): AssistantIntent | null {
  try {
    const body = String(text ?? "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const obj = JSON.parse(body) as Partial<AssistantIntent>;
    const intent = obj.intent === "customer" || obj.intent === "product" || obj.intent === "stats" ? obj.intent : "unknown";
    const name = String(obj.name ?? "").trim().slice(0, 40);
    const product = String(obj.product ?? "").trim().slice(0, 60);
    if (intent === "stats") {
      // 숫자 질문: 정해진 값만 받는다(이상한 값이면 null → 규칙 해석으로)
      if (!STAT_KINDS.includes(obj.stat as StatKind)) return null;
      // [10/22] 기간 말이 없으면 period 비움(화면 칩 최근 3개월/전체로 정함). 모르는 값도 비움
      const period = PERIOD_KEYS.includes(obj.period as PeriodKey) ? (obj.period as PeriodKey) : undefined;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(obj.date ?? "")) ? String(obj.date) : undefined;
      if (period === "date" && !date) return null;
      return { intent, name: "", product: "", stat: obj.stat as StatKind, ...(period ? { period } : {}), ...(date ? { date } : {}) };
    }
    if (intent === "customer" && !name) return null;
    if (intent === "product" && !product) return null;
    return { intent, name, product };
  } catch {
    return null;
  }
}
