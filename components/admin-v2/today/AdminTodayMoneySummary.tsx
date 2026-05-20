"use client";

// components/admin-v2/today/AdminTodayMoneySummary.tsx
// 목적: 오늘할일 돈 흐름 요약 표시
// 주의: 기존 orderHelpers 계산 결과만 표시. DB/정산 저장 로직 없음.

import { money } from "@/lib/admin-v2/formatters";
import type { buildMoneySummary } from "@/components/admin-v2/today/adminTodayUtils";

type MoneySummary = ReturnType<typeof buildMoneySummary>;

function MoneyCard({
  label,
  value,
  desc,
  tone = "neutral",
}: {
  label: string;
  value: number;
  desc: string;
  tone?: "neutral" | "blue" | "emerald" | "amber" | "rose";
}) {
  const toneClass =
    tone === "blue"
      ? "bg-blue-50 text-blue-700"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-700"
        : tone === "amber"
          ? "bg-amber-50 text-amber-800"
          : tone === "rose"
            ? "bg-rose-50 text-rose-700"
            : "bg-neutral-100 text-neutral-800";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-black text-neutral-500">{label}</div>
      <div className={`mt-2 inline-flex rounded-xl px-3 py-1.5 text-xl font-black ${toneClass}`}>
        {money(value)}
      </div>
      <div className="mt-2 text-xs font-bold text-neutral-500">{desc}</div>
    </div>
  );
}

export default function AdminTodayMoneySummary({
  summary,
}: {
  summary: MoneySummary;
}) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <MoneyCard label="총 주문금액" value={summary.totalOrderAmount} desc="미입금 포함" tone="blue" />
      <MoneyCard label="무통장 입금완료" value={summary.bankPaidAmount} desc="입금확인 완료" tone="emerald" />
      <MoneyCard label="무통장 미입금" value={summary.bankUnpaidAmount} desc="입금확인 필요" tone="amber" />
      <MoneyCard label="카드결제 완료" value={summary.cardPaidAmount} desc="카드 완료" tone="emerald" />
      <MoneyCard label="카드 미결제" value={summary.cardUnpaidAmount} desc="카드 확인 필요" tone="amber" />
      <MoneyCard label="주문취소" value={summary.canceledAmount} desc="매출 제외" tone="rose" />
    </section>
  );
}
