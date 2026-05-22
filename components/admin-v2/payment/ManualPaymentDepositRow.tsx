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
        "grid w-full grid-cols-[34px_1fr_120px_92px] items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition active:scale-[0.995]",
        selected ? "bg-blue-50" : "bg-white hover:bg-slate-50",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-6 w-6 items-center justify-center rounded-lg border text-xs font-black",
          selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-transparent",
        ].join(" ")}
      >
        ✓
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-black text-slate-950">{deposit.depositor_name || "-"}</div>
        <div className="mt-0.5 text-xs font-bold text-slate-400">{timeLabel}</div>
      </div>

      <div className="text-right text-sm font-black text-slate-950">{money(deposit.amount)}</div>

      <div
        className={[
          "rounded-full px-2 py-1 text-center text-xs font-black",
          tag === "추천"
            ? "bg-blue-100 text-blue-700"
            : tag === "금액일치"
              ? "bg-emerald-100 text-emerald-700"
              : tag === "이름유사"
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-500",
        ].join(" ")}
      >
        {tag}
      </div>
    </button>
  );
}
