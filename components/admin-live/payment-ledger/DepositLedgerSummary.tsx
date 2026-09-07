import type { DepositSummary } from "./depositLedgerTypes";

type Props = {
  summary: DepositSummary;
};

function money(value: number) {
  return `${Number(value || 0).toLocaleString()}원`;
}

export default function DepositLedgerSummary({ summary }: Props) {
  const cards = [
    {
      label: "기간 입금합계",
      value: money(summary.totalAmount),
      sub: "현재 조회 조건 기준",
      icon: "₩",
    },
    {
      label: "입금건수",
      value: `${summary.totalCount.toLocaleString()}건`,
      sub: "실제 은행 입금 1건 = 1줄",
      icon: "≡",
    },
    {
      label: "오늘 입금액",
      value: money(summary.todayAmount),
      sub: "오늘 날짜 기준",
      icon: "↧",
    },
    {
      label: "마지막 동기화",
      value: summary.lastSyncedLabel || "-",
      sub: "뱅크다/화면 조회 기준",
      icon: "↻",
    },
  ];

  return (
    <section className="grid gap-3 xl:grid-cols-4 md:grid-cols-2">
      {cards.map((card) => (
        <article
          key={card.label}
          className="rounded-[26px] border border-line bg-surface p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black text-ink-soft">{card.label}</div>
              <div className="mt-2 text-2xl font-black tracking-tight text-ink">{card.value}</div>
              <div className="mt-1 text-xs font-bold text-ink-mute">{card.sub}</div>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-info-bg text-lg font-black text-info-tx">
              {card.icon}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
