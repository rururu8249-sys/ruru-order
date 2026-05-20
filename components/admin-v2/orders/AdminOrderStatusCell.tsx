"use client";

import AdminOrderCriticalFlag from "@/components/admin-v2/orders/AdminOrderCriticalFlag";

type StatusOption = {
  value: string;
  label: string;
};

type AdminOrderStatusCellProps = {
  status: string;
  options: StatusOption[];
  className: string;
  statusLogCount: number;
  showTrackingMissing: boolean;
  showShippedTimeMissing: boolean;
  onChange: (nextStatus: string) => void;
};

export default function AdminOrderStatusCell({
  status,
  options,
  className,
  statusLogCount,
  showTrackingMissing,
  showShippedTimeMissing,
  onChange,
}: AdminOrderStatusCellProps) {
  const hiddenMeta = [
    statusLogCount > 0 ? `변경이력 ${statusLogCount}건` : "",
    showShippedTimeMissing ? "출고시간 미기록" : "",
  ].filter(Boolean).join(" / ");

  return (
    <div title={hiddenMeta}>
      <select
        value={status}
        onChange={(event) => onChange(event.target.value)}
        className={`h-8 w-full min-w-[84px] rounded-md border px-1.5 text-center text-[11px] font-black outline-none ${className}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {showTrackingMissing ? <AdminOrderCriticalFlag text="송장없음" /> : null}
    </div>
  );
}
