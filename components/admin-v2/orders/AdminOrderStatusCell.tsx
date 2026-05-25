"use client";

import { showAdminToast } from "@/lib/adminToast";

import AdminOrderCriticalFlag from "@/components/admin-v2/orders/AdminOrderCriticalFlag";
import {
  getDeliveryStageStatusLabel,
  getDeliveryStageStatusValue,
} from "@/lib/admin-v2/statusDisplay";

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
  const normalizedStatus = String(status || "미설정").trim() || "미설정";
  const stageValue = getDeliveryStageStatusValue(normalizedStatus);

  const hiddenMeta = [
    statusLogCount > 0 ? `변경이력 ${statusLogCount}건` : "",
    showShippedTimeMissing ? "발송시간 미기록" : "",
  ].filter(Boolean).join(" / ");

  const handleChange = (nextStatus: string) => {
    if (nextStatus === stageValue) return;

    if (nextStatus === "미설정" && normalizedStatus !== "미설정") {
      showAdminToast("배송처리단계를 미설정으로 되돌리는 작업은 결제상태에 영향이 있을 수 있어 상세에서만 처리해주세요.", "warning");
      return;
    }

    onChange(nextStatus);
  };

  return (
    <div className="w-full text-center" title={hiddenMeta}>
      <select
        value={stageValue}
        onChange={(event) => handleChange(event.target.value)}
        className={`h-8 w-full max-w-[104px] rounded-lg border px-1 text-center text-[11px] font-black outline-none ${className}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label || getDeliveryStageStatusLabel(option.value)}
          </option>
        ))}
      </select>

      {showTrackingMissing ? <AdminOrderCriticalFlag text="송장없음" /> : null}
    </div>
  );
}
