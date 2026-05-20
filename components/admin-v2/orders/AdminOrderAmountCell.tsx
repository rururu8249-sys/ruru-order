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
    <div className="text-left lg:text-right" title={warningText || ""}>
      <div className="text-[14px] font-black">{amountText}</div>
    </div>
  );
}
