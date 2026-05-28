"use client";

import type { SettlementStats } from "./settlementTypes";
import { percentText, won } from "./settlementUtils";

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "slate",
  strong = false,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  tone?: "slate" | "blue" | "green" | "orange";
  strong?: boolean;
}) {
  const toneClass =
    tone === "blue"
      ? "border-blue-100 bg-blue-50/45"
      : tone === "green"
        ? "border-emerald-100 bg-emerald-50/45"
        : tone === "orange"
          ? "border-orange-100 bg-orange-50/45"
          : "border-slate-200 bg-white";

  const iconClass =
    tone === "blue"
      ? "bg-blue-100 text-blue-700"
      : tone === "green"
        ? "bg-emerald-100 text-emerald-700"
        : tone === "orange"
          ? "bg-orange-100 text-orange-700"
          : "bg-slate-100 text-slate-700";

  return (
    <div
      className={`min-h-[104px] rounded-[22px] border px-4 py-3 shadow-[0_10px_26px_rgba(15,23,42,0.045)] ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-black leading-4 text-slate-500">{label}</div>
          <div
            className={
              strong
                ? "mt-2 truncate text-[24px] font-black tracking-[-0.06em] text-slate-950"
                : "mt-2 truncate text-[22px] font-black tracking-[-0.06em] text-slate-950"
            }
          >
            {value}
          </div>
          {sub ? <div className="mt-1 truncate text-[11px] font-bold leading-4 text-slate-400">{sub}</div> : null}
        </div>

        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-base shadow-sm ${iconClass}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function SettlementSummaryCards({
  stats,
  actualCardFeeRate,
}: {
  stats: SettlementStats;
  actualCardFeeRate: string;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon="🧾" label="주문서 총금액" value={won(stats.totalOrderAmount)} sub={`${stats.orderCount.toLocaleString()}건`} />
        <StatCard icon="💳" label="결제완료 매출" value={won(stats.paidAmount)} sub={`${stats.paidCount.toLocaleString()}건`} tone="blue" strong />
        <StatCard icon="⏳" label="아직 못 받은 금액" value={won(stats.unpaidAmount)} sub="현재 실수익 계산 제외" tone="orange" />
        <StatCard icon="➖" label="빠지는 돈" value={`-${won(stats.totalExpense)}`} sub={`카드 수수료 ${percentText(actualCardFeeRate)} + 창고/기타 지출`} />
        <StatCard icon="📈" label="현재 실수익" value={won(stats.netAmount)} sub="결제완료 매출 + 추가 정산 수익 - 빠지는 돈" tone="green" strong />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon="🏦" label="무통장 결제완료" value={won(stats.bankAmount)} sub={`${stats.bankCount.toLocaleString()}건`} tone="blue" />
        <StatCard icon="💳" label="카드 결제완료" value={won(stats.cardAmount)} sub={`${stats.cardCount.toLocaleString()}건`} tone="blue" />
        <StatCard icon="➕" label="추가 정산 수익" value={won(stats.manualIncomeAmount)} sub={`${stats.manualIncomeCount.toLocaleString()}건`} />
      </div>
    </div>
  );
}
