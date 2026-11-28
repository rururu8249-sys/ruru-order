"use client";

// [2026-11-28 전수 점검] 빈 장바구니 안내 알약 — 상품 목록을 내리는 동안엔 숨김.
//   예전엔 늘 떠 있어서 상품 카드의 「담기」 버튼·상품명·가격을 가렸음(390px 실측). 맨 위 근처(160px 안)에서만 보임.
//   누르면 상품 목록 맨 위로(예전과 같음). 담기·장바구니 로직 무접촉.
import { useEffect, useState } from "react";

export default function EmptyCartNudge({ label, animate, onClick }: { label: string; animate: boolean; onClick: () => void }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => setHidden(window.scrollY > 160);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <button type="button" onClick={onClick} aria-hidden={hidden} tabIndex={hidden ? -1 : 0}
      style={{ position: "fixed", left: "50%", transform: `translateX(-50%) translateY(${hidden ? "12px" : "0"})`, opacity: hidden ? 0 : 1, pointerEvents: hidden ? "none" : "auto", transition: "opacity .2s ease, transform .2s ease", bottom: "calc(80px + env(safe-area-inset-bottom))", zIndex: 39, display: "inline-flex", alignItems: "center", gap: "8px", height: "48px", padding: "0 20px", borderRadius: "9999px", background: "#FFFFFF", border: "1px solid #E5E5E5", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", color: "#111111", fontSize: "15px", fontWeight: 600, whiteSpace: "nowrap", fontFamily: "inherit", cursor: "pointer" }}>
      <svg className="ruru-nudge-arrow" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", animation: animate ? "ruruNudge 1.2s ease-in-out infinite" : "none" }}><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></svg>
      {label}
    </button>
  );
}
