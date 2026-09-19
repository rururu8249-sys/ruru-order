"use client";

// [2026-09-20 사장님] 「닫는 방식 전부 동일하게」 — 손님 화면 «가운데 확인창» 한 벌 틀.
//   바텀시트(CustomerBottomSheet)와 같은 훅(useCustomerOverlayClose)을 써서 닫기 방식이 같다:
//   ✕(있을 때) · 배경 탭 · 안드로이드 뒤로가기 · ESC → requestClose 한 곳.
//   버튼 규칙: 「되돌릴 수 없는 결정」은 1:1 [취소][주 버튼] / 안내만이면 풀폭 주 버튼 1개.
//   왼쪽 버튼 글자는 항상 「취소」(cancelLabel 로만 바꾼다 — 예: 새 쪽지 「확인했어요」).
//   z 120 = 확인창 층(시트 100·110 위). 돈·주문 로직 없음 — 표시·닫기 전용.

import type { ReactNode } from "react";
import { useCustomerOverlayClose, csPrimaryButtonStyle, csCancelButtonStyle } from "./CustomerBottomSheet";

export const CS_DIALOG_Z = 120;

type Props = {
  open: boolean;
  /** 닫기(✕·배경·뒤로가기·ESC·취소 버튼)가 전부 이 함수로 온다. */
  onClose: () => void;
  title: ReactNode;
  /** 제목 위 큰 이모지(선택) */
  icon?: ReactNode;
  children?: ReactNode;
  /** 주 버튼. 없으면 푸터 없음. */
  primary?: { label: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean };
  /** 1:1 왼쪽 「취소」 버튼을 숨기고 주 버튼만 풀폭으로 */
  hideCancel?: boolean;
  cancelLabel?: string;
  /** 우상단 ✕ (기본 true) */
  showClose?: boolean;
  /** 배경 탭으로 닫기 (기본 true) */
  backdropClose?: boolean;
  closeGuard?: () => boolean;
  closeDisabled?: boolean;
  zIndex?: number;
  width?: number;
  ariaLabel?: string;
};

export default function CustomerDialog({
  open,
  onClose,
  title,
  icon,
  children,
  primary,
  hideCancel = false,
  cancelLabel = "취소",
  showClose = true,
  backdropClose = true,
  closeGuard,
  closeDisabled = false,
  zIndex = CS_DIALOG_Z,
  width = 340,
  ariaLabel,
}: Props) {
  const { key, requestClose } = useCustomerOverlayClose({ open, onClose, closeGuard, closeDisabled });
  if (!open) return null;

  return (
    <div
      onClick={(event) => {
        if (backdropClose && event.target === event.currentTarget) requestClose();
      }}
      style={{ position: "fixed", inset: 0, zIndex, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={typeof title === "string" ? key : undefined}
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
        style={{ width: `${width}px`, maxWidth: "100%", maxHeight: "calc(100dvh - 80px)", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "20px", boxShadow: "0 18px 50px rgba(0,0,0,0.28)", overflow: "hidden" }}
      >
        <div style={{ flexShrink: 0, display: "flex", alignItems: "flex-start", gap: "8px", padding: showClose ? "14px 12px 0 20px" : "22px 20px 0" }}>
          <div style={{ flex: 1, minWidth: 0, paddingTop: showClose ? "6px" : 0 }}>
            {icon ? <div style={{ fontSize: "34px", lineHeight: 1, marginBottom: "8px" }}>{icon}</div> : null}
            <div id={key} style={{ fontSize: "17px", fontWeight: 800, color: "#151923", lineHeight: 1.35, wordBreak: "keep-all" }}>{title}</div>
          </div>
          {showClose ? (
            <button
              type="button"
              onClick={() => { requestClose(); }}
              aria-label="닫기"
              disabled={closeDisabled}
              style={{ flexShrink: 0, width: "36px", height: "36px", borderRadius: "50%", border: "none", background: "#F1ECEE", color: "#444", fontSize: "16px", fontWeight: 800, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", cursor: closeDisabled ? "not-allowed" : "pointer", opacity: closeDisabled ? 0.5 : 1 }}
            >
              ✕
            </button>
          ) : null}
        </div>

        {children ? (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 20px 4px", fontSize: "14px", fontWeight: 600, color: "#555", lineHeight: 1.65, wordBreak: "keep-all" }}>
            {children}
          </div>
        ) : null}

        {primary ? (
          <div style={{ flexShrink: 0, padding: "14px 20px 20px", display: "grid", gridTemplateColumns: hideCancel ? "1fr" : "1fr 1fr", gap: "10px" }}>
            {hideCancel ? null : (
              <button type="button" onClick={() => { requestClose(); }} disabled={closeDisabled} style={{ ...csCancelButtonStyle, color: "#666", opacity: closeDisabled ? 0.5 : 1 }}>
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              onClick={primary.onClick}
              disabled={primary.disabled}
              style={{ ...csPrimaryButtonStyle(!primary.disabled), ...(primary.danger ? { background: "#C0392B" } : null) }}
            >
              {primary.label}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
