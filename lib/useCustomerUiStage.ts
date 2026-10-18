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
