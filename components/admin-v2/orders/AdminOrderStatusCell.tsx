"use client";

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
  return (
    <div>
      <select
        value={status}
        onChange={(event) => onChange(event.target.value)}
        className={`h-8 w-full rounded-lg border px-2 text-center text-xs font-black outline-none ${className}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {statusLogCount > 0 ? (
        <div className="mt-0.5 text-center text-[10px] font-black text-blue-700">
          상태변경 {statusLogCount}건
        </div>
      ) : null}

      {showTrackingMissing ? (
        <div className="mt-0.5 text-center text-[10px] font-black text-red-600">
          송장없음
        </div>
      ) : null}

      {showShippedTimeMissing ? (
        <div className="mt-0.5 text-center text-[10px] font-black text-red-600">
          출고시간없음
        </div>
      ) : null}
    </div>
  );
}
