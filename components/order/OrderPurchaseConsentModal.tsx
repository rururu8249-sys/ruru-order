"use client";

import { useEffect, useRef, useState } from "react";

import type { OrderPurchaseConsentConfig } from "@/lib/orderPurchaseConsent";

type Props = {
  config: OrderPurchaseConsentConfig;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function OrderPurchaseConsentModal({
  config,
  submitting,
  onCancel,
  onConfirm,
}: Props) {
  const [accepted, setAccepted] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])") || [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (event.shiftKey && (active === first || !active || !focusable.includes(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !active || !focusable.includes(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, submitting]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 5200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "14px",
        background: "rgba(20, 12, 16, 0.62)",
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-purchase-consent-title"
        style={{
          width: "100%",
          maxWidth: "430px",
          maxHeight: "92dvh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "2px solid #7A1E47",
          borderRadius: "22px",
          background: "#fff",
          boxShadow: "0 24px 72px rgba(0,0,0,0.34)",
        }}
      >
        <div style={{ padding: "19px 20px 14px", borderBottom: "1px solid #E8DDE1" }}>
          <h2
            id="order-purchase-consent-title"
            ref={titleRef}
            tabIndex={-1}
            style={{ margin: 0, color: "#221B1E", fontSize: "20px", fontWeight: 900, lineHeight: 1.35, outline: "none", wordBreak: "keep-all" }}
          >
            {config.title}
          </h2>
        </div>

        <div style={{ minHeight: 0, overflowY: "auto", padding: "16px 18px" }}>
          <div
            style={{
              whiteSpace: "pre-line",
              color: "#3F3338",
              fontSize: "14px",
              fontWeight: 700,
              lineHeight: 1.72,
              wordBreak: "keep-all",
            }}
          >
            {config.text}
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              marginTop: "18px",
              padding: "13px 12px",
              border: accepted ? "1.5px solid #7A1E47" : "1.5px solid #E0A96D",
              borderRadius: "13px",
              background: accepted ? "#F9EEF3" : "#FFF7ED",
              cursor: submitting ? "default" : "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={accepted}
              disabled={submitting}
              onChange={(event) => setAccepted(event.target.checked)}
              style={{ width: "22px", height: "22px", flexShrink: 0, accentColor: "#7A1E47" }}
            />
            <span style={{ color: "#3F3338", fontSize: "13.5px", fontWeight: 900, lineHeight: 1.5, wordBreak: "keep-all" }}>
              {config.checkboxLabel}
            </span>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: "10px", padding: "14px 18px 18px", borderTop: "1px solid #E8DDE1" }}>
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            style={{ minHeight: "50px", border: "1.5px solid #D9C5CC", borderRadius: "13px", background: "#fff", color: "#664B56", fontSize: "14px", fontWeight: 900, cursor: submitting ? "default" : "pointer" }}
          >
            취소
          </button>
          <button
            type="button"
            disabled={!accepted || submitting}
            onClick={() => {
              if (!accepted || submitting) return;
              onConfirm();
            }}
            style={{ minHeight: "50px", border: "none", borderRadius: "13px", background: accepted && !submitting ? "#7A1E47" : "#D8CCD1", color: "#fff", fontSize: "14px", fontWeight: 900, cursor: accepted && !submitting ? "pointer" : "default" }}
          >
            {submitting ? "주문서 제출 중..." : "동의하고 주문하기"}
          </button>
        </div>
      </section>
    </div>
  );
}
