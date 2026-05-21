"use client";

// components/admin-v2/today/AdminTodayControlSummaryBar.tsx
// 목적: 루루동이LIVE Control Center 핵심 요약바
// 주의: UI 표시 전용. 주문/입금/배송/정산 저장 로직 없음.

import { useState } from "react";
import { money } from "@/lib/admin-v2/formatters";

type MoneySummary = {
  totalOrderAmount: number;
  bankPaidAmount: number;
  bankUnpaidAmount: number;
  cardPaidAmount: number;
  cardUnpaidAmount: number;
  canceledAmount: number;
  netSalesAmount: number;
};

type Props = {
  summary: MoneySummary;
  orderCount: number;
  itemQuantity: number;
  issueCount: number;
  periodLabel: string;
  periodStorageReady: boolean;
};

export default function AdminTodayControlSummaryBar({
  summary,
  orderCount,
  itemQuantity,
  issueCount,
  periodLabel,
  periodStorageReady,
}: Props) {
  const [open, setOpen] = useState(true);

  const unpaidTotal =
    Number(summary.bankUnpaidAmount || 0) + Number(summary.cardUnpaidAmount || 0);

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[19px] font-black tracking-[-0.04em] text-neutral-950">
              방송 핵심 요약
            </h2>

            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
              {periodStorageReady ? "선택기간 유지 ON" : "기간 유지 준비중"}
            </span>

            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-black text-neutral-600">
              {periodLabel}
            </span>
          </div>

          <p className="mt-0.5 text-[12px] font-bold text-neutral-500">
            방송 중 총매출·입금·카드·주문·고객이슈를 한 줄로 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MiniBadge
            label="미입금"
            value={money(unpaidTotal)}
            danger={unpaidTotal > 0}
          />
          <MiniBadge
            label="이슈"
            value={`${issueCount.toLocaleString()}건`}
            danger={issueCount > 0}
          />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="h-10 rounded-full bg-neutral-950 px-4 text-[12px] font-black text-white active:scale-[0.98]"
          >
            {open ? "접기" : "펼치기"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-[1.15fr_1fr_1fr_1fr_1fr]">
          <SingleSummaryCard
            title="총매출"
            value={money(summary.totalOrderAmount)}
            desc="미입금 포함"
            tone="blue"
          />

          <DoubleSummaryCard
            title="무통장"
            firstLabel="입금완료"
            firstValue={money(summary.bankPaidAmount)}
            secondLabel="미입금"
            secondValue={money(summary.bankUnpaidAmount)}
            secondDanger={summary.bankUnpaidAmount > 0}
          />

          <DoubleSummaryCard
            title="카드"
            firstLabel="결제완료"
            firstValue={money(summary.cardPaidAmount)}
            secondLabel="미결제"
            secondValue={money(summary.cardUnpaidAmount)}
            secondDanger={summary.cardUnpaidAmount > 0}
          />

          <DoubleSummaryCard
            title="주문"
            firstLabel="주문건수"
            firstValue={`${orderCount.toLocaleString()}건`}
            secondLabel="상품수량"
            secondValue={`${itemQuantity.toLocaleString()}개`}
          />

          <SingleSummaryCard
            title="고객이슈"
            value={`${issueCount.toLocaleString()}건`}
            desc="특이사항/문의 확인"
            tone={issueCount > 0 ? "amber" : "neutral"}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 p-3 text-[12px] font-black text-neutral-700 md:grid-cols-5">
          <CollapsedItem label="총매출" value={money(summary.totalOrderAmount)} />
          <CollapsedItem label="무통장미입금" value={money(summary.bankUnpaidAmount)} />
          <CollapsedItem label="카드미결제" value={money(summary.cardUnpaidAmount)} />
          <CollapsedItem
            label="주문"
            value={`${orderCount.toLocaleString()}건 / ${itemQuantity.toLocaleString()}개`}
          />
          <CollapsedItem label="고객이슈" value={`${issueCount.toLocaleString()}건`} />
        </div>
      )}
    </section>
  );
}

function MiniBadge({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger: boolean;
}) {
  return (
    <span
      className={[
        "rounded-full px-3 py-2 text-[12px] font-black",
        danger ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600",
      ].join(" ")}
    >
      {label} {value}
    </span>
  );
}

function SingleSummaryCard({
  title,
  value,
  desc,
  tone,
}: {
  title: string;
  value: string;
  desc: string;
  tone: "blue" | "amber" | "neutral";
}) {
  const valueClass =
    tone === "blue"
      ? "text-blue-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-neutral-950";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4">
      <div className="text-[12px] font-black text-neutral-500">{title}</div>
      <div className={`mt-2 text-[25px] font-black tracking-[-0.06em] ${valueClass}`}>
        {value}
      </div>
      <div className="mt-1 text-[12px] font-bold text-neutral-500">{desc}</div>
    </div>
  );
}

function DoubleSummaryCard({
  title,
  firstLabel,
  firstValue,
  secondLabel,
  secondValue,
  secondDanger = false,
}: {
  title: string;
  firstLabel: string;
  firstValue: string;
  secondLabel: string;
  secondValue: string;
  secondDanger?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4">
      <div className="text-[12px] font-black text-neutral-500">{title}</div>

      <div className="mt-2 grid gap-2">
        <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
          <span className="text-[12px] font-black text-neutral-500">{firstLabel}</span>
          <span className="text-[15px] font-black text-emerald-700">{firstValue}</span>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
          <span className="text-[12px] font-black text-neutral-500">{secondLabel}</span>
          <span
            className={[
              "text-[15px] font-black",
              secondDanger ? "text-red-600" : "text-neutral-800",
            ].join(" ")}
          >
            {secondValue}
          </span>
        </div>
      </div>
    </div>
  );
}

function CollapsedItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-3 py-2">
      <span className="text-neutral-400">{label}</span>
      <span className="ml-2 text-neutral-950">{value}</span>
    </div>
  );
}
