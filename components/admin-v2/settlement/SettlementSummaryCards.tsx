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
      ? "border-line bg-surface-2"
      : tone === "green"
        ? "border-line bg-surface-2"
        : tone === "orange"
          ? "border-line bg-surface-2"
          : "border-line bg-surface";

  const iconClass =
    tone === "blue"
      ? "bg-blue-100 text-info-tx"
      : tone === "green"
        ? "bg-emerald-100 text-ok-tx"
        : tone === "orange"
          ? "bg-orange-100 text-warn-tx"
          : "bg-surface-3 text-ink";

  return (
    <div
      className={`min-h-[104px] rounded-[22px] border px-4 py-3 shadow-[0_10px_26px_rgba(15,23,42,0.045)] ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-black leading-4 text-ink-soft">{label}</div>
          <div
            className={
              strong
                ? "mt-2 truncate text-[24px] font-black tracking-[-0.06em] text-ink"
                : "mt-2 truncate text-[22px] font-black tracking-[-0.06em] text-ink"
            }
          >
            {value}
          </div>
          {sub ? <div className="mt-1 truncate text-[11px] font-bold leading-4 text-ink-mute">{sub}</div> : null}
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
