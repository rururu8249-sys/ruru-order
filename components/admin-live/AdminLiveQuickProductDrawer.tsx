"use client";

import { useEffect, useState } from "react";
import QuickProductFastForm from "./quick-product/QuickProductFastForm";

type AdminLiveQuickProductDrawerProps = {
  activeBroadcastId: string | number | null;
};

export default function AdminLiveQuickProductDrawer({
  activeBroadcastId,
}: AdminLiveQuickProductDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const openDrawer = () => setIsOpen(true);
    const closeDrawer = () => setIsOpen(false);

    window.addEventListener("ruru-open-quick-product-panel", openDrawer);
    window.addEventListener("ruru-close-quick-product-panel", closeDrawer);

    return () => {
      window.removeEventListener("ruru-open-quick-product-panel", openDrawer);
      window.removeEventListener("ruru-close-quick-product-panel", closeDrawer);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90]">
      <button
        type="button"
        aria-label="빠른상품등록 배경 닫기"
        onClick={() => setIsOpen(false)}
        className="absolute inset-0 bg-slate-950/35"
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[780px] flex-col bg-slate-50 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-950">빠른상품등록</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              등록상품 리스트 없이, 방송 중 바로 입력·저장하는 전용 폼입니다.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-100"
          >
            닫기
          </button>
        </div>

        <QuickProductFastForm
          activeBroadcastId={activeBroadcastId}
          onClose={() => setIsOpen(false)}
        />
      </aside>
    </div>
  );
}
