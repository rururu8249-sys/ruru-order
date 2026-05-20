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

type MultiOption = {
  value: string;
  label: string;
};

const STATUS_OPTIONS: MultiOption[] = [
  { value: "전체", label: "상태 전체" },
  { value: "미결제", label: "미결제" },
  { value: "결제완료", label: "결제완료" },
  { value: "포장전", label: "출고준비" },
  { value: "포장완료", label: "포장완료" },
  { value: "출고완료", label: "출고완료" },
  { value: "주문서 취소", label: "취소/환불" },
];

const PAYMENT_OPTIONS: MultiOption[] = [
  { value: "전체", label: "입금 전체" },
  { value: "무통장 미입금", label: "무통장 미입금" },
  { value: "무통장 입금확인", label: "무통장완료" },
  { value: "카드 미결제", label: "카드대기" },
  { value: "카드 결제완료", label: "카드완료" },
];

function splitFilter(value: string) {
  const parts = value.split("||").map((item) => item.trim()).filter(Boolean);
  return parts.length > 0 ? parts : ["전체"];
}

function hasActive(value: string, target: string) {
  const values = splitFilter(value);
  return values.includes(target) || (target === "전체" && values.includes("전체"));
}

function toggleMultiValue(current: string, target: string) {
  if (target === "전체") return "전체";

  const currentValues = splitFilter(current).filter((item) => item !== "전체");
  const exists = currentValues.includes(target);
  const nextValues = exists
    ? currentValues.filter((item) => item !== target)
    : [...currentValues, target];

  return nextValues.length > 0 ? nextValues.join("||") : "전체";
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
    ...dateOptions.filter((option) => option.value !== "전체"),
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
