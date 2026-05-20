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
        className={`h-8 w-full rounded-md border px-1.5 text-center text-[11px] font-black outline-none ${className}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {statusLogCount > 0 ? (
        <div className="mt-0.5 text-center text-[10px] font-black text-blue-700">
          변경 {statusLogCount}
        </div>
      ) : null}

      {showTrackingMissing ? (
        <div className="mt-0.5 text-center text-[10px] font-black text-red-600">
          송장없음
        </div>
      ) : null}

      {showShippedTimeMissing ? (
        <div className="mt-0.5 text-center text-[10px] font-black text-red-600">
          시간없음
        </div>
      ) : null}
    </div>
  );
}
