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
import CustomerNoteUnreadBadge, { useNoteUnread } from "@/components/customer/CustomerNoteUnreadBadge";
import {
  clearSavedCustomerInfo,
  clearCartOnLogout,
  getCustomerGreetingName,
  hasSavedCustomerInfo,
  readSavedCustomerInfo,
  type SavedCustomerInfo,
} from "@/lib/customer/customerSession";
import { useCustomerUiStage } from "@/lib/useCustomerUiStage";

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
  // [㊾] 아래 5칸 메뉴(CustomerBottomNav)를 쓰는 화면 — 새 모양이면 위쪽 메뉴 줄·「공지·쪽지」 버튼을 안 그린다(로그아웃은 내정보 창 안)
  bottomNav?: boolean;
};

const navButtonClass =
  "rounded-2xl bg-slate-50 px-4 py-3 text-center text-[13px] font-black tracking-[-0.04em] text-slate-800 ring-1 ring-slate-100 transition active:scale-[0.98]";

const compactNavButtonClass =
  "rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-center text-[11px] font-black tracking-[-0.04em] text-slate-700 transition active:scale-[0.98]";

const compactActiveNavButtonClass =
  "rounded-full bg-coral-700 px-2.5 py-1.5 text-center text-[11px] font-black tracking-[-0.04em] text-white shadow-[0_8px_18px_rgba(216,90,48,0.20)] transition active:scale-[0.98]";

export default function CustomerTopNav({
  showGreeting = true,
  className = "",
  activeTab,
  variant = "card",
  bottomNav = false,
}: CustomerTopNavProps) {
  const [customerInfo, setCustomerInfo] = useState<SavedCustomerInfo>(initialInfo);
  const [isReady, setIsReady] = useState(false);
  // [2026-09-20] 오른쪽 아래 떠 있던 🔔 버튼을 없앤 대신, 하단 메뉴가 없는 화면(주문조회·공지 등)의 들어가는 길
  const noteUnread = useNoteUnread();
  // [㉜ 4단계] 머리말 새 모양(주문내역·공지) — ?preview=s4. 표시 전용(로그인·로그아웃·이동 동작 무변경).
  const v2 = useCustomerUiStage("s4");
  const hideTopMenus = v2 && bottomNav; // [㊾] 새 모양 + 아래 메뉴 있는 화면

  useEffect(() => {
    setCustomerInfo(readSavedCustomerInfo());
    setIsReady(true);
  }, []);

  const isLoggedIn = isReady && hasSavedCustomerInfo(customerInfo);
  const greetingName = getCustomerGreetingName(customerInfo);
  const isCompact = variant === "compact";
  const headerClassName = v2
    ? `mb-4 border-b border-[#E5E5E5] bg-white px-1 pb-3 pt-1 ${className}`
    : isCompact
    ? `mb-4 border-b border-slate-200 bg-[#f8fafc]/95 px-4 py-3 backdrop-blur ${className}`
    : `mb-4 rounded-[24px] bg-white/95 px-4 py-4 shadow-[0_10px_24px_rgba(30,64,175,0.07)] ring-1 ring-coral-100/70 ${className}`;
  const v2NavButtonClass = "flex min-h-[44px] items-center justify-center rounded-full border border-[#CACACB] bg-white px-2 text-center text-[14px] font-semibold text-[#111111] transition active:scale-[0.97]";
  const v2ActiveNavButtonClass = "flex min-h-[44px] items-center justify-center rounded-full bg-[#111111] px-2 text-center text-[14px] font-semibold text-white transition active:scale-[0.97]";
  const inactiveButtonClass = v2 ? v2NavButtonClass : isCompact ? compactNavButtonClass : navButtonClass;
  const activeButtonClass = v2 ? v2ActiveNavButtonClass : isCompact ? compactActiveNavButtonClass : navButtonClass;

  const handleLogout = () => {

    clearSavedCustomerInfo();
    clearCartOnLogout(); // [2026-08-31] 담긴 상품·서버 선점도 함께 정리 (유령 선점 방지)
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
          <p className={v2 ? "text-[17px] font-bold text-[#111111]" : isCompact ? "text-[17px] font-black tracking-[-0.05em] text-slate-950" : "text-[15px] font-black tracking-[-0.04em] text-coral-700"}>
            루루동이 LIVE
          </p>

          {showGreeting && (
            <p className={v2 ? "mt-1 truncate text-[14px] font-normal text-[#39393B]" : isCompact ? "mt-1 truncate text-[13px] font-extrabold tracking-[-0.04em] text-slate-700" : "mt-1 truncate text-[17px] font-black tracking-[-0.06em] text-[#151923]"}>
              {isLoggedIn
                ? `${greetingName || "고객"}님 안녕하세요`
                : "주문 전 정보를 확인해 주세요"}
            </p>
          )}
        </Link>

        {isLoggedIn && (
          <div className="flex shrink-0 flex-col items-end justify-start gap-1 self-start text-right">
            {hideTopMenus ? null : (
            <button
              type="button"
              onClick={() => { try { window.dispatchEvent(new Event("ruru-open-notice-box")); } catch { /* 무시 */ } }}
              aria-label={noteUnread > 0 ? `공지·쪽지함 (안 읽음 ${noteUnread}개)` : "공지·쪽지함"}
              className={v2 ? "relative inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-[#CACACB] bg-white px-3 text-[14px] font-semibold text-[#111111] transition active:scale-[0.97]" : "relative inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 transition active:scale-[0.98]"}
            >
              <span className={v2 ? "relative inline-flex text-[13px] leading-none" : "relative text-[13px] leading-none"}>
                {v2 ? <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg> : "📬"}
                <CustomerNoteUnreadBadge count={noteUnread} offset={{ top: -8, right: -8 }} />
              </span>
              공지·쪽지
            </button>
            )}
            <CustomerPointBadge />
            <CustomerPointGiftPopup />
            <CustomerTestAccountBadge />
          </div>
        )}
      </div>

      {hideTopMenus ? null : (
      <nav className={v2 ? `mt-3 grid gap-1.5 ${isLoggedIn ? "grid-cols-4" : "grid-cols-1"}` : isCompact ? `mt-3 grid gap-1 ${isLoggedIn ? "grid-cols-4" : "grid-cols-1"}` : `mt-3 grid gap-2 ${isLoggedIn ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1"}`}>
        <Link href="/" className={activeTab === "home" ? activeButtonClass : inactiveButtonClass}>
          {isCompact || v2 ? "HOME" : "🏠 HOME"}
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
      )}
    </header>
  );
}
