"use client";

// Standalone entry uses the same public board as the customer notice inbox.

import { useEffect, useState } from "react";
import CustomerTopNav from "@/components/customer/CustomerTopNav";
import PublicNoticeBoard from "@/components/notice/PublicNoticeBoard";

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

  return (
    <main className="min-h-screen select-none bg-[#F6F4F2] px-4 py-6 text-[#151923]" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
      <section className="mx-auto w-full max-w-2xl">
        <CustomerTopNav />
        <h1 className="my-5 text-xl font-bold">공지사항</h1>
        <PublicNoticeBoard selectedId={selectedId} onSelect={setSelectedId} />
        <footer className="py-8 text-center">
          <p className="text-[15px] font-medium tracking-[-0.04em] text-slate-500">
            오늘도 루루동이와 함께 행복한 쇼핑 되세요!♡
          </p>
          <div className="mx-auto mt-5 h-px w-full bg-[#E9DFE4]" />
          <p className="mt-4 text-[12px] text-slate-400">
            copyright © since 2024 루루동이. All rights reserved.
          </p>
        </footer>
      </section>
    </main>
  );
}
