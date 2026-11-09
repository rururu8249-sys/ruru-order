"use client";

import React, { useEffect, useRef, useState } from "react";

// [2026-11-09 사장님 「방송 중에 버튼이 너무 많아 불편」] 표 줄의 드문 동작(수정·재고·숨기기·빼기 …)을 「⋯」 하나에 모으는 더보기 메뉴.
//   DESIGN-ADMIN §4: 줄 안 주동작 1개 + 조용한 버튼. 메뉴는 position:fixed 로 띄워 줄의 overflow:hidden·스크롤 상자에 안 잘린다.
//   동작 함수는 호출하는 쪽 것을 그대로 쓴다(여기엔 저장·돈 코드 없음).

export type RowMoreMenuItem = {
  label: string;
  onClick: () => void;
  /** 빨간 글자(빼기·삭제) */
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  /** 테스트·접근성용 — 없으면 label */
  ariaLabel?: string;
};

type Props = {
  /** 「○○ 더보기」 접근 이름 */
  name: string;
  items: RowMoreMenuItem[];
  /** 버튼 높이(기본 32) — 폰은 44 */
  size?: number;
};

const MENU_WIDTH = 168;

export default function RowMoreMenu({ name, items, size = 32 }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const place = () => {
    const el = btnRef.current;
    if (!el || typeof el.getBoundingClientRect !== "function") return;
    const r = el.getBoundingClientRect();
    const menuH = items.length * 40 + 8;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const up = r.bottom + menuH + 8 > vh && r.top - menuH - 4 > 0;
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, (typeof window !== "undefined" ? window.innerWidth : 1200) - MENU_WIDTH - 8));
    setPos({ top: up ? r.top - menuH - 4 : r.bottom + 4, left, up });
  };

  useEffect(() => {
    if (!open || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`${name} 더보기`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="더보기"
        onClick={(e) => { e.stopPropagation(); if (open) { setOpen(false); return; } place(); setOpen(true); }}
        style={{ flexShrink: 0, width: `${Math.max(size, 36)}px`, height: `${size}px`, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "4px", background: open ? "var(--color-surface-2)" : "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: "8px", cursor: "pointer", padding: 0, color: "var(--color-ink)" }}
      >
        <span aria-hidden="true" style={{ display: "inline-flex", gap: "4px" }}>
          <i style={{ width: "4px", height: "4px", borderRadius: "50%", background: "currentColor", display: "block" }} />
          <i style={{ width: "4px", height: "4px", borderRadius: "50%", background: "currentColor", display: "block" }} />
          <i style={{ width: "4px", height: "4px", borderRadius: "50%", background: "currentColor", display: "block" }} />
        </span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${name} 메뉴`}
          onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: `${pos.top}px`, left: `${pos.left}px`, width: `${MENU_WIDTH}px`, zIndex: 80, padding: "4px", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              aria-label={item.ariaLabel ?? item.label}
              disabled={item.disabled}
              title={item.title}
              onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick(); }}
              style={{ height: "40px", padding: "0 12px", textAlign: "left", fontSize: "14px", fontWeight: 600, color: item.danger ? "var(--color-danger-tx)" : "var(--color-ink)", background: "transparent", border: 0, borderRadius: "8px", cursor: item.disabled ? "not-allowed" : "pointer", opacity: item.disabled ? 0.45 : 1, whiteSpace: "nowrap" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >{item.label}</button>
          ))}
        </div>
      ) : null}
    </>
  );
}
