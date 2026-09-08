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
  /** [2026-09-08] 「아직 안 들어온 돈 › 주문 보기」 — 주문·입금 화면의 미입금 주문으로 이동 */
  onGoToUnpaidOrders?: () => void;
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
      className="h-8 rounded-full border border-rose-line bg-surface px-3 text-xs font-black text-rose-deep shadow-sm transition hover:bg-rose-soft"
    >
      {label}
    </button>
  );
}

// [2026-09-08 전면 재설계 · 정산 «돈 계산서»]
//   사장님 지적: 「처음 쓰는 사람도 이해하기 쉽고 직관적이어야 한다」
//   타 플랫폼(Shopify Finances summary, 스마트스토어 정산내역) 공통 규칙 3가지를 그대로 따른다.
//     ① 답(최종 금액)을 맨 위에 크게 하나. ② 그 아래에 «어떻게 그 숫자가 나왔는지» 위→아래 계산서.
//     ③ 손댈 게 있는 줄만 버튼을 준다.
//   예전 화면의 실제 결함:
//     · 「돈 흐름 5단계」가 가로 카드 5개 → 덧셈·뺄셈으로 안 보였다.
//     · 그 5단계에 «추가 정산 수익»이 빠져 있어 ②−④ ≠ ⑤. 계산이 재현되지 않았다(가장 큰 문제).
//     · 「한 줄 요약」·「확인할 금액」이 위 카드의 숫자를 두 번·세 번 반복했다.
//     · 제목 글씨가 29/25/22/20px로 다 달라 뭐가 중요한지 알 수 없었다.
//   ※ 계산식·집계 로직은 손대지 않았다. 화면 표현만 바꾼다.
//      실수익 = 결제완료 매출 + 추가 정산 수익 − 카드 수수료 − 창고/기타 지출 (AdminSettlementPanel CSV와 동일)

function CalcRow({
  sign,
  label,
  hint,
  count,
  amount,
  emphasis,
  action,
}: {
  sign: "" | "+" | "−";
  label: string;
  hint?: string;
  count?: string;
  amount: number;
  emphasis?: "subtotal" | "total";
  action?: { label: string; onClick: () => void };
}) {
  const zero = numberValue(amount) === 0;
  const amountTx =
    emphasis === "total"
      ? "text-ok-tx"
      : sign === "−"
        ? zero ? "text-ink-mute" : "text-warn-tx"
        : zero ? "text-ink-mute" : "text-ink";

  return (
    <div
      className={[
        "flex flex-wrap items-center gap-x-3 gap-y-1 px-4",
        emphasis === "total" ? "border-t-2 border-ink/15 bg-ok-bg/40 py-4" : emphasis === "subtotal" ? "border-t border-line bg-surface-2 py-3" : "py-2.5",
      ].join(" ")}
    >
      <span className={`w-4 shrink-0 text-center text-base font-black ${sign === "−" ? "text-warn-tx" : sign === "+" ? "text-ink-soft" : "text-ink-mute"}`}>
        {emphasis ? "=" : sign}
      </span>

      <span className="min-w-0 flex-1">
        <span className={emphasis === "total" ? "text-[14px] font-black text-ink" : "text-sm font-black text-ink"}>{label}</span>
        {hint ? <span className="ml-2 text-xs font-bold text-ink-mute">{hint}</span> : null}
      </span>

      {count ? <span className="shrink-0 text-xs font-bold tabular-nums text-ink-mute">{count}</span> : null}

      <span
        className={[
          "shrink-0 text-right tabular-nums",
          emphasis === "total" ? "text-[24px] font-black tracking-[-0.04em]" : "text-[14px] font-black",
          amountTx,
        ].join(" ")}
        style={{ minWidth: emphasis === "total" ? 200 : 150 }}
      >
        {sign === "−" && !zero ? "−" : ""}{won(Math.abs(numberValue(amount)))}
      </span>

      <span className="w-[86px] shrink-0 text-right">
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-black text-ink-soft transition hover:bg-surface-2"
          >
            {action.label} ›
          </button>
        ) : null}
      </span>
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
  onGoToUnpaidOrders,
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

  return (
    <div className="grid gap-3">
      <section className="overflow-hidden rounded-2xl border border-rose-line bg-surface shadow-sm">
        <div className="border-b border-rose-line bg-gradient-to-r from-rose-soft via-surface to-surface px-5 py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-black tracking-[-0.03em] text-ink">얼마 남았는지 보기</h2>
              <p className="mt-0.5 text-xs font-bold text-ink-mute">
                아래 계산서는 여기서 고른 기간·방송만 계산합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onOpenManualPanel}
                className="h-9 rounded-xl bg-rose-deep px-4 text-sm font-black text-white shadow-sm transition hover:opacity-90 active:scale-[0.99]"
              >
                + 정산 추가 입력
              </button>
              <button
                type="button"
                onClick={onExportSummaryCsv}
                className="h-9 rounded-xl border border-line bg-surface px-4 text-sm font-black text-ink-soft shadow-sm transition hover:bg-surface-2"
              >
                엑셀(CSV) 받기
              </button>
            </div>
          </div>
        </div>

        {/* [2026-09-08 사장님 지적] 필터가 11개라 뭘 눌러야 할지 모르겠던 화면.
            → 평소 쓰는 «기간 + 방송» 만 위에 두고, 나머지(날짜 직접입력·연·월·결제수단)는 「자세한 조건」 안으로. 계산 기준·로직 무변경. */}
        <div className="grid gap-2.5 px-5 py-3.5">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-wrap gap-2">
              <CompactFilterButton label="오늘" onClick={() => onQuickRange("today")} />
              <CompactFilterButton label="이번 주" onClick={() => onQuickRange("week")} />
              <CompactFilterButton label="이번 달" onClick={() => onQuickRange("month")} />
              <CompactFilterButton label="지난 달" onClick={() => onQuickRange("lastMonth")} />
              <CompactFilterButton label="올해" onClick={() => onQuickRange("year")} />
            </div>

            <label className="grid min-w-[220px] flex-1 gap-1 text-[11px] font-black text-ink-mute">
              방송
              <select
                value={selectedBroadcastValue}
                onChange={(event) => {
                  const value = event.target.value;
                  onSelectedBroadcastKeysChange(value === "__all__" || value === "__multiple__" ? [] : [value]);
                }}
                className="h-9 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none"
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

            <div className="flex h-9 items-center rounded-xl border border-line bg-info-bg px-3 text-sm font-black text-info-tx">
              {effectivePeriodLabel}
            </div>

            <button
              type="button"
              onClick={onResetFilters}
              className="h-9 rounded-xl border border-line bg-surface px-4 text-sm font-black text-ink-soft shadow-sm transition hover:bg-surface-2"
            >
              초기화
            </button>
          </div>

          <details className="rounded-xl border border-line bg-surface-2 px-3 py-2">
            <summary className="cursor-pointer list-none text-xs font-black text-ink-soft">자세한 조건 (날짜 직접 입력 · 결제수단) ▾</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              <label className="grid gap-1 text-[11px] font-black text-ink-mute">
                시작일
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => onStartDateChange(event.target.value)}
                  className="h-9 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none"
                />
              </label>

              <label className="grid gap-1 text-[11px] font-black text-ink-mute">
                종료일
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => onEndDateChange(event.target.value)}
                  className="h-9 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none"
                />
              </label>

              <label className="grid gap-1 text-[11px] font-black text-ink-mute">
                연도
                <select
                  value={selectedSettlementYear}
                  onChange={(event) => onYearFilter(event.target.value)}
                  className="h-9 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none"
                >
                  {availableSettlementYears.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-[11px] font-black text-ink-mute">
                월
                <select
                  value={selectedSettlementMonth}
                  onChange={(event) => onMonthFilter(event.target.value)}
                  className="h-9 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none"
                >
                  <option value="all">전체</option>
                  {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((month) => (
                    <option key={month} value={month}>{Number(month)}월</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-[11px] font-black text-ink-mute">
                결제수단
                <select
                  value={paymentFilter}
                  onChange={(event) => onPaymentFilterChange(event.target.value as PaymentFilter)}
                  className="h-9 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none"
                >
                  {(["전체", "무통장입금", "카드결제", "기타"] as PaymentFilter[]).map((value) => (
                    <option key={value} value={value}>{({ 전체: "전체", 무통장입금: "무통장", 카드결제: "카드", 기타: "기타(미지정)" } as Record<string, string>)[value] ?? value}</option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        </div>
      </section>

      {/* ══ 답 먼저: 지금 남는 돈 ══ */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line bg-surface-2 px-5 py-4">
          <div className="min-w-0">
            <div className="text-sm font-black text-ink-soft">지금 남는 돈</div>
            <div className="mt-0.5 text-[36px] font-black leading-none tracking-[-0.05em] text-ok-tx">
              {won(stats.netAmount)}
            </div>
            <div className="mt-2 text-xs font-bold text-ink-mute">
              받은 돈 {won(stats.paidAmount)}
              {numberValue(stats.manualIncomeAmount) > 0 ? ` + 추가수익 ${won(stats.manualIncomeAmount)}` : ""}
              {" − 빠지는 돈 "}{won(stats.totalExpense)}
            </div>
          </div>

          {numberValue(stats.unpaidAmount) > 0 ? (
            <div className="rounded-xl border border-warn-tx/35 bg-warn-bg px-4 py-2.5">
              <div className="text-xs font-black text-warn-tx">아직 안 들어온 돈</div>
              <div className="mt-0.5 text-xl font-black tabular-nums text-warn-tx">{won(stats.unpaidAmount)}</div>
              <div className="mt-0.5 text-[11px] font-bold text-warn-tx/80">이 돈은 위 금액에 안 들어있습니다</div>
            </div>
          ) : (
            <div className="rounded-xl border border-ok-tx/30 bg-ok-bg px-4 py-2.5 text-xs font-black text-ok-tx">
              ✓ 이 기간 미수금 없음
            </div>
          )}
        </div>

        {/* ══ 어떻게 이 숫자가 나왔는지 — 위에서 아래로 읽는 계산서 ══ */}
        <div className="border-b border-line px-5 py-2.5">
          <div className="text-sm font-black text-ink">어떻게 계산됐나요?</div>
          <div className="mt-0.5 text-xs font-bold text-ink-mute">위에서 아래로 한 줄씩 더하고 빼면 맨 아래 숫자가 나옵니다.</div>
        </div>

        {/* ⚠ 이 4줄은 settlementUtils.ts:385 의 식과 «글자 그대로» 같아야 한다.
              netAmount = paidAmount + manualIncomeAmount − (actualCardFee + warehouseOtherExpense)
            «주문서 총금액(totalOrderAmount)»은 :362 에서 이미 추가 정산 수익을 더한 값이라
            여기 계산줄에 넣으면 추가수익이 두 번 계산된다 → 계산줄에서 뺐다. 참고 숫자는 아래 회색 줄로만. */}
        <div className="divide-y divide-line-soft">
          <CalcRow
            sign=""
            label="실제로 받은 돈"
            hint="결제완료된 주문만"
            count={countText(stats.paidCount)}
            amount={stats.paidAmount}
          />
          <CalcRow
            sign="+"
            label="추가 정산 수익"
            hint="주문서 밖 입금"
            count={countText(stats.manualIncomeCount)}
            amount={stats.manualIncomeAmount}
            action={{ label: "입력", onClick: onOpenManualPanel }}
          />
          <CalcRow
            sign="−"
            label="카드 수수료"
            hint={`카드 결제분의 ${actualCardFeeRate}%`}
            amount={stats.actualCardFee}
          />
          <CalcRow
            sign="−"
            label="창고·기타 지출"
            hint="택배비·알바비 등 직접 입력"
            count={countText(stats.manualExpenseCount)}
            amount={stats.warehouseOtherExpense}
            action={{ label: "입력", onClick: onOpenManualPanel }}
          />
          <CalcRow sign="" label="지금 남는 돈" amount={stats.netAmount} emphasis="total" />
        </div>

        <div className="grid gap-1 border-t border-line bg-surface-2 px-5 py-3 text-[11px] font-bold leading-5 text-ink-mute">
          <div className="flex flex-wrap items-center gap-x-2">
            <span>참고 · 주문서 총금액(추가 수익 포함)</span>
            <span className="font-black tabular-nums text-ink-soft">{won(stats.totalOrderAmount)}</span>
            <span>· 주문 {countText(stats.orderCount)}</span>
            {numberValue(stats.unpaidAmount) > 0 && onGoToUnpaidOrders ? (
              <button
                type="button"
                onClick={onGoToUnpaidOrders}
                className="rounded-lg border border-warn-tx/35 bg-warn-bg px-2 py-0.5 text-[11px] font-black text-warn-tx transition hover:opacity-90"
              >
                안 들어온 돈 {won(stats.unpaidAmount)} 주문 보기 ›
              </button>
            ) : null}
          </div>
          <div>· 「아직 안 들어온 돈」은 위 계산에 들어있지 않습니다. 입금되면 「실제로 받은 돈」으로 올라갑니다.</div>
          <div>· 카드 수수료는 카드 결제완료 금액에만 붙습니다(무통장 입금은 수수료 없음).</div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-black tracking-[-0.03em] text-ink">방송별로 보기</h3>
            <p className="mt-1 text-xs font-bold text-ink-mute">
              방송 날짜별로 얼마 팔고, 아직 못 받은 돈과 현재 남은 돈만 봅니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="ru-badge ru-badge-mute px-3 py-1.5">
              총 {broadcastRows.length.toLocaleString("ko-KR")}개{broadcastPageCount <= 1 ? " · 전부 표시 중" : ""}
            </div>
            {/* 한 페이지에 다 들어가면 「몇 개 보기」는 눌러도 아무 변화가 없다 → 아예 감춘다 */}
            {broadcastRows.length > 10 ? (
              <select
                value={broadcastPageSize}
                onChange={(event) => {
                  setBroadcastPageSize(Number(event.target.value));
                  setBroadcastCurrentPage(1);
                }}
                className="ru-select ru-input-sm"
              >
                <option value={10}>10개씩</option>
                <option value={20}>20개씩</option>
                <option value={30}>30개씩</option>
              </select>
            ) : null}
          </div>
        </div>

        <div className="overflow-auto rounded-xl border border-line-soft bg-surface">
          <table className="min-w-[920px] w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-surface-3 text-xs font-black text-ink-soft">
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
                  <td colSpan={6} className="px-4 py-12 text-center text-sm font-bold text-ink-mute">
                    표시할 방송별 정산 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                visibleBroadcastRows.map((row) => (
                  <tr key={row.key} className="hover:bg-surface-2">
                    <td className="border-b border-line-soft px-4 py-3.5">
                      <div className="max-w-[320px] truncate text-sm font-black text-ink">{row.label}</div>
                      <div className="mt-1 text-xs font-bold text-ink-mute">{row.dateKey}</div>
                    </td>
                    <td className="border-b border-line-soft px-4 py-3.5 text-right text-sm font-black text-ink">{countText(row.count)}</td>
                    <td className="border-b border-line-soft px-4 py-3.5 text-right text-sm font-black text-info-tx">{won(row.paidAmount)}</td>
                    <td className="border-b border-line-soft px-4 py-3.5 text-right text-sm font-black text-warn-tx">{won(row.unpaidAmount)}</td>
                    <td className="border-b border-line-soft px-4 py-3.5 text-right text-sm font-black text-ink">{outflowText(row.totalExpense)}</td>
                    <td className="border-b border-line-soft px-4 py-3.5 text-right text-sm font-black text-ink">{won(row.netAmount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {broadcastPageCount > 1 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
          <div className="text-xs font-bold text-ink-mute">
            {`${(broadcastStartIndex + 1).toLocaleString("ko-KR")}-${Math.min(broadcastEndIndex, broadcastRows.length).toLocaleString("ko-KR")} / ${broadcastRows.length.toLocaleString("ko-KR")}개`}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBroadcastCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safeBroadcastPage <= 1}
              className="h-9 min-w-9 rounded-full border border-line bg-surface px-3 text-sm font-black text-ink-soft shadow-sm transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-35"
            >
              &lt;
            </button>

            {broadcastPaginationPages.map((pageItem, index) =>
              pageItem === "ellipsis" ? (
                <span key={`broadcast-ellipsis-${index}`} className="px-1 text-sm font-black text-ink-mute">
                  ...
                </span>
              ) : (
                <button
                  key={pageItem}
                  type="button"
                  onClick={() => setBroadcastCurrentPage(pageItem)}
                  className={`h-9 min-w-9 rounded-full px-3 text-sm font-black shadow-sm transition ${
                    pageItem === safeBroadcastPage
                      ? "bg-rose-deep text-white"
                      : "border border-line bg-surface text-ink-soft hover:bg-surface-2"
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
              className="h-9 min-w-9 rounded-full border border-line bg-surface px-3 text-sm font-black text-ink-soft shadow-sm transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-35"
            >
              &gt;
            </button>
          </div>
        </div>
        ) : null}
      </section>
    </div>
  );
}
