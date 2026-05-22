function money(value: unknown) {
  return `${Number(value || 0).toLocaleString()}원`;
}

type Props = {
  expectedAmount: number;
  selectedTotalAmount: number;
  selectedCount: number;
  amountDifference: number;
};

export default function ManualPaymentAmountSummary({
  expectedAmount,
  selectedTotalAmount,
  selectedCount,
  amountDifference,
}: Props) {
  const exact = expectedAmount > 0 && selectedCount > 0 && amountDifference === 0;

  return (
    <section
      className={[
        "rounded-2xl border px-3 py-2",
        exact ? "border-emerald-200 bg-emerald-50" : "border-orange-200 bg-orange-50",
      ].join(" ")}
    >
      <div className="grid grid-cols-3 gap-2">
        <Amount label="입금예정" value={money(expectedAmount)} />
        <Amount label={`선택 ${selectedCount}건`} value={money(selectedTotalAmount)} />
        <Amount label="차액" value={money(amountDifference)} danger={!exact} success={exact} />
      </div>

      <div
        className={[
          "mt-2 rounded-xl px-3 py-1.5 text-[11px] font-black",
          exact ? "bg-white text-emerald-700" : "bg-white text-orange-700",
        ].join(" ")}
      >
        {exact ? "금액이 정확히 일치합니다." : "금액이 다릅니다. 관리자 판단으로만 수동매칭하세요."}
      </div>
    </section>
  );
}

function Amount({
  label,
  value,
  danger = false,
  success = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
  success?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] font-black text-slate-400">{label}</div>
      <div
        className={[
          "mt-0.5 text-sm font-black tracking-[-0.03em]",
          danger ? "text-red-600" : success ? "text-emerald-600" : "text-slate-950",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
