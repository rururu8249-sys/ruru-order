"use client";

import type { SettlementStats } from "./settlementTypes";
import { percentText, won } from "./settlementUtils";

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "slate",
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  tone?: "slate" | "blue" | "green" | "orange" | "red" | "violet";
}) {
  const toneClass =
    tone === "blue"
      ? "border-blue-100 bg-blue-50/50"
      : tone === "green"
        ? "border-emerald-100 bg-emerald-50/50"
        : tone === "orange"
          ? "border-orange-100 bg-orange-50/50"
          : tone === "red"
            ? "border-rose-100 bg-rose-50/50"
            : tone === "violet"
              ? "border-violet-100 bg-violet-50/50"
              : "border-slate-200 bg-white";

  const iconClass =
    tone === "blue"
      ? "bg-blue-100 text-blue-700"
      : tone === "green"
        ? "bg-emerald-100 text-emerald-700"
        : tone === "orange"
          ? "bg-orange-100 text-orange-700"
          : tone === "red"
            ? "bg-rose-100 text-rose-700"
            : tone === "violet"
              ? "bg-violet-100 text-violet-700"
              : "bg-slate-100 text-slate-700";

  return (
    <div className={`rounded-[26px] border p-5 shadow-[0_14px_35px_rgba(15,23,42,0.05)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black text-slate-500">{label}</div>
          <div className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">{value}</div>
          {sub ? <div className="mt-2 text-xs font-bold text-slate-400">{sub}</div> : null}
        </div>

        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl shadow-sm ${iconClass}`}>
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
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <StatCard icon="💰" label="총주문액" value={won(stats.totalOrderAmount)} sub={`${stats.orderCount.toLocaleString()}건`} />
      <StatCard icon="✅" label="완료매출" value={won(stats.paidAmount)} sub={`${stats.paidCount.toLocaleString()}건`} tone="blue" />
      <StatCard icon="🏦" label="무통장" value={won(stats.bankAmount)} sub={`${stats.bankCount.toLocaleString()}건`} tone="green" />
      <StatCard icon="💳" label="카드" value={won(stats.cardAmount)} sub={`${stats.cardCount.toLocaleString()}건`} tone="blue" />
      <StatCard icon="🧾" label="기타매출" value={won(stats.manualIncomeAmount)} sub={`${stats.manualIncomeCount.toLocaleString()}건`} tone="blue" />
      <StatCard icon="➖" label={`카드수수료(${percentText(actualCardFeeRate)})`} value={`-${won(stats.actualCardFee)}`} sub="자동 지출" tone="red" />
      <StatCard icon="📦" label="창고정산/기타지출" value={`-${won(stats.warehouseOtherExpense)}`} sub="수동 지출 연결 예정" tone="violet" />
      <StatCard icon="⏳" label="미입금/확인필요" value={won(stats.unpaidAmount)} sub="실수익 계산 제외" tone="orange" />
      <StatCard icon="📈" label="실수익" value={won(stats.netAmount)} sub="완료매출 - 지출" tone="green" />
    </div>
  );
}
