"use client";

import { useRef, type ReactNode } from "react";
import {useAdminModalFocus} from "./useAdminModalFocus";

export default function AdminLiveSideDrawer({ title, onClose, width, children }: {
  title: string; onClose: () => void; width: 420 | 480 | 560; children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useAdminModalFocus(panelRef,onClose);
  // [2026-10-21 사장님 「뜬금없이 닫힘」] 바깥(어두운 곳) 클릭으로 닫기는
  //   ① 창이 열린 지 0.6초 안의 클릭(닉네임·배지 두 번 누름의 두 번째 클릭)은 무시
  //   ② 누르기 시작한 곳도 바깥일 때만(창 안에서 끌다가 바깥에서 뗀 경우 무시)
  const openedAtRef = useRef(Date.now());
  const downOnBackdropRef = useRef(false);
  return <>
    <button type="button" aria-label="패널 닫기"
      onMouseDown={() => { downOnBackdropRef.current = true; }}
      onClick={() => {
        const ok = downOnBackdropRef.current && Date.now() - openedAtRef.current > 600;
        downOnBackdropRef.current = false;
        if (ok) onClose();
      }}
      className="fixed inset-0 z-40 bg-black/40" tabIndex={-1} />
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden border-l border-line bg-surface shadow-2xl ${width === 560 ? "max-w-[560px]" : width === 480 ? "max-w-[480px]" : "max-w-[420px]"}`}
      style={{ animation: "ruruSidePanelIn 0.22s ease" }}>
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2">
        <h2 className="text-sm font-black text-ink">{title}</h2>
        <button type="button" aria-label={`${title} 닫기`} onClick={onClose} className="min-h-11 min-w-11 rounded-xl text-lg text-ink-soft md:min-h-9 md:min-w-9">✕</button>
      </div>
      <div data-admin-drawer-scroll className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  </>;
}
