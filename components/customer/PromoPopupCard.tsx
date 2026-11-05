"use client";
// components/customer/PromoPopupCard.tsx
// 2026-11-01 — 안내 팝업 «카드 모양» 하나. 손님 화면 팝업과 관리자 미리보기가 같이 쓴다(보이는 모양 한 곳).
// 표시 전용. 버튼 동작은 부모가 넘긴다.

import type { PromoPopupConfig } from "@/lib/promoPopup";
import { promoBodyLines } from "@/lib/promoPopup";

type Props = {
  cfg: PromoPopupConfig;
  onButton: (index: number) => void;
  onClose: () => void;
  onHide24: () => void;
};

export default function PromoPopupCard({ cfg, onButton, onClose, onHide24 }: Props) {
  return (
    <div style={{ width: "100%", maxWidth: "360px", background: "#FFFFFF", borderRadius: "20px", boxShadow: "0 24px 70px rgba(0,0,0,0.32)", overflow: "hidden" }}>
      <div style={{ padding: "28px 20px 8px", textAlign: "center" }}>
        {cfg.icon === "image" && cfg.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cfg.imageUrl} alt="" style={{ display: "block", margin: "0 auto 12px", maxWidth: "120px", maxHeight: "64px", objectFit: "contain" }} />
        ) : cfg.icon === "youtube" ? (
          <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block", margin: "0 auto 12px" }}>
            <rect x="4" y="10" width="40" height="28" rx="9" fill="#FF0000" />
            <path d="M20 17.5v13l11-6.5z" fill="#FFFFFF" />
          </svg>
        ) : cfg.icon === "play" ? (
          <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block", margin: "0 auto 12px" }}>
            <circle cx="24" cy="24" r="22" fill="#111111" />
            <path d="M20 15.5v17l13-8.5z" fill="#FFFFFF" />
          </svg>
        ) : null}
        {cfg.title.trim() ? (
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#111111", lineHeight: 1.4, wordBreak: "keep-all" }}>{cfg.title}</h2>
        ) : null}
        {cfg.body.trim() ? (
          <div style={{ margin: "12px 0 0", fontSize: "16px", fontWeight: 500, color: "#111111", lineHeight: 1.6, wordBreak: "keep-all" }}>
            {promoBodyLines(cfg.body).map((parts, i) => (
              <div key={i} style={{ minHeight: "8px" }}>
                {parts.map((p, j) => (p.bold ? <b key={j}>{p.text}</b> : <span key={j}>{p.text}</span>))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {cfg.buttons.map((b, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onButton(i)}
            // [2026-11-05] 버튼은 모두 같은 검정(사장님 — 두 채널 다 눈에 띄게). 닫기만 회색 테두리.
            style={{ height: "52px", borderRadius: "9999px", background: "#111111", color: "#FFFFFF", border: "none", fontSize: "16px", fontWeight: 700, cursor: "pointer" }}
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          style={{ height: "48px", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", border: "1px solid #CACACB", fontSize: "15px", fontWeight: 600, cursor: "pointer" }}
        >
          닫기
        </button>
        <button
          type="button"
          onClick={onHide24}
          style={{ height: "44px", background: "transparent", color: "#707072", border: "none", fontSize: "14px", fontWeight: 500, cursor: "pointer", textDecoration: "underline" }}
        >
          24시간 동안 열지 않기
        </button>
      </div>
    </div>
  );
}
