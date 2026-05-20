"use client";

type Option = {
  value: string;
  label: string;
};

type AdminOrderFilterBarProps = {
  pendingKeyword: string;
  setPendingKeyword: (value: string) => void;
  onSearch: () => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  paymentFilter: string;
  setPaymentFilter: (value: string) => void;
  dateFilter: string;
  setDateFilter: (value: string) => void;
  dateOptions: Option[];
};

type QuickFilter = {
  label: string;
  status: string;
  payment: string;
};

const QUICK_FILTERS: QuickFilter[] = [
  { label: "전체보기", status: "전체", payment: "전체" },
  { label: "미입금", status: "전체", payment: "무통장 미입금" },
  { label: "입금확인", status: "전체", payment: "무통장 입금확인" },
  { label: "카드결제완료", status: "전체", payment: "카드 결제완료" },
  { label: "출고준비", status: "포장전", payment: "전체" },
  { label: "출고완료", status: "출고완료", payment: "전체" },
  { label: "취소/환불", status: "주문서 취소", payment: "전체" },
];

export default function AdminOrderFilterBar({
  pendingKeyword,
  setPendingKeyword,
  onSearch,
  statusFilter,
  setStatusFilter,
  paymentFilter,
  setPaymentFilter,
  dateFilter,
  setDateFilter,
  dateOptions,
}: AdminOrderFilterBarProps) {
  const activeQuickLabel =
    QUICK_FILTERS.find((item) => item.status === statusFilter && item.payment === paymentFilter)?.label || "";

  const applyQuickFilter = (item: QuickFilter) => {
    setStatusFilter(item.status);
    setPaymentFilter(item.payment);
  };

  return (
    <div className="mb-4 grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[280px] flex-1 max-w-[420px]">
          <input
            value={pendingKeyword}
            onChange={(event) => setPendingKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearch();
            }}
            className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-4 pr-11 text-[14px] font-bold outline-none focus:border-blue-600"
            placeholder="주문자명, 닉네임, 상품명, 주문번호 검색"
          />
          <button
            type="button"
            onClick={onSearch}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[16px] font-black text-neutral-500 hover:bg-neutral-100"
            aria-label="검색"
          >
            🔍
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_FILTERS.map((item) => {
            const active = activeQuickLabel === item.label;

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => applyQuickFilter(item)}
                className={`h-11 rounded-xl border px-4 text-[14px] font-black active:scale-[0.98] ${
                  active
                    ? "border-blue-600 bg-white text-blue-700 shadow-sm"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-[13px] font-black outline-none focus:border-blue-600"
        >
          {dateOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-[13px] font-black outline-none focus:border-blue-600"
          >
            <option value="전체">상태 전체</option>
            <option value="미결제">미결제</option>
            <option value="결제완료">결제완료</option>
            <option value="포장전">포장전</option>
            <option value="포장완료">포장완료</option>
            <option value="출고완료">출고완료</option>
            <option value="주문서 취소">취소/환불</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value)}
            className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-[13px] font-black outline-none focus:border-blue-600"
          >
            <option value="전체">입금 전체</option>
            <option value="무통장 미입금">무통장 미입금</option>
            <option value="무통장 입금확인">무통장 입금확인</option>
            <option value="카드 미결제">카드 미결제</option>
            <option value="카드 결제완료">카드 결제완료</option>
          </select>
        </div>
      </div>
    </div>
  );
}
