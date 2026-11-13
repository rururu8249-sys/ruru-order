"use client";

// components/customer/CustomerPointGiftPopup.tsx
// 목적: 고객 포인트 선물/지급 알림 — [2026-11-12 사장님 「그립처럼 작게」] 작은 카드 + 폭죽, 3초 뒤 저절로 닫힘.
// 주의: customer_point_ledger.customer_seen_at 확인 시각만 저장합니다(닫힐 때 — 눌러서든 저절로든).
// 주문금액/입금/정산/배송/포인트 잔액/포인트 차감/포인트 사용 로직 없음.

import { useCallback, useEffect, useRef, useState } from "react";
import { POINT_GIFT_REFRESH_EVENT } from "@/lib/welcomePoint";

type PointGift = {
  id: string;
  amount: number;
  reason?: string;
  hint?: string;
};

const AUTO_CLOSE_MS = 3000;
const AUTO_CLOSE_HINT_MS = 4500; // 안내 한 줄이 있으면 읽을 시간을 더 줌
const CONFETTI = ["#D30005", "#FFC83D", "#7B61FF", "#FF8FA3", "#3DA5FF", "#FFC83D", "#D30005", "#7BD389", "#FF8FA3", "#7B61FF", "#3DA5FF", "#FFC83D", "#D30005", "#7BD389", "#FF8FA3", "#3DA5FF", "#7B61FF", "#FFC83D", "#D30005", "#3DA5FF", "#FF8FA3", "#7BD389", "#7B61FF", "#FFC83D"];

function readPhone(): string {
  try {
    return String(window.localStorage.getItem("ruru_customer_phone") || "").replace(/[^0-9]/g, "");
  } catch {
    return "";
  }
}

export default function CustomerPointGiftPopup() {
  const [gift, setGift] = useState<PointGift | null>(null);
  const [reduce, setReduce] = useState(false);
  const shown = useRef(new Set<string>()); // 확인 저장이 실패해도 같은 선물을 계속 띄우지 않게
  const hintRef = useRef(""); // 시청 선물이 보낸 안내(다음 구간·합계) — 다음에 뜨는 선물 하나에만 붙임

  const loadGift = useCallback(async () => {
    const phone = readPhone();
    if (phone.length < 9) return;
    try {
      const response = await fetch(`/api/customer-point-gifts?phone=${encodeURIComponent(phone)}`, { method: "GET", cache: "no-store" });
      const payload = await response.json().catch(() => null);
      const g = payload?.ok ? payload.gift : null;
      if (!g || !g.id || shown.current.has(String(g.id))) return;
      shown.current.add(String(g.id));
      const hint = hintRef.current;
      hintRef.current = "";
      setGift({ id: String(g.id), amount: Math.max(0, Math.floor(Number(g.amount) || 0)), reason: String(g.reason || "").trim(), hint });
    } catch {
      // 조회 실패는 화면 사용을 막지 않음
    }
  }, []);

  useEffect(() => {
    setReduce(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
    void loadGift();
    const onRefresh = (e: Event) => {
      const h = (e as CustomEvent<{ hint?: string }>).detail?.hint;
      if (typeof h === "string" && h) hintRef.current = h.slice(0, 60);
      void loadGift();
    };
    window.addEventListener(POINT_GIFT_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(POINT_GIFT_REFRESH_EVENT, onRefresh);
  }, [loadGift]);

  const closeGift = useCallback(() => {
    const current = gift;
    setGift(null);
    if (!current) return;
    const phone = readPhone();
    if (phone.length >= 9) {
      void fetch("/api/customer-point-gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ phone, gift_id: current.id }),
      })
        .catch(() => {})
        .finally(() => { void loadGift(); }); // 쌓인 다음 선물이 있으면 이어서
    }
  }, [gift, loadGift]);

  useEffect(() => {
    if (!gift) return;
    const t = window.setTimeout(closeGift, gift.hint ? AUTO_CLOSE_HINT_MS : AUTO_CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [gift, closeGift]);

  if (!gift) return null;
  const amountText = `${gift.amount.toLocaleString("ko-KR")}P`;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ position: "fixed", inset: 0, zIndex: 130, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "28vh", pointerEvents: "none" }}
    >
      <style>{`
        @keyframes ruruGiftPop { 0% { transform: scale(.7); opacity: 0 } 60% { transform: scale(1.05); opacity: 1 } 100% { transform: scale(1) } }
        @keyframes ruruGiftOut { 0%,85% { opacity: 1 } 100% { opacity: 0 } }
        @keyframes ruruConfetti { 0% { transform: translate(0,0) rotate(0); opacity: 1; animation-timing-function: cubic-bezier(.2,.7,.3,1) } 45% { transform: translate(var(--dx), var(--dy)) rotate(calc(var(--rot) / 2)); opacity: 1; animation-timing-function: ease-in } 100% { transform: translate(var(--dx), calc(var(--dy) + 120px)) rotate(var(--rot)); opacity: 0 } }
      `}</style>
      {/* [2026-11-12 사장님 「그립처럼 쿠폰 느낌」] 양옆이 파인 쿠폰 모양. 카드만 누를 수 있음(누르면 바로 닫힘) — 바깥은 그대로 눌려서 방송·주문을 막지 않음 */}
      <div
        onClick={closeGift}
        style={{
          pointerEvents: "auto",
          cursor: "pointer",
          position: "relative",
          width: "min(300px, calc(100vw - 48px))",
          filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.30))",
          animation: reduce ? undefined : `ruruGiftPop .35s ease-out, ruruGiftOut ${gift.hint ? AUTO_CLOSE_HINT_MS : AUTO_CLOSE_MS}ms linear forwards`,
        }}
      >
        {reduce ? null : (
          <span aria-hidden style={{ position: "absolute", left: "50%", top: "45%", width: 0, height: 0 }}>
            {CONFETTI.map((c, i) => {
              const ang = (i / CONFETTI.length) * Math.PI * 2 + (i % 2 ? 0.2 : 0);
              const dist = 130 + (i % 4) * 30;
              return (
                <span
                  key={i}
                  style={{
                    position: "absolute",
                    width: i % 2 ? 9 : 12,
                    height: i % 2 ? 12 : 9,
                    borderRadius: 2,
                    background: c,
                    ["--dx" as string]: `${Math.round(Math.cos(ang) * dist)}px`,
                    ["--dy" as string]: `${Math.round(Math.sin(ang) * dist * 0.85 + 40)}px`,
                    ["--rot" as string]: `${(i % 2 ? 1 : -1) * (180 + i * 30)}deg`,
                    animation: `ruruConfetti 2.2s linear ${i * 10}ms forwards`,
                  } as React.CSSProperties}
                />
              );
            })}
          </span>
        )}
        <div
          style={{
            boxSizing: "border-box",
            padding: "22px 24px 18px",
            borderRadius: 16,
            background: "linear-gradient(135deg, #FFFFFF 0%, #FCF0F4 55%, #EEF0FA 100%)",
            color: "#111111",
            textAlign: "center",
            // 양옆 가운데를 동그랗게 파냄(쿠폰 모양)
            WebkitMaskImage: "radial-gradient(circle 11px at 0 50%, transparent 10px, #000 11px), radial-gradient(circle 11px at 100% 50%, transparent 10px, #000 11px)",
            WebkitMaskComposite: "source-in",
            maskImage: "radial-gradient(circle 11px at 0 50%, transparent 10px, #000 11px), radial-gradient(circle 11px at 100% 50%, transparent 10px, #000 11px)",
            maskComposite: "intersect",
          }}
        >
          <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 700, color: "#111111" }}>{gift.reason || "포인트 선물"}</div>
          <div style={{ marginTop: 6, fontSize: 40, lineHeight: "46px", fontWeight: 800, color: "#D30005", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px" }}>{amountText}</div>
          {gift.hint ? <div style={{ marginTop: 8, fontSize: 14, lineHeight: "20px", fontWeight: 700, color: "#111111", wordBreak: "keep-all" }}>{gift.hint}</div> : null}
          <div style={{ margin: "12px 0 0", paddingTop: 10, borderTop: "1px dashed #D9D9DE", fontSize: 13, lineHeight: "16px", fontWeight: 700, letterSpacing: "2px", color: "#8E8E93" }}>RURUDONGI</div>
        </div>
      </div>
    </div>
  );
}
