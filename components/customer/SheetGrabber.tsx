"use client";

// 바텀시트 상단 손잡이바(그래버). 아래로 끌면 시트가 따라 내려가고,
//   임계값 이상 내리면 onClose 호출로 닫힘. 표준 bottom-sheet drag-to-dismiss.
//   부모 시트 컨테이너에 data-sheet 속성만 있으면 자동으로 그 요소를 찾아 transform.
//   ⚠️ 표시/제스처 전용 — 돈/주문/제출 로직과 무관. onClose는 각 시트의 기존 닫기 함수를 그대로 전달.

import {
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";

type Props = {
  onClose: () => void;
  threshold?: number;
  style?: CSSProperties;
};

export default function SheetGrabber({ onClose, threshold = 72, style }: Props) {
  const startY = useRef<number | null>(null);
  const dyRef = useRef(0);
  const sheetRef = useRef<HTMLElement | null>(null);

  const begin = (clientY: number, target: HTMLDivElement) => {
    startY.current = clientY;
    dyRef.current = 0;
    sheetRef.current = (target.closest("[data-sheet]") as HTMLElement | null) ?? null;
  };

  const move = (clientY: number) => {
    if (startY.current == null) return;
    const dy = Math.max(0, clientY - startY.current);
    dyRef.current = dy;
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transition = "none";
      sheet.style.transform = `translateY(${dy}px)`;
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Android/Kakao WebView의 손가락 제스처는 아래 touch 이벤트가 전담합니다.
    if (e.pointerType === "touch") return;
    begin(e.clientY, e.currentTarget);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    move(e.clientY);
  };

  const end = () => {
    if (startY.current == null) return;
    const dy = dyRef.current;
    const sheet = sheetRef.current;
    startY.current = null;
    dyRef.current = 0;
    sheetRef.current = null;
    if (sheet) {
      sheet.style.transition = "transform 0.24s cubic-bezier(0.22,1,0.36,1)";
      sheet.style.transform = "";
    }
    if (dy > threshold) onClose();
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    end();
  };

  const onTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    begin(touch.clientY, e.currentTarget);
  };

  const onTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch || startY.current == null) return;
    e.preventDefault();
    move(touch.clientY);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onClose();
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={end}
      onTouchCancel={end}
      onClick={onClose}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
      aria-label="아래로 끌거나 눌러 닫기"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        minHeight: "30px",
        padding: "6px 0 12px",
        margin: "0 auto",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        cursor: "grab",
        ...style,
      }}
    >
      <div style={{ width: "52px", height: "5px", borderRadius: "3px", background: "#E8E2DD" }} />
    </div>
  );
}
