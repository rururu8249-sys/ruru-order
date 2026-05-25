"use client";

import type { SettlementStats } from "./settlementTypes";
import { toNumber, won } from "./settlementUtils";

type TrendRow = {
  dateKey: string;
  sales: number;
  fee: number;
  expense: number;
  net: number;
};

export default function SettlementCharts({
  trend,
  stats,
}: {
  trend: TrendRow[];
  stats: SettlementStats;
}) {
  const maxTrend = Math.max(...trend.map((item) => Math.max(item.sales, item.net, item.fee + item.expense)), 1);
  const maxBar = Math.max(stats.bankAmount, stats.cardAmount, stats.manualIncomeAmount, stats.actualCardFee, stats.warehouseOtherExpense, 1);

  const rows = [
    ["무통장", stats.bankAmount, "bg-emerald-500"],
    ["카드", stats.cardAmount, "bg-blue-500"],
    ["기타매출", stats.manualIncomeAmount, "bg-sky-500"],
    ["카드수수료", stats.actualCardFee, "bg-rose-500"],
    ["창고정산/기타지출", stats.warehouseOtherExpense, "bg-violet-500"],
  ] as const;

  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-black text-slate-950">기간별 매출·지출 흐름</div>
            <div className="mt-1 text-xs font-bold text-slate-400">입금/결제완료 기준 최근 14일 흐름입니다.</div>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
            {trend.length.toLocaleString()}일
          </div>
        </div>

        {trend.length === 0 ? (
          <div className="mt-6 rounded-3xl bg-slate-50 p-10 text-center text-sm font-bold text-slate-400">
            표시할 통계 데이터가 없습니다.
          </div>
        ) : (
          <div className="mt-6 flex h-[220px] items-end gap-2 rounded-3xl bg-slate-50 p-4">
            {trend.map((item) => {
              const salesHeight = Math.max(4, Math.round((toNumber(item.sales) / maxTrend) * 160));
              const netHeight = Math.max(4, Math.round((toNumber(item.net) / maxTrend) * 160));
              const expenseHeight = Math.max(4, Math.round(((toNumber(item.fee) + toNumber(item.expense)) / maxTrend) * 160));

              return (
                <div key={item.dateKey} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <div className="flex h-[170px] items-end gap-1">
                    <div title={`완료매출 ${won(item.sales)}`} className="w-3 rounded-t-full bg-blue-500" style={{ height: salesHeight }} />
                    <div title={`실수익 ${won(item.net)}`} className="w-3 rounded-t-full bg-emerald-500" style={{ height: netHeight }} />
                    <div title={`지출 ${won(item.fee + item.expense)}`} className="w-3 rounded-t-full bg-rose-400" style={{ height: expenseHeight }} />
                  </div>
                  <div className="w-full truncate text-center text-[10px] font-black text-slate-400">
                    {item.dateKey.slice(5).replace("-", "/")}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3 text-xs font-black text-slate-500">
          <span>● 완료매출</span>
          <span>● 실수익</span>
          <span>● 지출</span>
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
        <div className="text-lg font-black text-slate-950">매출·지출 요약</div>
        <div className="mt-1 text-xs font-bold text-slate-400">완료매출과 지출 항목을 함께 봅니다.</div>

        <div className="mt-6 grid gap-4">
          {rows.map(([label, amount, color]) => (
            <div key={label}>
              <div className="mb-2 flex justify-between text-sm font-black text-slate-700">
                <span>{label}</span>
                <span>{won(amount)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${color}`}
                  style={{ width: `${Math.max(3, Math.min(100, (toNumber(amount) / maxBar) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="text-xs font-black text-blue-700">현재 실수익</div>
          <div className="mt-1 text-2xl font-black text-slate-950">{won(stats.netAmount)}</div>
          <div className="mt-1 text-xs font-bold text-blue-700">
            완료매출 - 카드수수료 - 창고정산/기타지출
          </div>
        </div>
      </div>
    </div>
  );
}
