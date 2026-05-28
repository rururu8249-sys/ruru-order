// components/customer/CustomerTopNav.tsx
// 목적: 고객 페이지 공통 상단바
// 기준:
// - 비로그인: 루루동이 LIVE / 안내문 / HOME만 표시
// - 로그인: HOME / 주문조회 / 정보수정 / 로그아웃 / 포인트 표시
// - 공구상품은 상단바에 넣지 않음
// - 주문 저장, 금액, Supabase, 입금매칭, 송장 로직 없음

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CustomerPointBadge from "@/components/customer/CustomerPointBadge";
import CustomerTestAccountBadge from "@/components/customer/CustomerTestAccountBadge";
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

const navButtonClass =
  "rounded-2xl bg-slate-50 px-4 py-3 text-center text-[13px] font-black tracking-[-0.04em] text-slate-800 ring-1 ring-slate-100 transition active:scale-[0.98]";

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

    clearSavedCustomerInfo();
    setCustomerInfo(initialInfo);
    window.location.href = "/";
  };

  return (
    <header
      className={`mb-4 rounded-[24px] bg-white/95 px-4 py-4 shadow-[0_10px_24px_rgba(30,64,175,0.07)] ring-1 ring-blue-100/70 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <Link href="/" className="min-w-0 transition active:scale-[0.99]">
          <p className="text-[15px] font-black tracking-[-0.04em] text-blue-700">
            루루동이 LIVE
          </p>

          {showGreeting && (
            <p className="mt-1 truncate text-[17px] font-black tracking-[-0.06em] text-[#151923]">
              {isLoggedIn
                ? `${greetingName || "고객"}님 안녕하세요`
                : "주문 전 정보를 확인해주세요"}
            </p>
          )}
        </Link>

        {isLoggedIn && (
          <div className="flex shrink-0 flex-col items-end justify-start gap-1 self-start text-right">
            <CustomerPointBadge />
            <CustomerTestAccountBadge />
          </div>
        )}
      </div>

      <nav className={`mt-3 grid gap-2 ${isLoggedIn ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1"}`}>
        <Link href="/" className={navButtonClass}>
          🏠 HOME
        </Link>

        {isLoggedIn && (
          <>
            <Link href="/myorder" className={navButtonClass}>
              주문조회
            </Link>

            <Link href="/order?mode=edit" className={navButtonClass}>
              정보수정
            </Link>

            <button type="button" onClick={handleLogout} className={navButtonClass}>
              로그아웃
            </button>
          </>
        )}
      </nav>
    </header>
  );
}
