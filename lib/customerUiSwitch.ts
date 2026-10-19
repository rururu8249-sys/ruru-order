// [㉜ 2026-10-18] 손님화면 모양 스위치 판정(순수 함수). 화면 모양만 고른다 — 동작·계산 무관.
//   주소 ?ui=v2 → 저장 "1"(새 모양) / ?ui=v1 → 저장 "0"(예전 모양, 비상 복귀) / 저장값 없으면 기본값.
export type UiSwitchDecision = { store: "1" | "0" | null; v2: boolean };

// [㉜ 2026-10-18 사장님 확정] 손님 기본값 = 새 모양(v2). 예전 모양으로 전체 되돌리려면 이 값만 false 로.
//   true  : 아무 값 없는 손님 = 새 모양, ?ui=v1 고른 브라우저(저장값 "0")만 예전 모양.
//   false : ?ui=v2 고른 브라우저(저장값 "1")만 새 모양.
//   (4단계부터 /myorder·/notice 도 같은 값을 읽어서 여기로 옮김 — 예전엔 app/order/page.tsx 안 상수)
export const UI_V2_DEFAULT = true;
export const UI_V2_STORAGE_KEY = "ruru_ui_v2";

export function resolveCustomerUiV2(want: string | null, saved: string | null, defaultV2: boolean): UiSwitchDecision {
  const store = want === "v2" ? "1" : want === "v1" ? "0" : null;
  const effective = store ?? saved;
  return { store, v2: effective === "1" ? true : effective === "0" ? false : defaultV2 };
}

// [㉜ 3~5단계] 단계별 미리보기 — ?preview=s3 (s4·s5) 로 들어온 브라우저만 그 단계 새 모양. ?preview=off 는 전부 끔.
//   손님 기본값으로 전환하려면 아래 값만 true 로(단계마다 한 줄). 저장 키는 ruru_preview_s3 등.
// 2026-10-18 s3(주문서 확인 창)·s4(주문내역·공지·쪽지 창)·s5(나머지 손님 창·첫 화면 이모지) 손님 기본값 전환 — 되돌리려면 그 단계를 false 로.
export const UI_PREVIEW_DEFAULTS = { s3: true, s4: true, s5: true, s6: true, s7: true } as const; // 2026-10-20 s6(첫 화면 정리) 기본 전환
export type UiPreviewStage = keyof typeof UI_PREVIEW_DEFAULTS;
export const uiPreviewStorageKey = (stage: UiPreviewStage) => `ruru_preview_${stage}`;

export function resolveCustomerUiPreview(want: string | null, saved: string | null, stage: UiPreviewStage, defaultOn: boolean): UiSwitchDecision {
  const store = want === stage ? "1" : want === "off" ? "0" : null;
  const effective = store ?? saved;
  return { store, v2: effective === "1" ? true : effective === "0" ? false : defaultOn };
}

/** 브라우저에서 한 단계 미리보기 켜짐 여부(주소 읽고 저장까지). 저장소를 못 쓰면 기본값. */
export function readCustomerUiPreview(stage: UiPreviewStage): boolean {
  try {
    const key = uiPreviewStorageKey(stage);
    const d = resolveCustomerUiPreview(new URLSearchParams(window.location.search).get("preview"), window.localStorage.getItem(key), stage, UI_PREVIEW_DEFAULTS[stage]);
    if (d.store) window.localStorage.setItem(key, d.store);
    return d.v2;
  } catch {
    return UI_PREVIEW_DEFAULTS[stage];
  }
}

/** 브라우저에서 새 모양(v2) 켜짐 여부(주소 ?ui= 읽고 저장까지). 저장소를 못 쓰면 기본값. */
export function readCustomerUiV2(): boolean {
  try {
    const d = resolveCustomerUiV2(new URLSearchParams(window.location.search).get("ui"), window.localStorage.getItem(UI_V2_STORAGE_KEY), UI_V2_DEFAULT);
    if (d.store) window.localStorage.setItem(UI_V2_STORAGE_KEY, d.store);
    return d.v2;
  } catch {
    return UI_V2_DEFAULT;
  }
}
