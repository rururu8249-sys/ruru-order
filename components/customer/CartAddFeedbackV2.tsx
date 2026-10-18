"use client";
// [㉜ 2단계 2026-10-18] 담기 피드백 — 새 모양(ui=v2) 전용. DESIGN.md §5-1.
//   담기가 «성공한 뒤»(부모가 open 을 켤 때)에만 보인다. 담기·장바구니 선점·동기화 로직과 무관(표시 전용).
//   ① 사진 작은 복제본이 하단 장바구니 바의 개수로 날아감(0.4초) + 개수 숫자 톡 — 「동작 줄이기」 설정이면 생략
//   ② 바 바로 위 한 줄 [사진 40px · 상품명 · 고른 옵션 · 「담았어요」] — 부모 타이머(2.5초)로 사라짐
//   애니메이션이 어떤 이유로 실패해도 조용히 넘어간다(담기는 이미 끝난 뒤라 영향 없음).
import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  /** 같은 상품을 연달아 담아도 매번 다시 날아가게 하는 번호 */
  nonce: number;
  productName: string;
  optionText: string;
  image: string;
};

// 마지막으로 누른 자리 — 날아가기 출발점(담기 버튼 위치). 화면 어디든 한 곳에서만 기억.
let lastPointer: { x: number; y: number } | null = null;

export default function CartAddFeedbackV2({ open, nonce, productName, optionText, image }: Props) {
  const playedRef = useRef(0);

  useEffect(() => {
    const remember = (event: PointerEvent) => { lastPointer = { x: event.clientX, y: event.clientY }; };
    window.addEventListener("pointerdown", remember, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", remember, { capture: true } as EventListenerOptions);
  }, []);

  useEffect(() => {
    if (!open || nonce === playedRef.current) return;
    playedRef.current = nonce;
    try {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const target = document.querySelector<HTMLElement>("[data-cart-bar-count]");
      if (reduce || !target) return;
      const to = target.getBoundingClientRect();
      const from = lastPointer || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const size = 44;
      const ghost = document.createElement(image ? "img" : "div");
      if (image) (ghost as HTMLImageElement).src = image;
      Object.assign(ghost.style, {
        position: "fixed", left: `${from.x - size / 2}px`, top: `${from.y - size / 2}px`, width: `${size}px`, height: `${size}px`,
        objectFit: "cover", background: "#F5F5F5", borderRadius: "0", zIndex: "160", pointerEvents: "none",
      } as Partial<CSSStyleDeclaration>);
      document.body.appendChild(ghost);
      const dx = to.left + to.width / 2 - from.x;
      const dy = to.top + to.height / 2 - from.y;
      const flight = ghost.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0.6 },
        ],
        { duration: 380, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
      );
      const finish = () => {
        ghost.remove();
        try { target.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 220, easing: "ease-out" }); } catch { /* 무시 */ }
      };
      flight.onfinish = finish;
      flight.oncancel = () => ghost.remove();
    } catch { /* 표시 효과일 뿐 — 실패해도 담기는 정상 */ }
  }, [open, nonce, image]);

  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed", left: "16px", right: "16px",
        // 하단 메뉴(68) + 장바구니 바(약 73) 바로 위
        bottom: "calc(149px + env(safe-area-inset-bottom))",
        zIndex: 140, margin: "0 auto", maxWidth: "430px",
        display: "flex", alignItems: "center", gap: "10px",
        background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: "12px", padding: "8px 12px",
        boxShadow: "0 6px 20px rgba(0,0,0,0.12)", pointerEvents: "none",
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" style={{ flexShrink: 0, width: "40px", height: "40px", objectFit: "cover", background: "#F5F5F5", borderRadius: 0 }} />
      ) : (
        <span aria-hidden="true" style={{ flexShrink: 0, width: "40px", height: "40px", background: "#F5F5F5" }} />
      )}
      <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "#111111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName}</span>
        {optionText ? <span style={{ fontSize: "13px", fontWeight: 400, color: "#707072", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{optionText}</span> : null}
      </span>
      <span style={{ flexShrink: 0, fontSize: "14px", fontWeight: 600, color: "#111111" }}>담았어요</span>
    </div>
  );
}
