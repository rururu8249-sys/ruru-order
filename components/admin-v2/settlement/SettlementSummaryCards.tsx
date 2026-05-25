"use client";

import type { SettlementStats } from "./settlementTypes";
import { percentText, won } from "./settlementUtils";

function StatCard({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "slate" | "blue" | "green" | "orange" | "red";
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
            : "border-slate-200 bg-white";

  return (
    <div className={`rounded-[26px] border p-5 shadow-[0_14px_35px_rgba(15,23,42,0.05)] ${toneClass}`}>
      <div className="text-xs font-black text-slate-500">{label}</div>
      <div className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">{value}</div>
      {sub ? <div className="mt-2 text-xs font-bold text-slate-400">{sub}</div> : null}
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
    <div className="grid gap-3 xl:grid-cols-7 md:grid-cols-2">
      <StatCard label="총 주문금액" value={won(stats.totalOrderAmount)} sub={`${stats.orderCount.toLocaleString()}건`} />
      <StatCard label="입금/결제완료" value={won(stats.paidAmount)} sub={`${stats.paidCount.toLocaleString()}건`} tone="blue" />
      <StatCard label="무통장 입금완료" value={won(stats.bankAmount)} sub={`${stats.bankCount.toLocaleString()}건`} tone="green" />
      <StatCard label="카드 결제완료" value={won(stats.cardAmount)} sub={`${stats.cardCount.toLocaleString()}건`} tone="blue" />
      <StatCard label={`카드수수료(${percentText(actualCardFeeRate)})`} value={`-${won(stats.actualCardFee)}`} sub="지출 처리" tone="red" />
      <StatCard label="미입금/확인필요" value={won(stats.unpaidAmount)} sub="취소/환불 제외" tone="orange" />
      <StatCard label="실수익" value={won(stats.netAmount)} sub="완료금액 - 카드수수료" tone="green" />
    </div>
  );
}
