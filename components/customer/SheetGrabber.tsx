"use client";

// 바텀시트 상단 손잡이바(그래버). 아래로 끌면 시트가 따라 내려가고,
//   임계값(110px) 이상 내리면 onClose 호출로 닫힘. 표준 bottom-sheet drag-to-dismiss.
//   부모 시트 컨테이너에 data-sheet 속성만 있으면 자동으로 그 요소를 찾아 transform.
//   ⚠️ 표시/제스처 전용 — 돈/주문/제출 로직과 무관. onClose는 각 시트의 기존 닫기 함수를 그대로 전달.

import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

type Props = {
  onClose: () => void;
  threshold?: number;
  style?: CSSProperties;
};

export default function SheetGrabber({ onClose, threshold = 110, style }: Props) {
  const startY = useRef<number | null>(null);
  const dyRef = useRef(0);
  const sheetRef = useRef<HTMLElement | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    startY.current = e.clientY;
    dyRef.current = 0;
    sheetRef.current = (e.currentTarget.closest("[data-sheet]") as HTMLElement | null) ?? null;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (startY.current == null) return;
    const dy = Math.max(0, e.clientY - startY.current);
    dyRef.current = dy;
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transition = "none";
      sheet.style.transform = `translateY(${dy}px)`;
    }
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

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      role="button"
      aria-label="아래로 끌어 닫기"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "6px 0 12px",
        margin: "0 auto",
        touchAction: "none",
        cursor: "grab",
        ...style,
      }}
    >
      <div style={{ width: "52px", height: "5px", borderRadius: "3px", background: "#E8E2DD" }} />
    </div>
  );
}
