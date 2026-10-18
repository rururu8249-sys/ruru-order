"use client";
// [㉜ 4단계~] 손님 화면 부품이 «이 단계 새 모양을 보여줄지» 읽는 훅.
//   = 새 모양(v2) 켜짐 && 그 단계 미리보기/기본값 켜짐. ?ui=v1 손님은 항상 false(예전 화면).
//   서버 렌더와 첫 화면을 맞추려고 처음엔 기본값, 화면이 뜬 뒤 저장값을 읽는다. 표시 전용.
import { useEffect, useState } from "react";
import { readCustomerUiPreview, readCustomerUiV2, UI_PREVIEW_DEFAULTS, UI_V2_DEFAULT, type UiPreviewStage } from "@/lib/customerUiSwitch";

export function useCustomerUiStage(stage: UiPreviewStage): boolean {
  const [on, setOn] = useState<boolean>(UI_V2_DEFAULT && UI_PREVIEW_DEFAULTS[stage]);
  useEffect(() => {
    setOn(readCustomerUiV2() && readCustomerUiPreview(stage));
  }, [stage]);
  return on;
}

// [㉜ 5단계] 단계가 켜졌을 때만 인라인 스타일(restyleV2)·클래스(restyleClassV2)를 새 모양으로 바꿔 주는 도우미.
//   꺼져 있으면 넘긴 값 그대로 돌려준다 → 예전 화면 변화 0.
import type { CSSProperties } from "react";
import { restyleClassV2, restyleV2 } from "@/lib/customerUiV2Restyle";

export function useCustomerStageRestyle(stage: UiPreviewStage, options: { keepShadow?: boolean } = {}) {
  const on = useCustomerUiStage(stage);
  const keepShadow = options.keepShadow === true;
  return {
    on,
    s: (style: CSSProperties | undefined): CSSProperties | undefined => (on ? restyleV2(style, { keepShadow }) : style),
    c: (className: string | undefined): string | undefined => (on ? restyleClassV2(className, { keepShadow }) : className),
  };
}
