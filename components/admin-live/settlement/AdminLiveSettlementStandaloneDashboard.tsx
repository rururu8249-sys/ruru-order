"use client";

import type {
  PaymentFilter,
  SettlementBroadcastOption,
  SettlementBroadcastRow,
  SettlementManualEntry,
  SettlementStats,
} from "@/components/admin-v2/settlement/settlementTypes";
import { won } from "@/components/admin-v2/settlement/settlementUtils";

type QuickRange = "today" | "week" | "month" | "lastMonth" | "year";

type Props = {
  loading: boolean;
  stats: SettlementStats;
  actualCardFeeRate: string;
  startDate: string;
  endDate: string;
  paymentFilter: PaymentFilter;
  broadcastOptions: SettlementBroadcastOption[];
  selectedBroadcastKeys: string[];
  availableYears: string[];
  selectedYear: string;
  selectedMonth: string;
  broadcastRows: SettlementBroadcastRow[];
  manualEntriesInScope: SettlementManualEntry[];
  onQuickRange: (range: QuickRange) => void;
  onYearChange: (year: string) => void;
  onMonthChange: (month: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onPaymentFilterChange: (value: PaymentFilter) => void;
  onSelectedBroadcastKeysChange: (value: string[]) => void;
  onReset: () => void;
  onOpenManualPanel: () => void;
  onExportCsv: () => void;
};

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function countText(value: unknown) {
  return `${numberValue(value).toLocaleString("ko-KR")}건`;
}

function minusWon(value: unknown) {
  const amount = numberValue(value);
  return amount > 0 ? `-${won(amount)}` : "0원";
}

function FlowCard({
  step,
  title,
  value,
  desc,
  tone,
}: {
  step: string;
  title: string;
  value: string;
  desc: string;
  tone: "blue" | "orange" | "dark" | "green";
}) {
  const box =
    tone === "green"
      ? "border-emerald-100 bg-emerald-50"
      : tone === "orange"
        ? "border-orange-100 bg-orange-50"
        : tone === "dark"
          ? "border-slate-200 bg-white"
          : "border-blue-100 bg-blue-50";

  const badge =
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
    <div className={`rounded-[32px] border px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.055)] ${box}`}>
      <div className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-black ${badge}`}>
        {step}
      </div>
      <div className="mt-5 text-sm font-black text-slate-500">{title}</div>
      <div className={`mt-2 text-[30px] font-black tracking-[-0.07em] ${valueClass}`}>{value}</div>
      <div className="mt-2 text-xs font-bold text-slate-400">{desc}</div>
    </div>
  );
}

function TodoBox({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "blue" | "orange" | "slate";
}) {
  const box =
    tone === "orange"
      ? "border-orange-100 bg-orange-50 text-orange-700"
      : tone === "blue"
        ? "border-blue-100 bg-blue-50 text-blue-700"
        : "border-slate-200 bg-slate-50 text-slate-950";

  return (
    <div className={`rounded-[24px] border px-5 py-4 ${box}`}>
      <div className="text-xs font-black text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-black tracking-[-0.05em]">{value}</div>
    </div>
  );
}

export default function AdminLiveSettlementStandaloneDashboard({
  loading,
  stats,
  actualCardFeeRate,
  startDate,
  endDate,
  paymentFilter,
  broadcastOptions,
  selectedBroadcastKeys,
  availableYears,
  selectedYear,
  selectedMonth,
  broadcastRows,
  manualEntriesInScope,
  onQuickRange,
  onYearChange,
  onMonthChange,
  onStartDateChange,
  onEndDateChange,
  onPaymentFilterChange,
  onSelectedBroadcastKeysChange,
  onReset,
  onOpenManualPanel,
  onExportCsv,
}: Props) {
  const selectedBroadcastValue =
    selectedBroadcastKeys.length === 0
      ? "__all__"
      : selectedBroadcastKeys.length === 1
        ? selectedBroadcastKeys[0]
        : "__multiple__";

  const visibleRows = broadcastRows.slice(0, 10);

  const flowCards = [
    {
      step: "1",
      title: "주문서 총금액",
      value: won(stats.totalOrderAmount),
      desc: `${countText(stats.orderCount)} · 고객이 주문서에 담은 총액`,
      tone: "blue" as const,
    },
    {
      step: "2",
      title: "결제완료 매출",
      value: won(stats.paidAmount),
      desc: `${countText(stats.paidCount)} · 실제 결제가 끝난 금액`,
      tone: "blue" as const,
    },
    {
      step: "3",
      title: "아직 못 받은 금액",
      value: won(stats.unpaidAmount),
      desc: "미입금/카드 미결제 · 현재 실수익 제외",
      tone: "orange" as const,
    },
    {
      step: "4",
      title: "빠지는 돈",
      value: minusWon(stats.totalExpense),
      desc: `카드 수수료 ${actualCardFeeRate}% + 창고/기타 지출`,
      tone: "dark" as const,
    },
    {
      step: "5",
      title: "현재 실수익",
      value: won(stats.netAmount),
      desc: "결제완료 매출 + 추가 정산 수익 - 빠지는 돈",
      tone: "green" as const,
    },
  ];

  return (
    <section className="grid gap-5">
      <div className="rounded-[34px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.055)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {[
              ["today", "오늘"],
              ["week", "이번 주"],
              ["month", "이번 달"],
              ["lastMonth", "지난 달"],
              ["year", "올해"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onQuickRange(key as QuickRange)}
                className="h-10 rounded-2xl border border-blue-100 bg-blue-50 px-4 text-sm font-black text-blue-700 transition hover:bg-blue-100"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600">
              <span className="text-xs text-slate-400">연도</span>
              <select
                value={selectedYear}
                onChange={(event) => onYearChange(event.target.value)}
                className="bg-transparent font-black outline-none"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600">
              <span className="text-xs text-slate-400">월</span>
              <select
                value={selectedMonth}
                onChange={(event) => onMonthChange(event.target.value)}
                className="bg-transparent font-black outline-none"
              >
                <option value="all">전체</option>
                {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((month) => (
                  <option key={month} value={month}>
                    {Number(month)}월
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[0.85fr_0.85fr_1.2fr_1fr_auto]">
          <label className="grid gap-1 text-xs font-black text-slate-500">
            시작일
            <input
              type="date"
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none"
            />
          </label>

          <label className="grid gap-1 text-xs font-black text-slate-500">
            종료일
            <input
              type="date"
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none"
            />
          </label>

          <label className="grid gap-1 text-xs font-black text-slate-500">
            방송리스트
            <select
              value={selectedBroadcastValue}
              onChange={(event) => {
                const value = event.target.value;
                onSelectedBroadcastKeysChange(value === "__all__" || value === "__multiple__" ? [] : [value]);
              }}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none"
            >
              <option value="__all__">전체보기</option>
              {selectedBroadcastKeys.length > 1 ? (
                <option value="__multiple__">다중선택 {selectedBroadcastKeys.length.toLocaleString()}개</option>
              ) : null}
              {broadcastOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-black text-slate-500">
            결제수단
            <select
              value={paymentFilter}
              onChange={(event) => onPaymentFilterChange(event.target.value as PaymentFilter)}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none"
            >
              {(["전체", "무통장입금", "카드결제", "기타"] as PaymentFilter[]).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={onReset}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              초기화
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[38px] border border-blue-100 bg-white p-6 shadow-[0_22px_58px_rgba(37,99,235,0.1)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black tracking-[0.25em] text-blue-600">MONEY FLOW</div>
            <h2 className="mt-1 text-[28px] font-black tracking-[-0.06em] text-slate-950">
              돈 흐름 5단계
            </h2>
          </div>
          <div className="rounded-full bg-blue-50 px-4 py-2 text-xs font-black text-blue-700">
            주문 → 받은 돈 → 못 받은 돈 → 빠지는 돈 → 남는 돈
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-5">
          {flowCards.map((card) => (
            <FlowCard key={card.title} {...card} />
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[34px] border border-blue-100 bg-blue-50 p-6 shadow-[0_16px_40px_rgba(37,99,235,0.06)]">
          <div className="text-xs font-black tracking-[0.22em] text-blue-600">ONE LINE SUMMARY</div>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">한 줄 요약</h3>

          <div className="mt-5 grid gap-3 text-sm font-bold leading-6 text-slate-700">
            <p>① 이번 기간 주문서 총금액은 <span className="font-black text-slate-950">{won(stats.totalOrderAmount)}</span>입니다.</p>
            <p>② 그중 결제가 끝난 금액은 <span className="font-black text-blue-700">{won(stats.paidAmount)}</span>입니다.</p>
            <p>③ 아직 못 받은 금액은 <span className="font-black text-orange-700">{won(stats.unpaidAmount)}</span>입니다.</p>
            <p>④ 카드 수수료와 창고/기타 지출을 빼면 현재 실수익은 <span className="font-black text-emerald-700">{won(stats.netAmount)}</span>입니다.</p>
          </div>
        </div>

        <div className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.055)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black tracking-[0.22em] text-blue-600">TO DO</div>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">지금 처리할 일</h3>
            </div>
            <div className="text-xs font-bold text-slate-400">
              방송 끝나고 바로 확인
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <TodoBox title="아직 못 받은 금액 확인" value={won(stats.unpaidAmount)} tone="orange" />
            <TodoBox title="결제완료 매출 확인" value={countText(stats.paidCount)} tone="blue" />
            <TodoBox title="창고/기타 지출 입력" value={countText(stats.manualExpenseCount)} tone="slate" />
            <TodoBox title="추가 정산 수익 확인" value={won(stats.manualIncomeAmount)} tone="blue" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenManualPanel}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
            >
              + 정산 추가 입력
            </button>
            <button
              type="button"
              onClick={onExportCsv}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              정산 CSV 내보내기
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.055)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black tracking-[0.22em] text-blue-600">BROADCAST SETTLEMENT</div>
            <h3 className="mt-1 text-2xl font-black tracking-[-0.05em] text-slate-950">방송별 정산</h3>
            <p className="mt-1 text-xs font-bold text-slate-400">
              방송 날짜별로 얼마 팔고, 아직 못 받은 돈과 현재 남은 돈만 봅니다.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-600">
            {loading ? "불러오는 중" : `총 ${broadcastRows.length.toLocaleString("ko-KR")}개`}
          </div>
        </div>

        <div className="overflow-auto rounded-[24px] border border-slate-100">
          <table className="min-w-[920px] w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50 text-xs font-black text-slate-500">
                <th className="px-4 py-3 text-left">날짜/방송명</th>
                <th className="px-4 py-3 text-right">주문서 수</th>
                <th className="px-4 py-3 text-right">결제완료 매출</th>
                <th className="px-4 py-3 text-right">아직 못 받은 금액</th>
                <th className="px-4 py-3 text-right">빠지는 돈</th>
                <th className="px-4 py-3 text-right">현재 실수익</th>
              </tr>
            </thead>

            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-sm font-bold text-slate-400">
                    {loading ? "정산 데이터를 불러오는 중입니다." : "표시할 방송별 정산 내역이 없습니다."}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.key} className="hover:bg-blue-50/30">
                    <td className="border-b border-slate-100 px-4 py-4">
                      <div className="max-w-[340px] truncate text-sm font-black text-slate-950">{row.label}</div>
                      <div className="mt-1 text-xs font-bold text-slate-400">{row.dateKey}</div>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black text-slate-700">{countText(row.count)}</td>
                    <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black text-blue-700">{won(row.paidAmount)}</td>
                    <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black text-orange-700">{won(row.unpaidAmount)}</td>
                    <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black text-slate-700">{minusWon(row.totalExpense)}</td>
                    <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black text-slate-950">{won(row.netAmount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {broadcastRows.length > visibleRows.length ? (
          <div className="mt-3 text-center text-xs font-bold text-slate-400">
            최근 {visibleRows.length.toLocaleString("ko-KR")}개만 먼저 표시합니다. 전체 내역은 CSV로 확인하세요.
          </div>
        ) : null}
      </div>

      {manualEntriesInScope.length > 0 ? (
        <div className="rounded-[30px] border border-blue-100 bg-white p-5 shadow-[0_14px_35px_rgba(37,99,235,0.055)]">
          <div className="text-xs font-black tracking-[0.22em] text-blue-600">EXTRA SETTLEMENT</div>
          <h3 className="mt-1 text-xl font-black text-slate-950">추가 정산 내역</h3>
          <div className="mt-4 grid gap-2">
            {manualEntriesInScope.slice(0, 5).map((entry) => (
              <div key={String(entry.id || `${entry.entry_date}-${entry.title}`)} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <div className="text-sm font-black text-slate-900">{entry.title || "제목 없음"}</div>
                  <div className="mt-1 text-xs font-bold text-slate-400">{entry.entry_date || "-"} · {entry.entry_type === "income" ? "추가 정산 수익" : "창고/기타 지출"}</div>
                </div>
                <div className={`text-sm font-black ${entry.entry_type === "income" ? "text-blue-700" : "text-slate-900"}`}>
                  {entry.entry_type === "income" ? won(entry.amount) : minusWon(entry.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
