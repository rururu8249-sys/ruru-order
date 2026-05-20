"use client";

type StatusOption = {
  value: string;
  label: string;
};

type AdminOrderBulkActionBarProps = {
  selectedCount: number;
  isAllSelected: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  statusOptions: StatusOption[];
  onApplyStatus: (nextStatus: string) => void;
};

export default function AdminOrderBulkActionBar({
  selectedCount,
  isAllSelected,
  onToggleAll,
  onClear,
  statusOptions,
  onApplyStatus,
}: AdminOrderBulkActionBarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3">
      <button
        type="button"
        onClick={onToggleAll}
        className="h-9 rounded-xl border border-neutral-300 bg-white px-3 text-[13px] font-black text-neutral-800 active:scale-[0.98]"
      >
        {isAllSelected ? "현재 목록 선택해제" : "현재 목록 전체선택"}
      </button>

      <div className="h-9 rounded-xl bg-neutral-950 px-3 py-2 text-[13px] font-black text-white">
        선택 {selectedCount}건
      </div>

      <button
        type="button"
        onClick={onClear}
        disabled={selectedCount <= 0}
        className="h-9 rounded-xl border border-neutral-300 bg-white px-3 text-[13px] font-black text-neutral-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"
      >
        선택 해제
      </button>

      <select
        defaultValue=""
        disabled={selectedCount <= 0}
        onChange={(event) => {
          const nextStatus = event.target.value;
          if (!nextStatus) return;
          onApplyStatus(nextStatus);
          event.currentTarget.value = "";
        }}
        className="h-9 min-w-[170px] rounded-xl border border-neutral-300 bg-white px-3 text-[13px] font-black text-neutral-800 outline-none disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"
      >
        <option value="">선택 주문 상태변경</option>
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <div className="text-[12px] font-bold text-neutral-500">
        체크한 주문만 일괄 변경됩니다.
      </div>
    </div>
  );
}
