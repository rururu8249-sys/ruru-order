// components/admin/AdminQuickFilters.tsx
// 주문관리 빠른 필터 버튼 컴포넌트
// 새 파일 생성용
// 위치: components/admin/AdminQuickFilters.tsx

"use client";

type AdminQuickFiltersProps = {
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  paymentFilter: string;
  setPaymentFilter: (value: string) => void;
};

const statusButtons = [
  "전체상태",
  "주문확인전",
  "주문확인완료",
  "출고대기",
  "출고완료",
  "주문서취소",
  "환불",
  "부분환불",
];

const paymentButtons = [
  "전체결제",
  "무통장입금",
  "카드결제",
];

const buttonBase =
  "px-4 py-2 rounded-2xl border text-sm font-extrabold transition whitespace-nowrap";

const activeClass =
  "bg-black text-white border-black";

const inactiveClass =
  "bg-white text-gray-700 border-gray-200 hover:bg-gray-100";

export default function AdminQuickFilters({
  statusFilter,
  setStatusFilter,
  paymentFilter,
  setPaymentFilter,
}: AdminQuickFiltersProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-3xl p-4 mb-4">
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-sm font-extrabold text-gray-700 mb-2">
            주문상태 빠른 필터
          </div>

          <div className="flex flex-wrap gap-2">
            {statusButtons.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatusFilter(item)}
                className={`${buttonBase} ${
                  statusFilter === item ? activeClass : inactiveClass
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-extrabold text-gray-700 mb-2">
            결제수단 빠른 필터
          </div>

          <div className="flex flex-wrap gap-2">
            {paymentButtons.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPaymentFilter(item)}
                className={`${buttonBase} ${
                  paymentFilter === item ? activeClass : inactiveClass
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
