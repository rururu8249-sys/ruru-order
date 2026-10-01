"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function AdminLiveSideDrawer({ title, onClose, width, children }: {
  title: string; onClose: () => void; width: 420 | 560; children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(node => node.getClientRects().length > 0 && !node.closest("[hidden]"));
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return <>
    <button type="button" aria-label="패널 닫기" onClick={onClose} className="fixed inset-0 z-40 bg-black/40" tabIndex={-1} />
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden border-l border-line bg-surface shadow-2xl ${width === 560 ? "max-w-[560px]" : "max-w-[420px]"}`}
      style={{ animation: "ruruSidePanelIn 0.22s ease" }}>
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2">
        <h2 className="text-sm font-black text-ink">{title}</h2>
        <button type="button" aria-label={`${title} 닫기`} onClick={onClose} className="min-h-11 min-w-11 rounded-xl text-lg text-ink-soft md:min-h-9 md:min-w-9">✕</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  </>;
}
