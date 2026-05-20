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

type ChipOption = {
  value: string;
  label: string;
};

const STATUS_OPTIONS: ChipOption[] = [
  { value: "all", label: "상태 전체" },
  { value: "unpaid", label: "미결제" },
  { value: "paid", label: "결제완료" },
  { value: "ready", label: "출고준비" },
  { value: "shipped", label: "출고완료" },
  { value: "canceled", label: "취소/환불" },
];

const PAYMENT_OPTIONS: ChipOption[] = [
  { value: "all", label: "입금 전체" },
  { value: "bank", label: "무통장" },
  { value: "card", label: "카드결제" },
];

function splitFilter(value: string) {
  const parts = String(value || "all")
    .split("||")
    .map((item) => item.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : ["all"];
}

function hasActive(current: string, target: string) {
  const values = splitFilter(current);
  return values.includes(target) || (target === "all" && (values.includes("all") || values.includes("전체")));
}

function toggleMultiValue(current: string, target: string) {
  if (target === "all") return "all";

  const currentValues = splitFilter(current).filter((item) => item !== "all" && item !== "전체");
  const exists = currentValues.includes(target);
  const nextValues = exists
    ? currentValues.filter((item) => item !== target)
    : [...currentValues, target];

  return nextValues.length > 0 ? nextValues.join("||") : "all";
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-xl border px-3 text-[13px] font-black active:scale-[0.98] ${
        active
          ? "border-blue-600 bg-blue-50 text-blue-700"
          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
      }`}
    >
      {label}
    </button>
  );
}

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
  const mergedDateOptions: Option[] = [
    { value: "all", label: "방송 전체보기" },
    ...dateOptions.filter((option) => option.value !== "all" && option.value !== "전체"),
  ];

  return (
    <div className="mb-4 grid gap-3 rounded-2xl border border-neutral-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[280px] flex-1 max-w-[460px]">
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

        <select
          value={dateFilter === "전체" ? "all" : dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          className="h-11 min-w-[220px] rounded-xl border border-neutral-200 bg-white px-3 text-[14px] font-black outline-none focus:border-blue-600"
        >
          {mergedDateOptions.map((option) => (
            <option key={`${option.value}-${option.label}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onSearch}
          className="h-11 rounded-xl bg-neutral-950 px-5 text-[14px] font-black text-white active:scale-[0.98]"
        >
          검색
        </button>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-16 text-[12px] font-black text-neutral-500">상태</div>
          {STATUS_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              active={hasActive(statusFilter, option.value)}
              label={option.label}
              onClick={() => setStatusFilter(toggleMultiValue(statusFilter, option.value))}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-16 text-[12px] font-black text-neutral-500">입금</div>
          {PAYMENT_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              active={hasActive(paymentFilter, option.value)}
              label={option.label}
              onClick={() => setPaymentFilter(toggleMultiValue(paymentFilter, option.value))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
