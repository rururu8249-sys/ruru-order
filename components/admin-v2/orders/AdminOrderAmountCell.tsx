"use client";

type AdminOrderAmountCellProps = {
  amountText: string;
  warningText?: string;
};

export default function AdminOrderAmountCell({
  amountText,
  warningText,
}: AdminOrderAmountCellProps) {
  return (
    <div className="w-full text-right" title={warningText || ""}>
      <div className="whitespace-nowrap text-[15px] font-black">{amountText}</div>
    </div>
  );
}
