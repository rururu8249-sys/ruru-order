"use client";

import { useMemo, useState } from "react";
import type { SettlementStats } from "./settlementTypes";
import { toNumber, won } from "./settlementUtils";

type TrendRow = {
  dateKey: string;
  sales: number;
  fee: number;
  expense: number;
  net: number;
};

function shortDateLabel(value: string) {
  const [yearText, monthText, dayText] = String(value || "").split("-");
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

function percent(value: number, max: number) {
  if (!max) return 0;

  return Math.max(4, Math.min(100, Math.round((toNumber(value) / max) * 100)));
}

function amountPercent(value: number, max: number) {
  if (!max) return 0;

  return Math.max(2, Math.min(100, Math.round((toNumber(value) / max) * 100)));
}

export default function SettlementCharts({
  trend,
  stats,
}: {
  trend: TrendRow[];
  stats: SettlementStats;
}) {
  const trendRows = useMemo(() => {
    return Array.isArray(trend) ? trend.slice(-14) : [];
  }, [trend]);

  const [activeTrend, setActiveTrend] = useState<TrendRow | null>(null);

  const selectedTrend = activeTrend || (trendRows.length === 1 ? trendRows[0] : null);
  const maxTrend = Math.max(
    ...trendRows.map((item) => Math.max(toNumber(item.sales), toNumber(item.net), toNumber(item.fee) + toNumber(item.expense))),
    1,
  );
  const maxBar = Math.max(
    toNumber(stats.bankAmount),
    toNumber(stats.cardAmount),
    toNumber(stats.manualIncomeAmount),
    toNumber(stats.actualCardFee),
    toNumber(stats.warehouseOtherExpense),
    1,
  );

  const summaryRows = [
    { label: "무통장", amount: stats.bankAmount, dot: "bg-emerald-500", text: "text-emerald-700" },
    { label: "카드", amount: stats.cardAmount, dot: "bg-blue-500", text: "text-blue-700" },
    { label: "기타매출", amount: stats.manualIncomeAmount, dot: "bg-sky-500", text: "text-sky-700" },
    { label: "카드수수료", amount: stats.actualCardFee, dot: "bg-rose-500", text: "text-rose-700" },
    { label: "창고정산/기타지출", amount: stats.warehouseOtherExpense, dot: "bg-violet-500", text: "text-violet-700" },
  ];

  const selectedExpense = selectedTrend ? toNumber(selectedTrend.fee) + toNumber(selectedTrend.expense) : 0;
  const chartModeLabel =
    trendRows.length <= 1 ? "단일일자" : trendRows.length <= 14 ? `최근 ${trendRows.length.toLocaleString()}일` : "기간 흐름";

  return (
    <div className="grid gap-5 xl:grid-cols-[1.55fr_0.45fr]">
      <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-black text-slate-950">기간별 매출·지출 흐름</div>
            <div className="mt-1 text-xs font-bold text-slate-400">
              막대에 마우스를 올리거나 터치하면 날짜별 금액을 확인할 수 있습니다.
            </div>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{chartModeLabel}</div>
        </div>

        {trendRows.length === 0 ? (
          <div className="mt-5 flex h-[280px] items-center justify-center rounded-[28px] bg-slate-50 text-sm font-black text-slate-400">
            표시할 기간별 정산 데이터가 없습니다.
          </div>
        ) : (
          <div className="mt-5 rounded-[28px] bg-slate-50 p-4">
            <div className="overflow-x-auto">
              <div className="flex min-h-[250px] min-w-[520px] items-end gap-5 rounded-[24px] bg-white/60 px-4 pb-4 pt-8">
                {trendRows.map((item) => {
                  const salesHeight = percent(item.sales, maxTrend);
                  const netHeight = percent(item.net, maxTrend);
                  const expenseHeight = percent(toNumber(item.fee) + toNumber(item.expense), maxTrend);
                  const isActive = selectedTrend?.dateKey === item.dateKey;

                  return (
                    <button
                      key={item.dateKey}
                      type="button"
                      onMouseEnter={() => setActiveTrend(item)}
                      onFocus={() => setActiveTrend(item)}
                      onClick={() => setActiveTrend(item)}
                      onTouchStart={() => setActiveTrend(item)}
                      className={`group flex min-w-[62px] flex-1 flex-col items-center justify-end gap-2 rounded-3xl px-2 py-2 transition ${
                        isActive ? "bg-blue-50 shadow-[0_10px_30px_rgba(37,99,235,0.16)]" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex h-[180px] items-end gap-1.5">
                        <div
                          className="w-3 rounded-t-full bg-blue-500 transition-all group-hover:brightness-110"
                          style={{ height: `${salesHeight}%` }}
                          title={`완료매출 ${won(item.sales)}`}
                        />
                        <div
                          className="w-3 rounded-t-full bg-emerald-500 transition-all group-hover:brightness-110"
                          style={{ height: `${netHeight}%` }}
                          title={`실수익 ${won(item.net)}`}
                        />
                        <div
                          className="w-3 rounded-t-full bg-rose-400 transition-all group-hover:brightness-110"
                          style={{ height: `${expenseHeight}%` }}
                          title={`지출 ${won(toNumber(item.fee) + toNumber(item.expense))}`}
                        />
                      </div>
                      <span className="text-[11px] font-black text-slate-400">{shortDateLabel(item.dateKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-xs font-black text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                완료매출
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                실수익
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                지출
              </span>
            </div>

            {selectedTrend ? (
              <div className="mt-4 rounded-[24px] border border-blue-100 bg-blue-50 px-4 py-3">
                <div className="text-sm font-black text-slate-950">{fullDateLabel(selectedTrend.dateKey)}</div>
                <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    완료매출 <span className="font-black text-blue-700">{won(selectedTrend.sales)}</span>
                  </div>
                  <div>
                    실수익 <span className="font-black text-emerald-700">{won(selectedTrend.net)}</span>
                  </div>
                  <div>
                    카드수수료 <span className="font-black text-rose-700">{won(selectedTrend.fee)}</span>
                  </div>
                  <div>
                    지출합계 <span className="font-black text-violet-700">{won(selectedExpense)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[24px] border border-slate-100 bg-white px-4 py-3 text-xs font-bold text-slate-400">
                그래프 막대에 마우스를 올리거나 터치하면 날짜별 상세 금액이 표시됩니다.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
        <div>
          <div className="text-lg font-black text-slate-950">매출·지출 요약</div>
          <div className="mt-1 text-xs font-bold text-slate-400">항목별 금액 비중만 간단히 봅니다.</div>
        </div>

        <div className="mt-6 grid gap-5">
          {summaryRows.map((row) => {
            const width = amountPercent(row.amount, maxBar);

            return (
              <div key={row.label}>
                <div className="flex items-center justify-between gap-3 text-sm font-black text-slate-700">
                  <span>{row.label}</span>
                  <span className="tabular-nums text-slate-900">{won(row.amount)}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${row.dot}`} style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold leading-5 text-slate-500">
          실수익은 상단 카드에서 대표값으로 확인합니다. 이 영역은 매출·지출 항목별 비중만 보여줍니다.
        </div>
      </div>
    </div>
  );
}
