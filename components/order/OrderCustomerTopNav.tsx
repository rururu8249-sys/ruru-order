// components/order/OrderCustomerTopNav.tsx
// 목적: 주문서 페이지 상단 고객 네비게이션 UI
// 주의: 상태 변경 함수만 props로 받습니다. 주문 저장/금액/DB 로직 없음

import Link from "next/link";
import CustomerPointBadge from "@/components/customer/CustomerPointBadge";

type OrderCustomerTopNavProps = {
  isLoggedIn: boolean;
  greetingName?: string;
  onEditInfo?: () => void;
  onLogout?: () => void;
};

export default function OrderCustomerTopNav({
  isLoggedIn,
  greetingName,
  onEditInfo,
  onLogout,
}: OrderCustomerTopNavProps) {
  return (
    <header className="mb-5 rounded-[28px] bg-white/95 p-4 shadow-[0_12px_28px_rgba(30,64,175,0.08)] ring-1 ring-blue-100/70">
      <div className="flex items-start justify-between gap-3">
        <Link href="/" className="min-w-0 active:scale-[0.99]">
          <p className="text-[15px] font-black tracking-[-0.04em] text-blue-700">
            루루동이 LIVE
          </p>

          <p className="mt-1 truncate text-[18px] font-black tracking-[-0.06em] text-[#151923]">
            {isLoggedIn
              ? `${greetingName || "고객"}님 안녕하세요`
              : "주문 전 정보를 확인해주세요"}
          </p>
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
            <button
              type="button"
              onClick={onEditInfo}
              className="rounded-2xl bg-slate-50 px-3 py-3 text-center text-[13px] font-black tracking-[-0.04em] text-slate-800 ring-1 ring-slate-100 active:scale-[0.98]"
            >
              정보수정
            </button>

            <button
              type="button"
              onClick={onLogout}
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
