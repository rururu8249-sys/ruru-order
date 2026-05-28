"use client";

import { useMemo, useState } from "react";
import type {
  PaymentFilter,
  SettlementBroadcastEndReport,
  SettlementBroadcastOption,
  SettlementBroadcastRow,
  SettlementStats,
} from "./settlementTypes";
import { won } from "./settlementUtils";

type Props = {
  stats: SettlementStats;
  actualCardFeeRate: string;
  startDate: string;
  endDate: string;
  paymentFilter: PaymentFilter;
  broadcastOptions: SettlementBroadcastOption[];
  selectedBroadcastKeys: string[];
  broadcastRows: SettlementBroadcastRow[];
  trend: unknown;
  effectivePeriodLabel: string;
  broadcastEndReportsInScope: SettlementBroadcastEndReport[];
  broadcastEndReportsLoading: boolean;
  broadcastEndReportsReady: boolean;
  settlementDetailOpen: boolean;
  availableSettlementYears: string[];
  selectedSettlementYear: string;
  selectedSettlementMonth: string;
  onOpenManualPanel: () => void;
  onExportSummaryCsv: () => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onPaymentFilterChange: (value: PaymentFilter) => void;
  onSelectedBroadcastKeysChange: (value: string[]) => void;
  onResetFilters: () => void;
  onQuickRange: (range: string) => void;
  onYearFilter: (year: string) => void;
  onMonthFilter: (month: string) => void;
  onToggleSettlementDetail: () => void;
};

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function countText(value: unknown) {
  return `${numberValue(value).toLocaleString("ko-KR")}건`;
}

function outflowText(value: unknown) {
  const amount = numberValue(value);
  return amount > 0 ? `-${won(amount)}` : "0원";
}

function getVisiblePages(currentPage: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(pageCount - 1, currentPage + 1);

  if (start > 2) pages.push("ellipsis");

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  if (end < pageCount - 1) pages.push("ellipsis");

  pages.push(pageCount);
  return pages;
}

function CompactFilterButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-full border border-blue-100 bg-white px-3 text-xs font-black text-blue-700 shadow-[0_6px_16px_rgba(37,99,235,0.06)] transition hover:bg-blue-50"
    >
      {label}
    </button>
  );
}

function MoneyFlowCard({
  step,
  title,
  value,
  note,
  tone,
}: {
  step: string;
  title: string;
  value: string;
  note: string;
  tone: "blue" | "orange" | "dark" | "green";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-100 bg-emerald-50/80"
      : tone === "orange"
        ? "border-orange-100 bg-orange-50/80"
        : tone === "dark"
          ? "border-slate-200 bg-white"
          : "border-blue-100 bg-blue-50/80";

  const stepClass =
    tone === "green"
      ? "bg-emerald-600 text-white"
      : tone === "orange"
        ? "bg-orange-500 text-white"
        : tone === "dark"
          ? "bg-slate-900 text-white"
          : "bg-blue-600 text-white";

  const valueClass =
    tone === "green"
      ? "text-emerald-700"
      : tone === "orange"
        ? "text-orange-700"
        : tone === "blue"
          ? "text-blue-700"
          : "text-slate-950";

  return (
    <div className={`rounded-[22px] border px-4 py-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`flex h-8 min-w-8 items-center justify-center rounded-full px-3 text-xs font-black ${stepClass}`}>
          {step}
        </span>
        <span className="truncate text-xs font-black text-slate-400">{note}</span>
      </div>
      <div className="mt-3 text-sm font-black text-slate-500">{title}</div>
      <div className={`mt-1 truncate text-[25px] font-black tracking-[-0.06em] ${valueClass}`}>{value}</div>
    </div>
  );
}

function ActionCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "orange" | "slate";
}) {
  const toneClass =
    tone === "orange"
      ? "border-orange-100 bg-orange-50/75 text-orange-700"
      : tone === "blue"
        ? "border-blue-100 bg-blue-50/75 text-blue-700"
        : "border-slate-200 bg-slate-50 text-slate-950";

  return (
    <div className={`rounded-[18px] border px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.025)] ${toneClass}`}>
      <div className="text-xs font-black text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black tracking-[-0.05em]">{value}</div>
    </div>
  );
}

export default function SettlementMoneyFlowDashboard({
  stats,
  actualCardFeeRate,
  startDate,
  endDate,
  paymentFilter,
  broadcastOptions,
  selectedBroadcastKeys,
  broadcastRows,
  trend,
  effectivePeriodLabel,
  broadcastEndReportsInScope,
  broadcastEndReportsLoading,
  broadcastEndReportsReady,
  settlementDetailOpen,
  availableSettlementYears,
  selectedSettlementYear,
  selectedSettlementMonth,
  onOpenManualPanel,
  onExportSummaryCsv,
  onStartDateChange,
  onEndDateChange,
  onPaymentFilterChange,
  onSelectedBroadcastKeysChange,
  onResetFilters,
  onQuickRange,
  onYearFilter,
  onMonthFilter,
  onToggleSettlementDetail,
}: Props) {
  void trend;
  void effectivePeriodLabel;
  void broadcastEndReportsInScope;
  void broadcastEndReportsLoading;
  void broadcastEndReportsReady;
  void settlementDetailOpen;
  void onToggleSettlementDetail;

  const selectedBroadcastValue =
    selectedBroadcastKeys.length === 0
      ? "__all__"
      : selectedBroadcastKeys.length === 1
        ? selectedBroadcastKeys[0]
        : "__multiple__";

  const [broadcastPageSize, setBroadcastPageSize] = useState(10);
  const [broadcastCurrentPage, setBroadcastCurrentPage] = useState(1);
  const broadcastPageCount = Math.max(1, Math.ceil(broadcastRows.length / broadcastPageSize));
  const safeBroadcastPage = Math.min(Math.max(1, broadcastCurrentPage), broadcastPageCount);
  const broadcastStartIndex = (safeBroadcastPage - 1) * broadcastPageSize;
  const broadcastEndIndex = broadcastStartIndex + broadcastPageSize;
  const visibleBroadcastRows = useMemo(
    () => broadcastRows.slice(broadcastStartIndex, broadcastEndIndex),
    [broadcastRows, broadcastStartIndex, broadcastEndIndex],
  );
  const broadcastPaginationPages = useMemo(
    () => getVisiblePages(safeBroadcastPage, broadcastPageCount),
    [safeBroadcastPage, broadcastPageCount],
  );

  const moneyFlowCards = [
    {
      step: "1",
      title: "주문서 총금액",
      value: won(stats.totalOrderAmount),
      note: countText(stats.orderCount),
      tone: "blue" as const,
    },
    {
      step: "2",
      title: "결제완료 매출",
      value: won(stats.paidAmount),
      note: countText(stats.paidCount),
      tone: "blue" as const,
    },
    {
      step: "3",
      title: "아직 못 받은 금액",
      value: won(stats.unpaidAmount),
      note: "현재 실수익 계산 제외",
      tone: "orange" as const,
    },
    {
      step: "4",
      title: "빠지는 돈",
      value: outflowText(stats.totalExpense),
      note: `카드 수수료 ${actualCardFeeRate}% + 창고/기타 지출`,
      tone: "dark" as const,
    },
    {
      step: "5",
      title: "현재 실수익",
      value: won(stats.netAmount),
      note: "실제로 남는 돈",
      tone: "green" as const,
    },
  ];

  return (
    <div className="grid gap-3">
      <section className="overflow-hidden rounded-[30px] border border-blue-100 bg-white shadow-[0_14px_36px_rgba(37,99,235,0.07)]">
        <div className="border-b border-blue-50 bg-gradient-to-r from-blue-50 via-white to-white px-5 py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[29px] font-black tracking-[-0.06em] text-slate-950">정산통계</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                방송 정산에서 꼭 봐야 할 금액만 먼저 정리했습니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onOpenManualPanel}
                className="h-9 rounded-full bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
              >
                + 정산 추가 입력
              </button>
              <button
                type="button"
                onClick={onExportSummaryCsv}
                className="h-9 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                정산 CSV 내보내기
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-2.5 px-5 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <CompactFilterButton label="오늘" onClick={() => onQuickRange("today")} />
              <CompactFilterButton label="이번 주" onClick={() => onQuickRange("week")} />
              <CompactFilterButton label="이번 달" onClick={() => onQuickRange("month")} />
              <CompactFilterButton label="지난 달" onClick={() => onQuickRange("lastMonth")} />
              <CompactFilterButton label="올해" onClick={() => onQuickRange("year")} />
            </div>

            <div className="flex flex-wrap gap-2">
              <label className="flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-600">
                <span className="text-slate-400">연도</span>
                <select
                  value={selectedSettlementYear}
                  onChange={(event) => onYearFilter(event.target.value)}
                  className="bg-transparent font-black outline-none"
                >
                  {availableSettlementYears.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>

              <label className="flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-600">
                <span className="text-slate-400">월</span>
                <select
                  value={selectedSettlementMonth}
                  onChange={(event) => onMonthFilter(event.target.value)}
                  className="bg-transparent font-black outline-none"
                >
                  <option value="all">전체</option>
                  {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((month) => (
                    <option key={month} value={month}>{Number(month)}월</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="grid gap-2 xl:grid-cols-[0.8fr_0.8fr_1.25fr_0.95fr_1fr_auto]">
            <label className="grid gap-1 text-[11px] font-black text-slate-400">
              시작일
              <input
                type="date"
                value={startDate}
                onChange={(event) => onStartDateChange(event.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none"
              />
            </label>

            <label className="grid gap-1 text-[11px] font-black text-slate-400">
              종료일
              <input
                type="date"
                value={endDate}
                onChange={(event) => onEndDateChange(event.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none"
              />
            </label>

            <label className="grid gap-1 text-[11px] font-black text-slate-400">
              방송리스트
              <select
                value={selectedBroadcastValue}
                onChange={(event) => {
                  const value = event.target.value;
                  onSelectedBroadcastKeysChange(value === "__all__" || value === "__multiple__" ? [] : [value]);
                }}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none"
              >
                <option value="__all__">전체보기</option>
                {selectedBroadcastKeys.length > 1 ? (
                  <option value="__multiple__">다중선택 {selectedBroadcastKeys.length.toLocaleString()}개</option>
                ) : null}
                {broadcastOptions.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-[11px] font-black text-slate-400">
              결제수단
              <select
                value={paymentFilter}
                onChange={(event) => onPaymentFilterChange(event.target.value as PaymentFilter)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none"
              >
                {(["전체", "무통장입금", "카드결제", "기타"] as PaymentFilter[]).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <div className="grid gap-1 text-[11px] font-black text-slate-400">
              조회 기준
              <div className="flex h-9 items-center rounded-xl border border-blue-100 bg-blue-50/70 px-3 text-sm font-black text-blue-700">
                {effectivePeriodLabel}
              </div>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={onResetFilters}
                className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[30px] border border-blue-100 bg-white p-4 shadow-[0_14px_34px_rgba(37,99,235,0.07)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[25px] font-black tracking-[-0.06em] text-slate-950">돈 흐름 5단계</h3>
            <p className="mt-1 text-xs font-bold text-slate-400">초보자는 이 순서만 보면 됩니다.</p>
          </div>
          <div className="rounded-full bg-blue-50 px-3.5 py-1.5 text-xs font-black text-blue-700">
            주문 → 받은 돈 → 빠지는 돈 → 남는 돈
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-5">
          {moneyFlowCards.map((card) => (
            <MoneyFlowCard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-50/80 via-white to-white p-5 shadow-[0_12px_30px_rgba(37,99,235,0.055)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[22px] font-black tracking-[-0.04em] text-slate-950">한 줄 요약</h3>
              <p className="mt-1 text-sm font-black text-blue-700">이번 기간 돈 흐름을 문장으로 정리했습니다.</p>
            </div>
            <div className="rounded-full bg-white px-4 py-2 text-sm font-black text-blue-700 shadow-sm">
              현재 실수익 {won(stats.netAmount)}
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 text-[15px] font-bold leading-7 text-slate-800">
            <p>① 주문서 총금액은 <span className="font-black text-slate-950">{won(stats.totalOrderAmount)}</span>입니다.</p>
            <p>② 결제완료 매출은 <span className="font-black text-blue-700">{won(stats.paidAmount)}</span>입니다.</p>
            <p>③ 아직 못 받은 금액은 <span className="font-black text-orange-700">{won(stats.unpaidAmount)}</span>입니다.</p>
            <p>④ 빠지는 돈을 빼면 현재 실수익은 <span className="font-black text-emerald-700">{won(stats.netAmount)}</span>입니다.</p>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black tracking-[-0.05em] text-slate-950">지금 처리할 일</h3>
              <p className="mt-1 text-xs font-bold text-slate-400">방송 끝나고 바로 확인</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ActionCard label="아직 못 받은 금액 확인" value={won(stats.unpaidAmount)} tone="orange" />
            <ActionCard label="결제완료 매출 확인" value={countText(stats.paidCount)} tone="blue" />
            <ActionCard label="창고/기타 지출 입력" value={countText(stats.manualExpenseCount)} tone="slate" />
            <ActionCard label="추가 정산 수익 확인" value={won(stats.manualIncomeAmount)} tone="blue" />
          </div>
        </div>
      </section>

      <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black tracking-[-0.05em] text-slate-950">방송별 정산</h3>
            <p className="mt-1 text-xs font-bold text-slate-400">
              방송 날짜별로 얼마 팔고, 아직 못 받은 돈과 현재 남은 돈만 봅니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600">
              총 {broadcastRows.length.toLocaleString("ko-KR")}개
            </div>
            <select
              value={broadcastPageSize}
              onChange={(event) => {
                setBroadcastPageSize(Number(event.target.value));
                setBroadcastCurrentPage(1);
              }}
              className="h-10 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 outline-none"
            >
              <option value={10}>10개 보기</option>
              <option value={20}>20개 보기</option>
              <option value={30}>30개 보기</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto rounded-[22px] border border-slate-100 bg-white">
          <table className="min-w-[920px] w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-blue-50/55 text-xs font-black text-slate-500">
                <th className="px-4 py-2.5 text-left">날짜/방송명</th>
                <th className="px-4 py-2.5 text-right">주문서 수</th>
                <th className="px-4 py-2.5 text-right">결제완료 매출</th>
                <th className="px-4 py-2.5 text-right">아직 못 받은 금액</th>
                <th className="px-4 py-2.5 text-right">빠지는 돈</th>
                <th className="px-4 py-2.5 text-right">현재 실수익</th>
              </tr>
            </thead>
            <tbody>
              {visibleBroadcastRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm font-bold text-slate-400">
                    표시할 방송별 정산 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                visibleBroadcastRows.map((row) => (
                  <tr key={row.key} className="hover:bg-blue-50/30">
                    <td className="border-b border-slate-100 px-4 py-3.5">
                      <div className="max-w-[320px] truncate text-sm font-black text-slate-950">{row.label}</div>
                      <div className="mt-1 text-xs font-bold text-slate-400">{row.dateKey}</div>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3.5 text-right text-sm font-black text-slate-700">{countText(row.count)}</td>
                    <td className="border-b border-slate-100 px-4 py-3.5 text-right text-sm font-black text-blue-700">{won(row.paidAmount)}</td>
                    <td className="border-b border-slate-100 px-4 py-3.5 text-right text-sm font-black text-orange-700">{won(row.unpaidAmount)}</td>
                    <td className="border-b border-slate-100 px-4 py-3.5 text-right text-sm font-black text-slate-700">{outflowText(row.totalExpense)}</td>
                    <td className="border-b border-slate-100 px-4 py-3.5 text-right text-sm font-black text-slate-950">{won(row.netAmount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="text-xs font-bold text-slate-400">
            {broadcastRows.length === 0
              ? "0개"
              : `${(broadcastStartIndex + 1).toLocaleString("ko-KR")}-${Math.min(broadcastEndIndex, broadcastRows.length).toLocaleString("ko-KR")} / ${broadcastRows.length.toLocaleString("ko-KR")}개`}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBroadcastCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safeBroadcastPage <= 1}
              className="h-9 min-w-9 rounded-full border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
            >
              &lt;
            </button>

            {broadcastPaginationPages.map((pageItem, index) =>
              pageItem === "ellipsis" ? (
                <span key={`broadcast-ellipsis-${index}`} className="px-1 text-sm font-black text-slate-300">
                  ...
                </span>
              ) : (
                <button
                  key={pageItem}
                  type="button"
                  onClick={() => setBroadcastCurrentPage(pageItem)}
                  className={`h-9 min-w-9 rounded-full px-3 text-sm font-black shadow-sm transition ${
                    pageItem === safeBroadcastPage
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-blue-50"
                  }`}
                >
                  {pageItem}
                </button>
              ),
            )}

            <button
              type="button"
              onClick={() => setBroadcastCurrentPage((page) => Math.min(broadcastPageCount, page + 1))}
              disabled={safeBroadcastPage >= broadcastPageCount}
              className="h-9 min-w-9 rounded-full border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
            >
              &gt;
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
