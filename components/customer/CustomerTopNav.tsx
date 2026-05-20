// components/customer/CustomerTopNav.tsx
// 목적: 고객 페이지 공통 상단바
// 규칙:
// - 루루동이 LIVE / HOME / 주문조회 / 정보수정 / 로그아웃 / 인사말 / 포인트 0원 표시
// - 공구상품은 상단바에 넣지 않음
// - 주문 저장, 금액, 카드수수료, Supabase, 입금매칭, 송장 로직 없음

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CustomerPointBadge from "@/components/customer/CustomerPointBadge";
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
    <header className={`mb-5 rounded-[28px] bg-white/95 p-4 shadow-[0_12px_28px_rgba(30,64,175,0.08)] ring-1 ring-blue-100/70 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <Link href="/" className="min-w-0 active:scale-[0.99]">
          <p className="text-[15px] font-black tracking-[-0.04em] text-blue-700">
            루루동이 LIVE
          </p>

          {showGreeting && (
            <p className="mt-1 truncate text-[18px] font-black tracking-[-0.06em] text-[#151923]">
              {isLoggedIn
                ? `${greetingName || "고객"}님 안녕하세요`
                : "주문 전 정보를 확인해주세요"}
            </p>
          )}
        </Link>

        <CustomerPointBadge className="shrink-0" />
      </div>

      <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Link
          href="/"
          className="rounded-2xl bg-slate-50 px-3 py-3 text-center text-[13px] font-black tracking-[-0.04em] text-slate-800 ring-1 ring-slate-100 active:scale-[0.98]"
        >
          🏠 HOME
        </Link>

        {isLoggedIn && (
          <>
            <Link
              href="/myorder"
              className="rounded-2xl bg-slate-50 px-3 py-3 text-center text-[13px] font-black tracking-[-0.04em] text-slate-800 ring-1 ring-slate-100 active:scale-[0.98]"
            >
              주문조회
            </Link>
            <Link
              href="/order?mode=edit"
              className="rounded-2xl bg-slate-50 px-3 py-3 text-center text-[13px] font-black tracking-[-0.04em] text-slate-800 ring-1 ring-slate-100 active:scale-[0.98]"
            >
              정보수정
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-2xl bg-slate-50 px-3 py-3 text-center text-[13px] font-black tracking-[-0.04em] text-slate-800 ring-1 ring-slate-100 active:scale-[0.98]"
            >
              로그아웃
            </button>
          </>
        )}
      </nav>
    </header>
  );
}
