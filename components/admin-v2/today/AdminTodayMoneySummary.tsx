"use client";

// components/admin-v2/today/AdminTodayMoneySummary.tsx
// 목적: 오늘할일 관제탑 상단 금액 요약을 작고 빠르게 보이도록 압축
// 주의: UI 표시 전용. 주문/입금/배송/정산 계산 로직 변경 없음.

type Props = {
  summary: Record<string, unknown>;
};

const money = (value: unknown) => {
  const numberValue = Number(value || 0);
  return `${numberValue.toLocaleString("ko-KR")}원`;
};

const pickNumber = (summary: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = summary[key];
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }

  return 0;
};

function CompactMoneyCard({
  label,
  value,
  desc,
  tone,
}: {
  label: string;
  value: number;
  desc: string;
  tone: "blue" | "emerald" | "amber" | "red";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  }[tone];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-black text-neutral-500">{label}</div>
      <div className={`mt-1 inline-flex rounded-xl px-2.5 py-1 text-lg font-black ${toneClass}`}>
        {money(value)}
      </div>
      <div className="mt-1 text-xs font-bold text-neutral-400">{desc}</div>
    </div>
  );
}

function MiniMoneyChip({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-2 text-xs font-black">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-950">{money(value)}</span>
    </div>
  );
}

export default function AdminTodayMoneySummary({ summary }: Props) {
  const totalOrderAmount = pickNumber(summary, ["totalOrderAmount", "totalAmount", "orderAmount"]);
  const bankPaidAmount = pickNumber(summary, ["bankPaidAmount", "bankConfirmedAmount", "bankConfirmedOrderSales"]);
  const bankUnpaidAmount = pickNumber(summary, ["bankUnpaidAmount", "bankPendingAmount", "unpaidBankAmount"]);
  const cardPaidAmount = pickNumber(summary, ["cardPaidAmount", "cardConfirmedAmount", "cardOrderSales"]);
  const cardUnpaidAmount = pickNumber(summary, ["cardUnpaidAmount", "cardPendingAmount"]);
  const cancelAmount = pickNumber(summary, ["cancelAmount", "canceledAmount", "cancelledAmount", "refundAmount"]);

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black tracking-[-0.03em] text-neutral-950">
            기간별 돈 흐름
          </h2>
          <p className="mt-0.5 text-xs font-bold text-neutral-400">
            결제완료와 미결제만 먼저 보이게 압축했습니다.
          </p>
        </div>

        <div className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-black text-neutral-600">
          미결제 우선 확인
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <CompactMoneyCard
          label="총 주문금액"
          value={totalOrderAmount}
          desc="미결제 포함"
          tone="blue"
        />
        <CompactMoneyCard
          label="결제완료(무통장)"
          value={bankPaidAmount}
          desc="무통장 확인"
          tone="emerald"
        />
        <CompactMoneyCard
          label="미결제"
          value={bankUnpaidAmount}
          desc="입금매칭 필요"
          tone="amber"
        />
        <CompactMoneyCard
          label="주문서 취소"
          value={cancelAmount}
          desc="매출 제외"
          tone="red"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <MiniMoneyChip label="카드결제완료" value={cardPaidAmount} />
        <MiniMoneyChip label="카드미결제" value={cardUnpaidAmount} />
      </div>
    </section>
  );
}
