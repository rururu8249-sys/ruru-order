// components/customer/CustomerTopNav.tsx
// 새 파일 생성
// 위치: /Users/ruru/Desktop/ruru-order-app/components/customer/CustomerTopNav.tsx
// 목적: 고객 페이지 공통 상단바
// 적용 대상: /notice, /myorder, 필요 시 /order
// 규칙:
// - 로그아웃 상태: HOME 버튼만 표시
// - 로그인 상태: 안녕하세요 / 닉네임님 + HOME / 정보수정 / 로그아웃 표시
// - 주문 저장, 금액, 카드수수료, Supabase 주문 로직 없음

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  clearSavedCustomerInfo,
  getCustomerGreetingName,
  hasSavedCustomerInfo,
  readSavedCustomerInfo,
  type SavedCustomerInfo,
} from "@/lib/customer/customerSession";

const initialInfo: SavedCustomerInfo = {
  youtubeNickname: "",
  customerName: "",
  customerPhone: "",
  zipcode: "",
  address: "",
  detailAddress: "",
};

type CustomerTopNavProps = {
  showGreeting?: boolean;
  className?: string;
};

export default function CustomerTopNav({
  showGreeting = true,
  className = "",
}: CustomerTopNavProps) {
  const [customerInfo, setCustomerInfo] = useState<SavedCustomerInfo>(initialInfo);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setCustomerInfo(readSavedCustomerInfo());
    setIsReady(true);
  }, []);

  const isLoggedIn = isReady && hasSavedCustomerInfo(customerInfo);
  const greetingName = getCustomerGreetingName(customerInfo);

  const handleLogout = () => {
    if (!confirm("이 기기에 저장된 고객정보를 삭제할까요?")) return;

    clearSavedCustomerInfo();
    setCustomerInfo(initialInfo);

    window.location.href = "/";
  };

  return (
    <header className={`mb-5 flex items-start justify-between gap-3 ${className}`}>
      {showGreeting ? (
        <div className="min-h-[48px] pt-1">
          {isLoggedIn ? (
            <div className="leading-tight">
              <p className="text-[20px] font-extrabold tracking-[-0.04em] text-[#1f1713]">
                안녕하세요
              </p>
              <p className="mt-1 text-[20px] font-extrabold tracking-[-0.04em] text-[#1f1713]">
                {greetingName || "고객"}님
              </p>
            </div>
          ) : (
            <p className="text-[20px] font-extrabold tracking-[-0.04em] text-[#1f1713]">
              안녕하세요
            </p>
          )}
        </div>
      ) : (
        <div />
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href="/"
          className="rounded-2xl bg-white/95 px-3.5 py-2 text-sm font-extrabold text-[#241b17] shadow-[0_8px_20px_rgba(60,38,20,0.12)] ring-1 ring-black/5 active:scale-[0.98]"
        >
          🏠 HOME
        </Link>

        {isLoggedIn && (
          <>
            <Link
              href="/order"
              className="rounded-2xl bg-white/95 px-3.5 py-2 text-sm font-extrabold text-[#241b17] shadow-[0_8px_20px_rgba(60,38,20,0.12)] ring-1 ring-black/5 active:scale-[0.98]"
            >
              정보수정
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-2xl bg-white/95 px-3.5 py-2 text-sm font-extrabold text-[#241b17] shadow-[0_8px_20px_rgba(60,38,20,0.12)] ring-1 ring-black/5 active:scale-[0.98]"
            >
              로그아웃
            </button>
          </>
        )}
      </div>
    </header>
  );
}
