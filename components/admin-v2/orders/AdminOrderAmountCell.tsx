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
    <div className="text-left lg:text-right">
      <div className="text-[15px] font-black">{amountText}</div>

      {warningText ? (
        <div className="mt-0.5 text-[10px] font-black text-red-600">
          {warningText}
        </div>
      ) : null}
    </div>
  );
}
