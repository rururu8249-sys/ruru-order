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
  return (
    <div className="mb-3 grid gap-2 rounded-xl border border-neutral-200 bg-white p-2 lg:grid-cols-[240px_132px_132px_minmax(260px,1fr)_86px] lg:items-center">
      <select
        value={dateFilter}
        onChange={(event) => setDateFilter(event.target.value)}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-[14px] font-black outline-none focus:border-neutral-950"
      >
        {dateOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <select
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-[14px] font-black outline-none focus:border-neutral-950"
      >
        <option value="전체">전체상태</option>
        <option value="미결제">미결제</option>
        <option value="결제완료">결제완료</option>
        <option value="포장전">포장전</option>
        <option value="포장완료">포장완료</option>
        <option value="출고완료">출고완료</option>
        <option value="주문서 취소">취소</option>
      </select>

      <select
        value={paymentFilter}
        onChange={(event) => setPaymentFilter(event.target.value)}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-[14px] font-black outline-none focus:border-neutral-950"
      >
        <option value="전체">전체입금</option>
        <option value="무통장 미입금">무통장 미입금</option>
        <option value="무통장 입금확인">무통장 완료</option>
        <option value="카드 미결제">카드 대기</option>
        <option value="카드 결제완료">카드 완료</option>
      </select>

      <input
        value={pendingKeyword}
        onChange={(event) => setPendingKeyword(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSearch();
        }}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-[14px] font-bold outline-none focus:border-neutral-950"
        placeholder="닉네임 / 이름 / 전화번호 / 상품 / 주문번호"
      />

      <button
        type="button"
        onClick={onSearch}
        className="h-10 rounded-lg bg-neutral-950 px-4 text-[14px] font-black text-white active:scale-[0.98]"
      >
        검색
      </button>
    </div>
  );
}
