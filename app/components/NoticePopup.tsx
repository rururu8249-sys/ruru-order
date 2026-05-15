// app/components/NoticePopup.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/components/NoticePopup.tsx
//
// 기능:
// - Supabase popup_notice 테이블에서 팝업 공지 불러오기
// - 관리자 페이지(/admin)에서는 공지 팝업 숨김
// - 관리자에서 ON/OFF 가능
// - 오늘 하루 닫기
// - 기존보다 작은 compact 팝업

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "ruru_notice_popup_hide_until";

type PopupNotice = {
  id: number;
  title: string;
  content: string;
  is_enabled: boolean;
  updated_at?: string;
};

export default function NoticePopup() {
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [popup, setPopup] = useState<PopupNotice | null>(null);

  useEffect(() => {
    if (pathname?.startsWith("/admin")) {
      setOpen(false);
      return;
    }

    loadPopup();
  }, [pathname]);

  const loadPopup = async () => {
    const hideUntil = localStorage.getItem(STORAGE_KEY);
    const now = Date.now();

    if (hideUntil && now <= Number(hideUntil)) {
      return;
    }

    const { data, error } = await supabase
      .from("popup_notice")
      .select("*")
      .eq("id", 1)
      .single();

    if (error || !data || !data.is_enabled) {
      return;
    }

    setPopup(data);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
  };

  const closeToday = () => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    localStorage.setItem(STORAGE_KEY, String(endOfToday.getTime()));
    setOpen(false);
  };

  if (!open || !popup || pathname?.startsWith("/admin")) return null;

  const lines = String(popup.content || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-[99999] bg-black/45 backdrop-blur-[2px] flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm rounded-[1.5rem] bg-white shadow-2xl overflow-hidden border border-gray-100">

        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-[11px] font-extrabold text-gray-400 mb-1 tracking-wide">
            RURU NOTICE
          </div>

          <h2 className="text-xl font-extrabold text-gray-950 leading-snug">
            {popup.title}
          </h2>
        </div>

        <div className="px-5 py-4">
          <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-4">
            <div className="text-red-600 font-extrabold text-base mb-3">
              ⚠️ 꼭 확인해주세요
            </div>

            <div className="text-sm leading-7 text-gray-800 font-bold space-y-1">
              {lines.map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          <button
            onClick={closeToday}
            className="h-11 rounded-2xl bg-gray-100 text-gray-700 text-sm font-extrabold"
          >
            오늘 하루 닫기
          </button>

          <button
            onClick={close}
            className="h-11 rounded-2xl bg-black text-white text-sm font-extrabold"
          >
            확인했습니다
          </button>
        </div>

      </div>
    </div>
  );
}
