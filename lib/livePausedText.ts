// [2026-11-09 사장님 「잠시 쉬는 중 문구 내가 수정할 수 있게」] 손님 화면 방송 상자 「잠시 쉬는 중」 문구.
//   settings 한 키(live_paused_text). 관리자 「방송 관리」 창에서 저장, 손님 화면 loadBroadcast 가 읽는다. 표시만(돈·주문 무관).
export const LIVE_PAUSED_TEXT_KEY = "live_paused_text";
export const LIVE_PAUSED_TEXT_DEFAULT = "잠시 쉬는 중 · 곧 다시 시작해요";
export const LIVE_PAUSED_TEXT_MAX = 80;
export const LIVE_PAUSED_TEXT_MAX_LINES = 3;

/** 줄바꿈 유지(최대 3줄·빈 줄 뺌)·최대 글자수로 자름. 관리자 저장·손님 표시 공통. */
export function normalizeLivePausedText(raw: unknown): string {
  return String(raw ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean)
    .slice(0, LIVE_PAUSED_TEXT_MAX_LINES).join("\n").slice(0, LIVE_PAUSED_TEXT_MAX);
}

/** 저장값이 비어 있으면 기본 문구. */
export function resolveLivePausedText(raw: unknown): string {
  const v = normalizeLivePausedText(raw);
  return v || LIVE_PAUSED_TEXT_DEFAULT;
}
