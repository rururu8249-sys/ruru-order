"use client";

// components/admin-v2/orders/AdminOrderFilterBar.tsx
// 목적: 주문관리 검색/상태/입금/기간 필터
// 주의: 화면 필터 전용. 주문/입금/배송/정산 DB 저장 로직 없음.

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
  sortOption: string;
  setSortOption: (value: string) => void;
};

type ChipOption = {
  value: string;
  label: string;
};

const PERIOD_OPTIONS: ChipOption[] = [
  { value: "today", label: "오늘" },
  { value: "yesterday", label: "어제" },
  { value: "7days", label: "7일" },
  { value: "30days", label: "30일" },
  { value: "custom", label: "직접선택" },
];

const STATUS_OPTIONS: ChipOption[] = [
  { value: "all", label: "전체" },
  { value: "ready", label: "출고준비" },
  { value: "shipped", label: "발송완료" },
  { value: "canceled", label: "취소·환불" },
];

const PAYMENT_OPTIONS: ChipOption[] = [
  { value: "all", label: "전체" },
  { value: "paid", label: "결제완료" },
  { value: "unpaid", label: "미결제" },
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

function parseDateRange(value: string) {
  const raw = String(value || "").trim();

  if (!raw || raw === "all" || raw === "전체" || raw === "방송 전체보기") {
    return {
      startDate: "",
      endDate: "",
    };
  }

  if (raw.startsWith("range:")) {
    const [, startDate = "", endDate = ""] = raw.split(":");

    return {
      startDate,
      endDate,
    };
  }

  return {
    startDate: raw,
    endDate: raw,
  };
}

function makeDateRangeValue(startDate: string, endDate: string) {
  if (!startDate && !endDate) return "all";
  return `range:${startDate}:${endDate}`;
}

function getDateKey(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function getRangeFromPeriod(period: string) {
  if (period === "today") {
    const today = getDateKey(0);
    return makeDateRangeValue(today, today);
  }

  if (period === "yesterday") {
    const yesterday = getDateKey(-1);
    return makeDateRangeValue(yesterday, yesterday);
  }

  if (period === "7days") {
    return makeDateRangeValue(getDateKey(-6), getDateKey(0));
  }

  if (period === "30days") {
    return makeDateRangeValue(getDateKey(-29), getDateKey(0));
  }

  return "";
}

function isPeriodActive(dateFilter: string, period: string) {
  if (period === "custom") {
    return String(dateFilter || "").startsWith("range:");
  }

  return getRangeFromPeriod(period) === dateFilter;
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
      className={`h-11 min-w-[68px] rounded-xl border px-4 text-[14px] font-black active:scale-[0.98] ${
        active
          ? "border-neutral-950 bg-neutral-950 text-white shadow-sm"
          : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400"
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
  sortOption,
  setSortOption,
}: AdminOrderFilterBarProps) {
  void dateOptions;

  const { startDate, endDate } = parseDateRange(dateFilter);

  const setStartDate = (value: string) => {
    setDateFilter(makeDateRangeValue(value, endDate));
  };

  const setEndDate = (value: string) => {
    setDateFilter(makeDateRangeValue(startDate, value));
  };

  const resetFilters = () => {
    setDateFilter("all");
    setStatusFilter("all");
    setPaymentFilter("all");
    setPendingKeyword("");
  };

  return (
    <section className="mb-4 rounded-[22px] border border-neutral-200 bg-white shadow-sm">
      <div className="grid gap-5 p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(520px,760px)_minmax(320px,1fr)_auto_auto] xl:items-end">
          <div>
            <div className="mb-2 text-[12px] font-black text-neutral-500">기간</div>

            <div className="flex w-full flex-wrap items-center gap-3 rounded-[999px] border border-neutral-200 bg-white px-4 py-3 shadow-sm">
              <div className="shrink-0 text-[18px] font-black text-neutral-800">기간설정</div>

              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="h-12 w-full sm:w-[150px] sm:min-w-[150px] sm:max-w-[150px] sm:flex-none rounded-2xl border border-slate-200 bg-white px-3 text-[14px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                aria-label="시작일"
              />

              <span className="shrink-0 text-[18px] font-black text-neutral-400">~</span>

              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="h-12 w-full sm:w-[150px] sm:min-w-[150px] sm:max-w-[150px] sm:flex-none rounded-2xl border border-slate-200 bg-white px-3 text-[14px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                aria-label="종료일"
              />

              <button
                type="button"
                onClick={onSearch}
                className="h-12 rounded-[999px] bg-neutral-950 px-7 text-[16px] font-black text-white active:scale-[0.98]"
              >
                확인
              </button>

              <button
                type="button"
                onClick={() => {
                  const today = getDateKey(0);
                  setDateFilter(makeDateRangeValue(today, today));
                  setPendingKeyword(pendingKeyword);
                }}
                className="h-12 rounded-[999px] border border-neutral-200 bg-white px-7 text-[16px] font-black text-neutral-800 active:scale-[0.98]"
              >
                오늘
              </button>

            </div>
          </div>

          <div className="relative min-w-0">
            <div className="mb-2 text-[12px] font-black text-neutral-500">키워드 검색</div>
            <input
              value={pendingKeyword}
              onChange={(event) => setPendingKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearch();
              }}
              className="h-12 w-full rounded-2xl border border-neutral-200 bg-white pl-4 pr-11 text-[14px] font-bold outline-none focus:border-neutral-950"
              placeholder="주문번호, 닉네임, 상품명 검색"
            />
            <button
              type="button"
              onClick={onSearch}
              className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg text-[16px] font-black text-neutral-500 hover:bg-neutral-100"
              aria-label="검색"
            >
              🔍
            </button>
          </div>

          <button
            type="button"
            onClick={onSearch}
            className="h-12 rounded-2xl bg-neutral-950 px-7 text-[14px] font-black text-white active:scale-[0.98]"
          >
            검색
          </button>

          <button
            type="button"
            onClick={resetFilters}
            className="h-12 rounded-2xl border border-neutral-200 bg-white px-5 text-[13px] font-black text-neutral-700 active:scale-[0.98]"
          >
            초기화
          </button>
        </div>

        <div className="grid gap-4 border-t border-neutral-100 pt-4 xl:grid-cols-[1fr_1fr_1fr]">
          <div>
            <div className="mb-2 text-[12px] font-black text-neutral-500">주문상태</div>
            <div className="flex flex-wrap gap-1.5">
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

          <div>
            <div className="mb-2 text-[12px] font-black text-neutral-500">배송처리</div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((option) => (
                <FilterChip
                  key={option.value}
                  active={hasActive(statusFilter, option.value)}
                  label={option.label}
                  onClick={() => setStatusFilter(toggleMultiValue(statusFilter, option.value))}
                />
              ))}
            </div>
          </div>


          <div>
            <div className="mb-2 text-[12px] font-black text-neutral-500">정렬</div>
            <select
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value)}
              className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-[14px] font-black outline-none focus:border-neutral-950"
            >
              <option value="created_desc">주문일시 최신순</option>
              <option value="created_asc">주문일시 오래된순</option>
              <option value="amount_desc">금액 높은순</option>
              <option value="amount_asc">금액 낮은순</option>
              <option value="nickname_asc">닉네임 가나다순</option>
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}
