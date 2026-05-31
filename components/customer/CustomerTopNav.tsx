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
import CustomerPointGiftPopup from "@/components/customer/CustomerPointGiftPopup";
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
  activeTab?: "home" | "myorder" | "edit";
  variant?: "card" | "compact";
};

const navButtonClass =
  "rounded-2xl bg-slate-50 px-4 py-3 text-center text-[13px] font-black tracking-[-0.04em] text-slate-800 ring-1 ring-slate-100 transition active:scale-[0.98]";

const compactNavButtonClass =
  "rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-center text-[11px] font-black tracking-[-0.04em] text-slate-700 transition active:scale-[0.98]";

const compactActiveNavButtonClass =
  "rounded-full bg-blue-700 px-2.5 py-1.5 text-center text-[11px] font-black tracking-[-0.04em] text-white shadow-[0_8px_18px_rgba(37,99,235,0.20)] transition active:scale-[0.98]";

export default function CustomerTopNav({
  showGreeting = true,
  className = "",
  activeTab,
  variant = "card",
}: CustomerTopNavProps) {
  const [customerInfo, setCustomerInfo] = useState<SavedCustomerInfo>(initialInfo);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setCustomerInfo(readSavedCustomerInfo());
    setIsReady(true);
  }, []);

  const isLoggedIn = isReady && hasSavedCustomerInfo(customerInfo);
  const greetingName = getCustomerGreetingName(customerInfo);
  const isCompact = variant === "compact";
  const headerClassName = isCompact
    ? `mb-4 border-b border-slate-200 bg-[#f8fafc]/95 px-4 py-3 backdrop-blur ${className}`
    : `mb-4 rounded-[24px] bg-white/95 px-4 py-4 shadow-[0_10px_24px_rgba(30,64,175,0.07)] ring-1 ring-blue-100/70 ${className}`;
  const inactiveButtonClass = isCompact ? compactNavButtonClass : navButtonClass;
  const activeButtonClass = isCompact ? compactActiveNavButtonClass : navButtonClass;

  const handleLogout = () => {

    clearSavedCustomerInfo();
    setCustomerInfo(initialInfo);
    window.location.href = "/";
  };

  return (
    <header
      data-ruru-customer-top-nav={isCompact ? "compact" : "card"}
      className={headerClassName}
    >
      <div className="flex items-start justify-between gap-3">
        <Link href="/" className="min-w-0 transition active:scale-[0.99]">
          <p className={isCompact ? "text-[17px] font-black tracking-[-0.05em] text-slate-950" : "text-[15px] font-black tracking-[-0.04em] text-blue-700"}>
            루루동이 LIVE
          </p>

          {showGreeting && (
            <p className={isCompact ? "mt-1 truncate text-[13px] font-extrabold tracking-[-0.04em] text-slate-700" : "mt-1 truncate text-[17px] font-black tracking-[-0.06em] text-[#151923]"}>
              {isLoggedIn
                ? `${greetingName || "고객"}님 안녕하세요`
                : "주문 전 정보를 확인해주세요"}
            </p>
          )}
        </Link>

        {isLoggedIn && (
          <div className="flex shrink-0 flex-col items-end justify-start gap-1 self-start text-right">
            <CustomerPointBadge />
            <CustomerPointGiftPopup />
            <CustomerTestAccountBadge />
          </div>
        )}
      </div>

      <nav className={isCompact ? `mt-3 grid gap-1 ${isLoggedIn ? "grid-cols-4" : "grid-cols-1"}` : `mt-3 grid gap-2 ${isLoggedIn ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1"}`}>
        <Link href="/" className={activeTab === "home" ? activeButtonClass : inactiveButtonClass}>
          {isCompact ? "HOME" : "🏠 HOME"}
        </Link>

        {isLoggedIn && (
          <>
            <Link href="/myorder" className={activeTab === "myorder" ? activeButtonClass : inactiveButtonClass}>
              주문조회
            </Link>

            <Link href="/order?mode=edit" className={activeTab === "edit" ? activeButtonClass : inactiveButtonClass}>
              정보수정
            </Link>

            <button type="button" onClick={handleLogout} className={inactiveButtonClass}>
              로그아웃
            </button>
          </>
        )}
      </nav>
    </header>
  );
}
