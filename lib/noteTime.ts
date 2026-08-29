// lib/noteTime.ts
// 쪽지·공지 시각 표기. 화면(CustomerSiteAlertPopup)과 테스트가 같은 함수를 쓴다.
//
// [2026-08-30 사장님 지적] "년월일 요일이 왜 없냐"
//   예전엔 `08.30 06:33` 만 보여줘서 언제 온 쪽지인지 알 수 없었다.
//
// 한국시간 고정: 서버 시각(UTC)에 9시간을 더한 뒤 getUTC* 로 읽는다.
//   손님 기기의 시간대 설정이 어떻든 항상 한국시간으로 나온다.
//   (해외 손님이 폰 시간대를 현지로 두면 new Date().getHours() 는 엉뚱한 값이 나온다)

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

/** `2026.08.30(일) 06:33` — 값이 이상하면 빈 문자열 */
export function noteTimeText(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 9 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p2(d.getUTCMonth() + 1)}.${p2(d.getUTCDate())}(${WEEKDAY_KR[d.getUTCDay()]}) ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** 하루 안에 온 것만 `10분 전` 같은 말을 덧붙인다. 그 이상·미래·이상한 값은 빈 문자열 */
export function noteAgoText(iso: string, nowMs: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = nowMs - t;
  if (diff < 0 || diff >= 24 * 60 * 60 * 1000) return "";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
}
