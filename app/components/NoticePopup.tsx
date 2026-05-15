// app/components/NoticePopup.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/components/NoticePopup.tsx
//
// 기능:
// - Supabase popup_notice 테이블에서 팝업 공지 불러오기
// - 관리자에서 ON/OFF 가능
// - 관리자에서 팝업 크기 조절 가능: 작게 / 보통 / 크게
// - 오늘 하루 닫기
// - 모바일/PC 최적화

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "ruru_notice_popup_hide_until";

type PopupNotice = {
  id: number;
  title: string;
  content: string;
  is_enabled: boolean;
  popup_size?: "compact" | "normal" | "large";
  updated_at?: string;
};

const getPopupSizeClass = (size?: string) => {
  switch (size) {
    case "large":
      return {
        wrap: "max-w-lg",
        radius: "rounded-[2rem]",
        head: "px-6 py-5",
        body: "px-6 py-6",
        inner: "px-5 py-5",
        title: "text-2xl",
        text: "text-[15px] leading-8",
        button: "h-14 text-base",
      };

    case "normal":
      return {
        wrap: "max-w-md",
        radius: "rounded-[1.8rem]",
        head: "px-5 py-4",
        body: "px-5 py-5",
        inner: "px-4 py-4",
        title: "text-xl",
        text: "text-sm leading-7",
        button: "h-12 text-sm",
      };

    case "compact":
    default:
      return {
        wrap: "max-w-sm",
        radius: "rounded-[1.5rem]",
        head: "px-4 py-3",
        body: "px-4 py-4",
        inner: "px-4 py-4",
        title: "text-lg",
        text: "text-[13px] leading-6",
        button: "h-11 text-sm",
      };
  }
};

export default function NoticePopup() {
  const [open, setOpen] = useState(false);
  const [popup, setPopup] = useState<PopupNotice | null>(null);

  useEffect(() => {
    loadPopup();
  }, []);

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

  if (!open || !popup) return null;

  const sizeClass = getPopupSizeClass(popup.popup_size);

  const lines = String(popup.content || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-[99999] bg-black/45 backdrop-blur-[2px] flex items-center justify-center px-4 py-6">
      <div
        className={`w-full ${sizeClass.wrap} ${sizeClass.radius} bg-white shadow-2xl overflow-hidden border border-gray-100`}
      >
        <div className={`${sizeClass.head} border-b border-gray-100`}>
          <div className="text-[10px] font-extrabold text-gray-400 mb-1 tracking-wide">
            RURU NOTICE
          </div>

          <h2 className={`${sizeClass.title} font-extrabold text-gray-950 leading-snug`}>
            {popup.title}
          </h2>
        </div>

        <div className={sizeClass.body}>
          <div className={`rounded-2xl bg-red-50 border border-red-100 ${sizeClass.inner}`}>
            <div className="text-red-600 font-extrabold text-sm mb-3">
              ⚠️ 꼭 확인해주세요
            </div>

            <div className={`${sizeClass.text} text-gray-800 font-bold space-y-1`}>
              {lines.map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          <button
            onClick={closeToday}
            className={`${sizeClass.button} rounded-2xl bg-gray-100 text-gray-700 font-extrabold`}
          >
            오늘 하루 닫기
          </button>

          <button
            onClick={close}
            className={`${sizeClass.button} rounded-2xl bg-black text-white font-extrabold`}
          >
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  );
}
