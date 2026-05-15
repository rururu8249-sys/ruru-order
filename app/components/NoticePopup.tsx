// app/components/NoticePopup.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/components/NoticePopup.tsx
//
// 기능:
// - 사이트 접속 시 주문 전 필수 확인 팝업 표시
// - 닫기
// - 오늘 하루 보지 않기
// - 모바일/PC 디자인 정리
//
// 다음 단계에서 관리자 공지관리와 연결 예정

"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ruru_notice_popup_hide_until";

export default function NoticePopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const hideUntil = localStorage.getItem(STORAGE_KEY);
    const now = Date.now();

    if (!hideUntil || now > Number(hideUntil)) {
      setOpen(true);
    }
  }, []);

  const close = () => {
    setOpen(false);
  };

  const closeToday = () => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    localStorage.setItem(STORAGE_KEY, String(endOfToday.getTime()));
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-black/45 backdrop-blur-[2px] flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-md rounded-[2rem] bg-white shadow-2xl overflow-hidden border border-gray-100">

        <div className="px-6 py-5 border-b border-gray-100">
          <div className="text-xs font-extrabold text-gray-400 mb-2 tracking-wide">
            RURU NOTICE
          </div>

          <h2 className="text-2xl font-extrabold text-gray-950">
            주문 전 필수 확인
          </h2>
        </div>

        <div className="px-6 py-6">
          <div className="rounded-3xl bg-red-50 border border-red-100 px-5 py-5">
            <div className="text-red-600 font-extrabold text-lg mb-4">
              ⚠️ 주문 전 꼭 확인해주세요
            </div>

            <div className="text-[15px] leading-8 text-gray-800 font-bold">
              <p>💁🏻‍♀ 방송 댓글 주문 후 주문서작성/입금 해주세요.</p>
              <p>• 방송에서 접수되신 분만 주문서 작성해주세요.</p>
              <p>• 주문서 작성 후 10분 이내 입금 부탁드립니다.</p>
              <p>• 입금 후 카톡채널로 입금내역 캡처와 유튜브 닉네임을 남겨주세요.</p>
              <p>• 상품명 · 색상 · 사이즈 · 수량 · 금액을 꼭 확인해주세요</p>
              <p>• 교환·환불이 불가하니 신중구매 부탁드립니다🙏</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 px-5 pb-5">
          <button
            onClick={closeToday}
            className="h-14 rounded-2xl bg-gray-100 text-gray-700 font-extrabold"
          >
            오늘 하루 닫기
          </button>

          <button
            onClick={close}
            className="h-14 rounded-2xl bg-black text-white font-extrabold"
          >
            확인했습니다
          </button>
        </div>

      </div>
    </div>
  );
}
