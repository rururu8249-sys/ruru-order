// [2026-10-21 a1-3] 관리자 화면 모양 미리보기 스위치(순수 판정 + 브라우저 읽기). 화면 색만 고른다 — 동작·계산 무관.
//   lib/customerUiSwitch 의 단계별 미리보기와 같은 방식.
//   주소 ?preview=a1 → 저장 "1"(새 색) / ?preview=off → 저장 "0"(예전 색) / 주소 없으면 저장값 / 저장값 없으면 기본값.
//   관리자 전원 기본값으로 전환하려면 아래 a1 만 true 로. 저장 키는 ruru_admin_preview_a1.
export type AdminUiSwitchDecision = { store: "1" | "0" | null; on: boolean };

export const ADMIN_PREVIEW_DEFAULTS = { a1: true, a2: true } as const;   // a2 = 상품 등록 폼 새 배치(2026-10-21 a2-2b 기본 켜기)
export type AdminPreviewStage = keyof typeof ADMIN_PREVIEW_DEFAULTS;
export const adminPreviewStorageKey = (stage: AdminPreviewStage) => `ruru_admin_preview_${stage}`;

export function resolveAdminUiPreview(want: string | null, saved: string | null, stage: AdminPreviewStage, defaultOn: boolean): AdminUiSwitchDecision {
  const store = want === stage ? "1" : want === "off" ? "0" : null;
  const effective = store ?? saved;
  return { store, on: effective === "1" ? true : effective === "0" ? false : defaultOn };
}

/** 브라우저에서 한 단계 미리보기 켜짐 여부(주소 읽고 저장까지). 저장소를 못 쓰면 기본값. */
export function readAdminUiPreview(stage: AdminPreviewStage): boolean {
  try {
    const key = adminPreviewStorageKey(stage);
    const d = resolveAdminUiPreview(new URLSearchParams(window.location.search).get("preview"), window.localStorage.getItem(key), stage, ADMIN_PREVIEW_DEFAULTS[stage]);
    if (d.store) window.localStorage.setItem(key, d.store);
    return d.on;
  } catch {
    return ADMIN_PREVIEW_DEFAULTS[stage];
  }
}
