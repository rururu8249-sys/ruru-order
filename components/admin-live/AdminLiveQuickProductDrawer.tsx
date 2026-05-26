"use client";

import { useEffect, useState } from "react";
import LiveProductRegistrationPanel from "./LiveProductRegistrationPanel";

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

  useEffect(() => {
    if (!isOpen) return;

    let count = 0;

    const timer = window.setInterval(() => {
      count += 1;

      const root = document.querySelector("[data-ruru-quick-product-drawer]");
      const buttons = Array.from(root?.querySelectorAll("button") || []);
      const openButton = buttons.find((button) => {
        const text = button.textContent || "";
        return text.includes("열기") || text.includes("펼치기");
      });

      if (openButton instanceof HTMLButtonElement) {
        openButton.click();
        window.clearInterval(timer);
      }

      if (count >= 8) {
        window.clearInterval(timer);
      }
    }, 120);

    return () => {
      window.clearInterval(timer);
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

      <aside
        data-ruru-quick-product-drawer
        className="absolute right-0 top-0 flex h-full w-full max-w-[760px] flex-col bg-slate-50 shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-950">
              빠른상품등록
            </h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              방송 화면은 그대로 두고, 상품만 오른쪽 패널에서 빠르게 등록합니다.
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <LiveProductRegistrationPanel activeBroadcastId={activeBroadcastId} />
        </div>
      </aside>
    </div>
  );
}
