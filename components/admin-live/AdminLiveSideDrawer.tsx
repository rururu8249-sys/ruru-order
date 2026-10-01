"use client";

import { useRef, type ReactNode } from "react";
import {useAdminModalFocus} from "./useAdminModalFocus";

export default function AdminLiveSideDrawer({ title, onClose, width, children }: {
  title: string; onClose: () => void; width: 420 | 560; children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useAdminModalFocus(panelRef,onClose);
  return <>
    <button type="button" aria-label="패널 닫기" onClick={onClose} className="fixed inset-0 z-40 bg-black/40" tabIndex={-1} />
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden border-l border-line bg-surface shadow-2xl ${width === 560 ? "max-w-[560px]" : "max-w-[420px]"}`}
      style={{ animation: "ruruSidePanelIn 0.22s ease" }}>
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2">
        <h2 className="text-sm font-black text-ink">{title}</h2>
        <button type="button" aria-label={`${title} 닫기`} onClick={onClose} className="min-h-11 min-w-11 rounded-xl text-lg text-ink-soft md:min-h-9 md:min-w-9">✕</button>
      </div>
      <div data-admin-drawer-scroll className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  </>;
}
