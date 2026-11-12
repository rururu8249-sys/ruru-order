/**
 * [2026-11-13 사장님 「관리자 PC 단축키 — 매번 같은 말 쓰기 힘들어」] 사이트 채팅 «자주 쓰는 말».
 *   settings 한 줄(JSON 배열). 손님에게 보여도 되는 문구만(채팅에 올리는 말). 돈·주문 무관.
 *   채팅 관리자 누구나 같은 목록을 씀(기기 달라도 같음).
 */
export const QUICK_PHRASES_KEY = "live_chat_quick_phrases_v1";
export const QUICK_PHRASES_MAX = 12;
export const QUICK_PHRASE_MAX_LEN = 100; // 채팅 한 글 길이와 같음

export const DEFAULT_QUICK_PHRASES = [
  "루루스펙 159cm/48kg",
  "화면 오른쪽 상단에 현재 소개중인 상품 잘 봐주시면 구매에 도움이 되실거에요~",
];

/** 줄바꿈·앞뒤 공백 정리, 빈 줄·중복 빼기, 길이·개수 자르기. */
export function cleanQuickPhrases(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const s = Array.from(v.replace(/[\u0000-\u001F\u007F-]/g, " ").replace(/\s+/g, " ").trim()).slice(0, QUICK_PHRASE_MAX_LEN).join("").trim();
    if (!s || s.startsWith("/") || out.includes(s)) continue; // 「/」로 시작하면 관리자 명령으로 읽혀서 뺌
    out.push(s);
    if (out.length >= QUICK_PHRASES_MAX) break;
  }
  return out;
}

/** 저장값(JSON 글자 또는 배열) → 목록. 한 번도 저장 안 했으면 기본 문구. */
export function readQuickPhrases(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [...DEFAULT_QUICK_PHRASES];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? cleanQuickPhrases(parsed) : [...DEFAULT_QUICK_PHRASES];
  } catch { return [...DEFAULT_QUICK_PHRASES]; }
}

/** 입력칸에 넣기: 비어 있으면 그 말로, 쓰던 글이 있으면 뒤에 붙임. */
export function insertQuickPhrase(draft: string, phrase: string, maxLen: number): string {
  const d = draft.trim();
  return Array.from(d ? `${d} ${phrase}` : phrase).slice(0, maxLen).join("");
}

/** Alt(Option)+숫자 → 몇 번째 말인지(0부터). 아니면 -1. 맥은 Option+숫자가 특수문자라 code 로 봄. */
export function quickPhraseIndexFromKey(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; code: string }): number {
  if (!e.altKey || e.ctrlKey || e.metaKey) return -1;
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || "");
  return m ? Number(m[1]) - 1 : -1;
}
