// app/components/NoticePopup.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/components/NoticePopup.tsx
//
// 테스트 버전:
// localStorage 무시
// 사이트 접속 시 무조건 팝업 표시
// 이 파일로 팝업이 뜨면 layout 연결 정상입니다.

"use client";

import { useState } from "react";

export default function NoticePopup() {
  const [open, setOpen] = useState(true);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[2rem] bg-white shadow-2xl overflow-hidden border border-gray-200">

        <div className="px-6 py-5 border-b border-gray-200">
          <div className="text-xs font-extrabold text-gray-500 mb-2">
            RURU NOTICE
          </div>

          <h2 className="text-2xl font-extrabold text-gray-900">
            주문 전 필수 확인
          </h2>
        </div>

        <div className="px-6 py-6">
          <div className="text-[15px] leading-8 text-gray-700 font-bold">
            <p>💁🏻‍♀ 방송 댓글 주문 후 라이브마켓 사이트에서 주문서 담아 주세요!</p>
            <br />
            <p>• 방송에서 접수되신 분만 주문서 작성해주세요.</p>
            <p>• 주문서 작성 후 10분 이내 입금 부탁드립니다.</p>
            <p>• 입금 후 카톡채널로 입금내역 캡처와 유튜브 닉네임을 남겨주세요.</p>
            <p>• 상품명 · 색상 · 사이즈 · 수량 · 금액을 꼭 확인해주세요.</p>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100">
          <button
            onClick={() => setOpen(false)}
            className="w-full h-14 rounded-2xl bg-black text-white font-extrabold"
          >
            확인했습니다
          </button>
        </div>

      </div>
    </div>
  );
}
