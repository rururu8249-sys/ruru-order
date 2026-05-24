"use client";

import { useMemo, useState } from "react";
import type { DepositRow, OrderGroup } from "@/lib/admin-v2/types";

type Props = {
  deposits: DepositRow[];
  orderGroups: OrderGroup[];
  onRefresh?: () => Promise<void> | void;
};

type DepositStatusFilter = "all" | "confirmed" | "unmatched" | "auto" | "manual";
type DepositDateFilter = "all" | "today" | "yesterday" | "7days" | "month" | "custom";

type DepositFilters = {
  keyword: string;
  status: DepositStatusFilter;
  date: DepositDateFilter;
  customStartDate: string;
  customEndDate: string;
};

const DEFAULT_FILTERS: DepositFilters = {
  keyword: "",
  status: "all",
  date: "all",
  customStartDate: "",
  customEndDate: "",
};

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function getDepositAmount(deposit: DepositRow) {
  return Number((deposit as any).amount || (deposit as any).deposit_amount || 0);
}

function getDepositName(deposit: DepositRow) {
  const row = deposit as any;
  return text(row.depositor || row.deposit_depositor || row.depositor_name || row.sender_name || row.name) || "-";
}

function getDepositRawDateTime(deposit: DepositRow) {
  const row = deposit as any;
  const candidates = [
    row.deposited_at,
    row.created_at,
    row.deposit_datetime,
    row.deposited_time,
    row.deposit_time,
  ];

  return text(candidates.find((value) => text(value))) || "";
}

function getDepositTime(deposit: DepositRow) {
  return getDepositRawDateTime(deposit) || "-";
}

function formatDepositDateTime(deposit: DepositRow) {
  const row = deposit as any;
  const raw = getDepositRawDateTime(deposit);

  if (!raw) return "-";

  const date = new Date(raw);

  if (!Number.isFinite(date.getTime())) {
    const dateText = text(row.deposited_date || row.deposit_date || row.date);
    const timeText = text(row.deposited_time || row.deposit_time);

    if (dateText && timeText) {
      const combined = new Date(`${dateText} ${timeText}`);
      if (Number.isFinite(combined.getTime())) {
        return formatKoreanDateTime(combined);
      }

      return `${dateText} ${timeText}`;
    }

    return raw;
  }

  return formatKoreanDateTime(date);
}

function formatKoreanDateTime(date: Date) {
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const yyyy = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = weekdays[date.getDay()];
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}년 ${month}월 ${day}일(${weekday}) ${hh}:${mi}`;
}

function getDepositMemo(deposit: DepositRow) {
  const row = deposit as any;
  return text(row.memo || row.admin_memo || row.note || row.description || row.bkjukyo || "");
}

function getDepositStatus(deposit: DepositRow) {
  const row = deposit as any;
  return text(row.match_status || row.status || "");
}

function isDepositConfirmed(deposit: DepositRow) {
  const row = deposit as any;
  const status = getDepositStatus(deposit);

  if (!status || status === "미확인" || status === "미매칭") {
    return false;
  }

  return (
    Boolean(row.confirmed_at) ||
    Boolean(row.match_order_group_id) ||
    Boolean(row.matched_order_group_id) ||
    ["수동입금확인", "자동입금확인", "입금확인", "매칭완료", "처리완료", "완료"].includes(status)
  );
}

function statusBadge(deposit: DepositRow) {
  if (isDepositConfirmed(deposit)) {
    const status = getDepositStatus(deposit) || "입금확인";

    if (status === "수동입금확인") {
      return <span className="rounded-lg bg-blue-100 px-2 py-1 text-xs font-black text-blue-700">수동입금확인</span>;
    }

    if (status === "자동입금확인") {
      return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">자동입금확인</span>;
    }

    return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">입금확인</span>;
  }

  return <span className="rounded-lg bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">미매칭입금</span>;
}

function localDateKey(value: string | null | undefined) {
  if (!value || value === "-") return "";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDateInput(value: string) {
  const nextValue = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(nextValue) ? nextValue : "";
}

function matchesDate(deposit: DepositRow, filters: DepositFilters) {
  if (filters.date === "all") return true;

  const depositDateKey = localDateKey(getDepositTime(deposit));
  if (!depositDateKey) return false;

  if (filters.date === "custom") {
    const startDate = normalizeDateInput(filters.customStartDate);
    const endDate = normalizeDateInput(filters.customEndDate);

    if (!startDate && !endDate) return true;
    if (startDate && depositDateKey < startDate) return false;
    if (endDate && depositDateKey > endDate) return false;

    return true;
  }

  const now = new Date();
  const todayKey = localDateKey(now.toISOString());

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday.toISOString());

  if (filters.date === "today") return depositDateKey === todayKey;
  if (filters.date === "yesterday") return depositDateKey === yesterdayKey;

  const depositDate = new Date(getDepositTime(deposit) || depositDateKey);
  if (!Number.isFinite(depositDate.getTime())) return false;

  if (filters.date === "7days") {
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    return depositDate >= sevenDaysAgo;
  }

  if (filters.date === "month") {
    return depositDate.getFullYear() === now.getFullYear() && depositDate.getMonth() === now.getMonth();
  }

  return true;
}

function matchesStatus(deposit: DepositRow, status: DepositStatusFilter) {
  if (status === "all") return true;

  const depositStatus = getDepositStatus(deposit);

  if (status === "confirmed") return isDepositConfirmed(deposit);
  if (status === "unmatched") return !isDepositConfirmed(deposit);
  if (status === "auto") return depositStatus === "자동입금확인";
  if (status === "manual") return depositStatus === "수동입금확인";

  return true;
}

function matchesKeyword(deposit: DepositRow, keyword: string) {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    getDepositName(deposit),
    String(getDepositAmount(deposit)),
    money(getDepositAmount(deposit)),
    getDepositStatus(deposit),
    getDepositMemo(deposit),
    getDepositTime(deposit),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-black text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-bold text-slate-400">{sub}</div>
    </div>
  );
}

export default function AdminLivePaymentPanel({ deposits, orderGroups, onRefresh }: Props) {
  const [filters, setFilters] = useState<DepositFilters>(DEFAULT_FILTERS);
  const [refreshing, setRefreshing] = useState(false);

  const filteredDeposits = useMemo(() => {
    return [...deposits]
      .filter((deposit) => matchesStatus(deposit, filters.status))
      .filter((deposit) => matchesDate(deposit, filters))
      .filter((deposit) => matchesKeyword(deposit, filters.keyword))
      .sort((a, b) => getDepositTime(b).localeCompare(getDepositTime(a)));
  }, [deposits, filters]);

  const confirmedDeposits = filteredDeposits.filter(isDepositConfirmed);
  const unmatchedDeposits = filteredDeposits.filter((deposit) => !isDepositConfirmed(deposit));

  const totalAmount = filteredDeposits.reduce((sum, deposit) => sum + getDepositAmount(deposit), 0);
  const confirmedAmount = confirmedDeposits.reduce((sum, deposit) => sum + getDepositAmount(deposit), 0);
  const unmatchedAmount = unmatchedDeposits.reduce((sum, deposit) => sum + getDepositAmount(deposit), 0);

  const visibleDeposits = filteredDeposits.slice(0, 80);

  const updateFilter = <K extends keyof DepositFilters>(key: K, value: DepositFilters[K]) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;

    try {
      setRefreshing(true);
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="grid gap-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black tracking-[0.18em] text-blue-500">PAYMENT CHECK</div>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950">입금확인</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">
              검색·상태필터·기간필터까지 연결했습니다. 자동입금확인·수동입금확인·뱅크다 새로고침은 아직 실행하지 않습니다.
            </p>
          </div>

          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            조회/필터 연결
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="표시 입금내역" value={`${filteredDeposits.length.toLocaleString("ko-KR")}건`} sub={money(totalAmount)} />
          <SummaryCard label="입금확인 완료" value={`${confirmedDeposits.length.toLocaleString("ko-KR")}건`} sub={money(confirmedAmount)} />
          <SummaryCard label="미매칭 입금" value={`${unmatchedDeposits.length.toLocaleString("ko-KR")}건`} sub={money(unmatchedAmount)} />
          <SummaryCard label="주문 그룹" value={`${orderGroups.length.toLocaleString("ko-KR")}건`} sub="현재 주문 데이터 기준" />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">입금내역 조회</h2>
            <div className="mt-1 text-xs font-bold text-slate-400">최대 80건 표시 · 조회 전용</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={!onRefresh || refreshing}
              className="h-10 rounded-xl bg-slate-950 px-4 text-xs font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {refreshing ? "새로고침중" : "입금내역 새로고침"}
            </button>

            <button
              type="button"
              onClick={resetFilters}
              className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 hover:bg-slate-50"
            >
              필터 초기화
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-2 xl:grid-cols-[1.2fr_150px_150px_150px_150px_auto]">
          <input
            value={filters.keyword}
            onChange={(event) => updateFilter("keyword", event.target.value)}
            placeholder="입금자명 / 금액 / 메모 검색"
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          />

          <select
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value as DepositStatusFilter)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700"
          >
            <option value="all">상태: 전체보기</option>
            <option value="confirmed">입금확인 완료</option>
            <option value="unmatched">미매칭 입금</option>
            <option value="auto">자동입금확인</option>
            <option value="manual">수동입금확인</option>
          </select>

          <select
            value={filters.date}
            onChange={(event) => updateFilter("date", event.target.value as DepositDateFilter)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700"
          >
            <option value="all">날짜: 전체보기</option>
            <option value="today">오늘</option>
            <option value="yesterday">어제</option>
            <option value="7days">최근 7일</option>
            <option value="month">이번 달</option>
            <option value="custom">직접 선택</option>
          </select>

          {filters.date === "custom" ? (
            <>
              <input
                type="date"
                value={filters.customStartDate}
                onChange={(event) => updateFilter("customStartDate", event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                aria-label="입금 시작일"
              />
              <input
                type="date"
                value={filters.customEndDate}
                onChange={(event) => updateFilter("customEndDate", event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                aria-label="입금 종료일"
              />
            </>
          ) : (
            <div className="hidden xl:block" />
          )}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <div className="grid min-w-[980px] grid-cols-[230px_minmax(160px,1fr)_140px_130px_minmax(180px,1fr)] bg-slate-50 px-4 py-3 text-xs font-black text-slate-500">
            <div>입금일시</div>
            <div>입금자명</div>
            <div className="text-right">입금금액</div>
            <div className="text-center">상태</div>
            <div>메모</div>
          </div>

          {visibleDeposits.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm font-bold text-slate-400">
              조건에 맞는 입금내역이 없습니다.
            </div>
          ) : (
            visibleDeposits.map((deposit, index) => (
              <div
                key={String((deposit as any).id || index)}
                className="grid min-w-[980px] grid-cols-[230px_minmax(160px,1fr)_140px_130px_minmax(180px,1fr)] items-center border-t border-slate-100 px-4 py-3 text-sm"
              >
                <div className="whitespace-nowrap font-black text-slate-700">{formatDepositDateTime(deposit)}</div>
                <div className="truncate font-black text-slate-900">{getDepositName(deposit)}</div>
                <div className="text-right font-black text-slate-900">{money(getDepositAmount(deposit))}</div>
                <div className="text-center">{statusBadge(deposit)}</div>
                <div className="truncate text-xs font-bold text-slate-500">{getDepositMemo(deposit) || "-"}</div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-black leading-5 text-amber-700">
          현재 입금확인 메뉴는 조회/검색/필터/입금내역 새로고침 전용입니다. 자동입금확인, 수동입금확인, 뱅크다 새로고침 실행은 다음 단계에서 별도 검수 후 연결합니다.
        </div>
      </div>
    </section>
  );
}
