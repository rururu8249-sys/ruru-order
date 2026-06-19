import type { DepositRow } from "@/lib/admin-v2/types";

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString()}원`;
}

type Props = {
  deposit: DepositRow;
  selected: boolean;
  tag: string;
  timeLabel: string;
  onToggle: () => void;
};

export default function ManualPaymentDepositRow({ deposit, selected, tag, timeLabel, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        "grid w-full grid-cols-[32px_1fr_96px_76px] items-center gap-2 border-b border-line-soft px-3 py-2.5 text-left transition active:scale-[0.995]",
        selected ? "bg-info-bg" : "bg-surface hover:bg-surface-2",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-6 w-6 items-center justify-center rounded-xl border text-xs font-black",
          selected ? "border-blue-600 bg-rose-deep text-white" : "border-line text-transparent",
        ].join(" ")}
      >
        ✓
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-black text-ink">{deposit.depositor_name || "-"}</div>
        <div className="mt-0.5 text-xs font-bold text-ink-mute">입금일시 {timeLabel}</div>
      </div>

      <div className="text-right text-sm font-black tracking-[-0.03em] text-ink">
        {money(deposit.amount)}
      </div>

      <div
        className={[
          "rounded-full px-2 py-1 text-center text-[11px] font-black",
          tag === "추천"
            ? "bg-blue-100 text-info-tx"
            : tag === "금액일치"
              ? "bg-emerald-100 text-ok-tx"
              : tag === "이름유사"
                ? "bg-amber-100 text-warn-tx"
                : "bg-surface-3 text-ink-soft",
        ].join(" ")}
      >
        {tag}
      </div>
    </button>
  );
}
