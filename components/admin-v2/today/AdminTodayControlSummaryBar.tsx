"use client";

// components/admin-v2/today/AdminTodayControlSummaryBar.tsx
// 목적: 루루동이LIVE Control Center 핵심 요약바
// 주의: UI 표시 전용. 주문 저장, 입금매칭, 배송/정산 로직 변경 없음.

type SummaryMap = Record<string, unknown>;

type Props = {
  summary: SummaryMap;
  orderCount: number;
  itemQuantity: number;
  issueCount: number;
  periodLabel?: string;
  periodStorageReady?: boolean;
};

const pickNumber = (summary: SummaryMap, keys: string[]) => {
  for (const key of keys) {
    const value = summary[key];

    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }

  return 0;
};

const money = (value: number) => `${Number(value || 0).toLocaleString("ko-KR")}원`;

function SummaryCard({
  title,
  value,
  desc,
  tone = "neutral",
}: {
  title: string;
  value: string;
  desc: string;
  tone?: "neutral" | "emerald" | "amber" | "blue" | "rose";
}) {
  const toneClass = {
    neutral: "text-neutral-950",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    blue: "text-blue-700",
    rose: "text-rose-700",
  }[tone];

  return (
    <div className="min-w-0 rounded-xl border border-neutral-200 bg-white px-3 py-2">
      <div className="truncate text-[11px] font-black text-neutral-500">{title}</div>
      <div className={`mt-0.5 truncate text-sm font-black tracking-[-0.03em] ${toneClass}`}>
        {value}
      </div>
      <div className="mt-0.5 truncate text-[10px] font-bold text-neutral-400">{desc}</div>
    </div>
  );
}

export default function AdminTodayControlSummaryBar({
  summary,
  orderCount,
  itemQuantity,
  issueCount,
}: Props) {
  const totalOrderAmount = pickNumber(summary, ["totalOrderAmount", "totalAmount", "orderAmount"]);
  const bankPaidAmount = pickNumber(summary, ["bankPaidAmount", "bankConfirmedAmount", "bankConfirmedOrderSales"]);
  const bankUnpaidAmount = pickNumber(summary, ["bankUnpaidAmount", "bankPendingAmount", "unpaidBankAmount"]);
  const cardPaidAmount = pickNumber(summary, ["cardPaidAmount", "cardConfirmedAmount", "cardOrderSales"]);
  const cardUnpaidAmount = pickNumber(summary, ["cardUnpaidAmount", "cardPendingAmount"]);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-3 shadow-sm">
      <div className="mb-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-[-0.04em] text-neutral-950">
            방송 핵심 요약
          </h2>
          <p className="mt-0.5 text-xs font-bold text-neutral-500">
            총매출·입금·카드·주문·이슈큐를 한 줄로 확인합니다.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <SummaryCard title="주문서 총금액" value={money(totalOrderAmount)} desc="입금대기 포함" tone="blue" />
        <SummaryCard title="무통장 입금확인" value={money(bankPaidAmount)} desc="입금확인" tone="emerald" />
        <SummaryCard title="무통장 입금대기" value={money(bankUnpaidAmount)} desc="입금매칭 필요" tone="amber" />
        <SummaryCard title="카드결제완료" value={money(cardPaidAmount)} desc="카드결제완료" tone="emerald" />
        <SummaryCard title="카드 미결제" value={money(cardUnpaidAmount)} desc="확인 필요" tone="rose" />
        <SummaryCard title="주문건수" value={`${orderCount.toLocaleString()}건`} desc="선택 기간" />
        <SummaryCard title="상품수량" value={`${itemQuantity.toLocaleString()}개`} desc="주문수량 합계" />
        <SummaryCard title="이슈큐" value={`${issueCount.toLocaleString()}건`} desc="미해결 고객이슈" tone="rose" />
      </div>
    </section>
  );
}
