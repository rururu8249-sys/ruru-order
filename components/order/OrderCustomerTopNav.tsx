// components/order/OrderCustomerTopNav.tsx
// 새 파일 생성
// 위치: /Users/ruru/Desktop/ruru-order-app/components/order/OrderCustomerTopNav.tsx
// 목적: 주문서 페이지 상단 고객 네비게이션 UI 분리
// 주의: 상태 변경 함수만 props로 받습니다. 주문 저장/금액/DB 로직 없음

import Link from "next/link";

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
    <header className="mb-5 flex items-start justify-between gap-3">
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

      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href="/"
          className="rounded-2xl bg-white/95 px-3.5 py-2 text-sm font-extrabold text-[#241b17] shadow-[0_8px_20px_rgba(60,38,20,0.12)] ring-1 ring-black/5 active:scale-[0.98]"
        >
          🏠 HOME
        </Link>

        {isLoggedIn && (
          <>
            <button
              type="button"
              onClick={onEditInfo}
              className="rounded-2xl bg-white/95 px-3.5 py-2 text-sm font-extrabold text-[#241b17] shadow-[0_8px_20px_rgba(60,38,20,0.12)] ring-1 ring-black/5 active:scale-[0.98]"
            >
              정보수정
            </button>

            <button
              type="button"
              onClick={onLogout}
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
