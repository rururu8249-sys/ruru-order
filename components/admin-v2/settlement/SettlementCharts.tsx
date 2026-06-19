"use client";

import { useMemo, useState } from "react";
import type { SettlementStats } from "./settlementTypes";
import { toNumber, won } from "./settlementUtils";
import SettlementRankModal from "./SettlementRankModal";

type TrendRow = {
  dateKey: string;
  sales: number;
  fee: number;
  expense: number;
  net: number;
  bank?: number;
  card?: number;
  manualIncome?: number;
  warehouseOtherExpense?: number;
  unpaid?: number;
  orderCount?: number;
  paidCount?: number;
  totalExpense?: number;
};

type BroadcastRankRow = {
  label: string;
  dateKey: string;
  count: number;
  paidAmount: number;
  bankAmount: number;
  cardAmount: number;
  manualIncomeAmount: number;
  actualCardFee: number;
  warehouseOtherExpense: number;
  netAmount: number;
};

type RankTab = "sales" | "expense";

function shortDateLabel(value: string) {
  const [, monthText, dayText] = String(value || "").split("-");
  const month = Number(monthText);
  const day = Number(dayText);

  if (!month || !day) return value || "-";

  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

function fullDateLabel(value: string) {
  const [yearText, monthText, dayText] = String(value || "").split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) return value || "날짜없음";

  const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const date = new Date(year, month - 1, day);
  const weekday = Number.isFinite(date.getTime()) ? weekdayNames[date.getDay()] : "";

  return `${year}년 ${month}월 ${day}일${weekday ? `(${weekday})` : ""}`;
}

function broadcastNameFromLabel(row: BroadcastRankRow) {
  const label = String(row.label || "").trim();

  if (!label) return "방송없음";

  const parts = label
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);

  const last = parts.length > 1 ? parts[parts.length - 1] : label;

  if (!last || /^\d/.test(last) || last === row.dateKey) return "방송없음";

  return last;
}

function rankTitle(row: BroadcastRankRow) {
  return `${fullDateLabel(row.dateKey)} · ${broadcastNameFromLabel(row)}`;
}

function percent(value: number, max: number) {
  if (!max) return 0;

  return Math.max(4, Math.min(100, Math.round((toNumber(value) / max) * 100)));
}

function rankAmount(row: BroadcastRankRow) {
  return toNumber(row.paidAmount) + toNumber(row.manualIncomeAmount);
}

function expenseAmount(row: BroadcastRankRow) {
  return toNumber(row.actualCardFee) + toNumber(row.warehouseOtherExpense);
}

function expenseMainLabel(row: BroadcastRankRow) {
  const cardFee = toNumber(row.actualCardFee);
  const warehouseExpense = toNumber(row.warehouseOtherExpense);

  if (warehouseExpense <= 0 && cardFee <= 0) return "지출 없음";
  if (warehouseExpense >= cardFee) return "창고/기타 지출";

  return "카드 수수료";
}

function makeRankItems(rows: BroadcastRankRow[], rankTab: RankTab) {
  return rows.map((row, index) => {
    const isSales = rankTab === "sales";
    const amount = isSales ? rankAmount(row) : expenseAmount(row);
    const subLabel = isSales
      ? `주문 ${toNumber(row.count).toLocaleString()}건 · 무통장 ${won(row.bankAmount)} · 카드 ${won(row.cardAmount)}`
      : `${expenseMainLabel(row)} · 카드 수수료 ${won(row.actualCardFee)} · 창고/기타 지출 ${won(row.warehouseOtherExpense)}`;

    return {
      id: `${rankTab}-${row.dateKey}-${row.label}-${index}`,
      rank: index + 1,
      title: rankTitle(row),
      amountText: won(amount),
      subLabel,
    };
  });
}

export default function SettlementCharts({
  trend,
  stats,
  broadcastRows,
  periodLabel,
}: {
  trend: TrendRow[];
  stats: SettlementStats;
  broadcastRows: BroadcastRankRow[];
  periodLabel: string;
}) {
  const trendRows = useMemo(() => {
    return Array.isArray(trend) ? trend.slice(-14) : [];
  }, [trend]);

  const salesTopRows = useMemo(() => {
    return [...(broadcastRows || [])]
      .filter((row) => rankAmount(row) > 0)
      .sort((a, b) => rankAmount(b) - rankAmount(a));
  }, [broadcastRows]);

  const expenseTopRows = useMemo(() => {
    return [...(broadcastRows || [])]
      .filter((row) => expenseAmount(row) > 0)
      .sort((a, b) => expenseAmount(b) - expenseAmount(a));
  }, [broadcastRows]);

  const [activeTrend, setActiveTrend] = useState<TrendRow | null>(null);
  const [rankTab, setRankTab] = useState<RankTab>("sales");
  const [rankModalOpen, setRankModalOpen] = useState(false);

  const selectedTrend = activeTrend || (trendRows.length === 1 ? trendRows[0] : null);
  const selectedTotalExpense = selectedTrend
    ? toNumber(selectedTrend.totalExpense ?? toNumber(selectedTrend.fee) + toNumber(selectedTrend.expense))
    : 0;

  const maxTrend = Math.max(
    ...trendRows.map((item) =>
      Math.max(
        toNumber(item.sales),
        toNumber(item.net),
        toNumber(item.totalExpense ?? toNumber(item.fee) + toNumber(item.expense)),
      ),
    ),
    1,
  );

  const chartModeLabel =
    trendRows.length <= 1 ? "단일일자" : trendRows.length <= 14 ? `최근 ${trendRows.length.toLocaleString()}일` : "기간 흐름";

  const activeRows = rankTab === "sales" ? salesTopRows : expenseTopRows;
  const activeTopRows = activeRows.slice(0, 3);
  const activeRankItems = makeRankItems(activeRows, rankTab);
  const activeTopItems = activeRankItems.slice(0, 3);
  const activeEmptyText = rankTab === "sales" ? "매출 랭킹 데이터가 없습니다." : "지출 랭킹 데이터가 없습니다.";
  const modalTitle = rankTab === "sales" ? "👑 매출 전체 순위" : "🧾 지출 전체 순위";

  return (
    <>
      <div className="grid items-stretch gap-4 xl:grid-cols-[1.55fr_0.45fr]">
        <div className="flex min-h-[430px] flex-col self-stretch overflow-hidden rounded-[28px] border border-line bg-surface p-4 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-black text-ink">기간별 매출·지출 흐름</div>
              <div className="mt-1 text-xs font-bold text-ink-mute">
                막대에 마우스를 올리거나 터치하면 날짜별 금액을 확인할 수 있습니다.
              </div>
            </div>
            <div className="rounded-full bg-surface-3 px-3 py-1 text-xs font-black text-ink-soft">{chartModeLabel}</div>
          </div>

          {trendRows.length === 0 ? (
            <div className="mt-4 flex flex-1 items-center justify-center rounded-[24px] bg-surface-2 text-sm font-black text-ink-mute">
              표시할 기간별 정산 데이터가 없습니다.
            </div>
          ) : (
            <div className="mt-4 flex flex-1 flex-col justify-center rounded-[24px] bg-surface-2 p-4">
              <div className="overflow-x-auto">
                <div className="flex min-h-[250px] min-w-[520px] items-end gap-4 rounded-[22px] bg-surface-2 px-3 pb-4 pt-6">
                  {trendRows.map((item) => {
                    const totalExpense = toNumber(item.totalExpense ?? toNumber(item.fee) + toNumber(item.expense));
                    const salesHeight = percent(item.sales, maxTrend);
                    const netHeight = percent(item.net, maxTrend);
                    const expenseHeight = percent(totalExpense, maxTrend);
                    const isActive = selectedTrend?.dateKey === item.dateKey;

                    return (
                      <button
                        key={item.dateKey}
                        type="button"
                        onMouseEnter={() => setActiveTrend(item)}
                        onFocus={() => setActiveTrend(item)}
                        onClick={() => setActiveTrend(item)}
                        onTouchStart={() => setActiveTrend(item)}
                        className={`group flex min-w-[58px] flex-1 flex-col items-center justify-end gap-1.5 rounded-2xl px-2 py-2 transition ${
                          isActive ? "bg-info-bg shadow-[0_8px_24px_rgba(37,99,235,0.14)]" : "hover:bg-surface-2"
                        }`}
                      >
                        <div className="flex h-[175px] items-end gap-1.5">
                          <div
                            className="w-3 rounded-t-full bg-blue-500 transition-all group-hover:brightness-110"
                            style={{ height: `${salesHeight}%` }}
                            title={`결제완료 매출 ${won(item.sales)}`}
                          />
                          <div
                            className="w-3 rounded-t-full bg-emerald-500 transition-all group-hover:brightness-110"
                            style={{ height: `${netHeight}%` }}
                            title={`현재 실수익 ${won(item.net)}`}
                          />
                          <div
                            className="w-3 rounded-t-full bg-slate-400 transition-all group-hover:brightness-110"
                            style={{ height: `${expenseHeight}%` }}
                            title={`지출 ${won(totalExpense)}`}
                          />
                        </div>
                        <span className="text-[11px] font-black text-ink-mute">{shortDateLabel(item.dateKey)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs font-black text-ink-soft">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  결제완료 매출
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  현재 실수익
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  지출
                </span>
              </div>

              {selectedTrend ? (
                <div className="mt-3 rounded-[20px] border border-line bg-info-bg px-4 py-3">
                  <div className="text-sm font-black text-ink">{fullDateLabel(selectedTrend.dateKey)}</div>
                  <div className="mt-2 grid gap-x-4 gap-y-1.5 text-xs font-bold text-ink-soft sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      주문 <span className="font-black text-ink">{toNumber(selectedTrend.orderCount).toLocaleString()}건</span>
                    </div>
                    <div>
                      결제완료 매출 <span className="font-black text-info-tx">{won(selectedTrend.sales)}</span>
                    </div>
                    <div>
                      무통장 <span className="font-black text-ok-tx">{won(selectedTrend.bank || 0)}</span>
                    </div>
                    <div>
                      카드 <span className="font-black text-info-tx">{won(selectedTrend.card || 0)}</span>
                    </div>
                    <div>
                      추가 정산 수익 <span className="font-black text-sky-700">{won(selectedTrend.manualIncome || 0)}</span>
                    </div>
                    <div>
                      카드 수수료 <span className="font-black text-ink">{won(selectedTrend.fee)}</span>
                    </div>
                    <div>
                      창고/기타 지출 <span className="font-black text-violet-700">{won(selectedTrend.warehouseOtherExpense ?? selectedTrend.expense)}</span>
                    </div>
                    <div>
                      지출합계 <span className="font-black text-violet-700">{won(selectedTotalExpense)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-[20px] border border-line-soft bg-surface px-4 py-3 text-xs font-bold text-ink-mute">
                  그래프 막대에 마우스를 올리거나 터치하면 날짜별 상세 금액이 표시됩니다.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex min-h-[430px] flex-col self-stretch overflow-hidden rounded-[28px] border border-line bg-surface p-4 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
          <div>
            <div className="text-lg font-black text-ink">매출·지출 TOP 요약</div>
            <div className="mt-1 text-xs font-bold text-ink-mute">
              {periodLabel} · 총 {toNumber(stats.orderCount).toLocaleString()}건
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 rounded-2xl bg-surface-3 p-1">
            <button
              type="button"
              onClick={() => setRankTab("sales")}
              className={`rounded-xl px-3 py-2 text-sm font-black transition ${
                rankTab === "sales" ? "bg-surface text-info-tx shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              👑 매출 TOP
            </button>
            <button
              type="button"
              onClick={() => setRankTab("expense")}
              className={`rounded-xl px-3 py-2 text-sm font-black transition ${
                rankTab === "expense" ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              🧾 지출 TOP
            </button>
          </div>

          <div
            className={`mt-4 flex min-h-0 flex-1 flex-col rounded-[22px] border p-3 ${
              rankTab === "sales" ? "border-line bg-info-bg" : "border-line bg-surface-2"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black text-ink-soft">TOP 3 고정 표시</div>
              <button
                type="button"
                onClick={() => setRankModalOpen(true)}
                className="text-xs font-black text-info-tx underline-offset-4 hover:underline"
              >
                더보기
              </button>
            </div>

            <div className="mt-3 grid gap-2 pr-1">
              {activeTopItems.length === 0 ? (
                <div className="rounded-2xl bg-surface px-3 py-3 text-xs font-bold text-ink-mute">{activeEmptyText}</div>
              ) : (
                activeTopItems.map((item) => (
                  <div key={item.id} className="rounded-2xl bg-surface px-3 py-2 shadow-sm">
                    <div className={`text-[11px] font-black ${rankTab === "sales" ? "text-info-tx" : "text-ink-soft"}`}>
                      {item.rank}위
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs font-black leading-5 text-ink">{item.title}</div>
                    <div className="mt-1 text-sm font-black tabular-nums text-ink">{item.amountText}</div>
                    <div className="mt-0.5 line-clamp-1 text-[11px] font-bold text-ink-mute">{item.subLabel}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <SettlementRankModal
        open={rankModalOpen}
        title={modalTitle}
        subtitle={`${periodLabel} · 전체 ${activeRankItems.length.toLocaleString()}개`}
        items={activeRankItems}
        onClose={() => setRankModalOpen(false)}
      />
    </>
  );
}
