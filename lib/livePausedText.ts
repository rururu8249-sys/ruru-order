// [2026-11-09 사장님 「잠시 쉬는 중 문구 내가 수정할 수 있게」] 손님 화면 방송 상자 「잠시 쉬는 중」 문구.
//   settings 한 키(live_paused_text). 관리자 「방송 관리」 창에서 저장, 손님 화면 loadBroadcast 가 읽는다. 표시만(돈·주문 무관).
export const LIVE_PAUSED_TEXT_KEY = "live_paused_text";
export const LIVE_PAUSED_TEXT_DEFAULT = "잠시 쉬는 중 · 곧 다시 시작해요";
export const LIVE_PAUSED_TEXT_MAX = 40;

/** 저장값이 비어 있으면 기본 문구. 길이는 최대 글자수로 자른다. */
export function resolveLivePausedText(raw: unknown): string {
  const v = String(raw ?? "").trim();
  return v ? v.slice(0, LIVE_PAUSED_TEXT_MAX) : LIVE_PAUSED_TEXT_DEFAULT;
}
