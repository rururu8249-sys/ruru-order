// [㉜ 2026-10-18] 손님화면 모양 스위치 판정(순수 함수). 화면 모양만 고른다 — 동작·계산 무관.
//   주소 ?ui=v2 → 저장 "1"(새 모양) / ?ui=v1 → 저장 "0"(예전 모양, 비상 복귀) / 저장값 없으면 기본값.
export type UiSwitchDecision = { store: "1" | "0" | null; v2: boolean };

export function resolveCustomerUiV2(want: string | null, saved: string | null, defaultV2: boolean): UiSwitchDecision {
  const store = want === "v2" ? "1" : want === "v1" ? "0" : null;
  const effective = store ?? saved;
  return { store, v2: effective === "1" ? true : effective === "0" ? false : defaultV2 };
}
