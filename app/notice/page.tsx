"use client";

// Standalone entry uses the same public board as the customer notice inbox.

import { useEffect, useState } from "react";
import CustomerTopNav from "@/components/customer/CustomerTopNav";
import CustomerBottomNav from "@/components/customer/CustomerBottomNav";
import PublicNoticeBoard from "@/components/notice/PublicNoticeBoard";
import { useCustomerUiStage } from "@/lib/useCustomerUiStage";

const blockCustomerCopyEvents = () => {
  const block = (event: Event) => event.preventDefault();

  const blockKey = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const isMac = event.metaKey;
    const isWin = event.ctrlKey;

    if (
      event.key === "F12" ||
      ((isWin || isMac) && ["c", "x", "u"].includes(key)) ||
      (isWin && event.shiftKey && ["i", "j"].includes(key)) ||
      (isMac && event.altKey && ["i", "j"].includes(key))
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  document.addEventListener("contextmenu", block);
  document.addEventListener("copy", block);
  document.addEventListener("cut", block);
  document.addEventListener("dragstart", block);
  document.addEventListener("selectstart", block);
  document.addEventListener("keydown", blockKey);

  return () => {
    document.removeEventListener("contextmenu", block);
    document.removeEventListener("copy", block);
    document.removeEventListener("cut", block);
    document.removeEventListener("dragstart", block);
    document.removeEventListener("selectstart", block);
    document.removeEventListener("keydown", blockKey);
  };
};

export default function NoticePage() {
  useEffect(() => {
    return blockCustomerCopyEvents();
  }, []);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const v2 = useCustomerUiStage("s4"); // [㉜ 4단계] 표시 전용

  return (
    <main className={v2 ? "min-h-screen select-none bg-white px-4 py-4 text-[#111111]" : "min-h-screen select-none bg-[#F6F4F2] px-4 py-6 text-[#151923]"} style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
      <section className="mx-auto w-full max-w-2xl">
        <CustomerTopNav bottomNav />
        <h1 className={v2 ? "my-5 text-[24px] font-bold text-[#111111]" : "my-5 text-xl font-bold"}>공지사항</h1>
        <PublicNoticeBoard selectedId={selectedId} onSelect={setSelectedId} />
        <footer className="py-8 text-center">
          <p className={v2 ? "text-[15px] font-normal text-[#707072]" : "text-[15px] font-medium tracking-[-0.04em] text-slate-500"}>
            오늘도 루루동이와 함께 행복한 쇼핑 되세요!♡
          </p>
          <div className={v2 ? "mx-auto mt-5 h-px w-full bg-[#E5E5E5]" : "mx-auto mt-5 h-px w-full bg-[#E9DFE4]"} />
          <p className={v2 ? "mt-4 text-[13px] text-[#707072]" : "mt-4 text-[12px] text-slate-400"}>
            copyright © since 2024 루루동이. All rights reserved.
          </p>
        </footer>
        {/* [㊾] 아래 5칸 메뉴에 안 가리게(새 모양만 — 옛 화면엔 아래 메뉴 없음) */}
        {v2 ? <div aria-hidden="true" style={{ height: "calc(84px + env(safe-area-inset-bottom))" }} /> : null}
      </section>
      <CustomerBottomNav active="notice" />
    </main>
  );
}
