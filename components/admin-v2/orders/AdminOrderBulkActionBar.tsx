"use client";

// components/admin-v2/orders/AdminOrderBulkActionBar.tsx
// 목적: 주문관리 선택/일괄처리 바
// 주의: UI 액션 전달 전용. 주문/입금/배송/정산 DB 저장 로직 없음.

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
  onSoftDelete: () => void | Promise<void>;
};

export default function AdminOrderBulkActionBar({
  selectedCount,
  isAllSelected,
  onToggleAll,
  onClear,
  statusOptions,
  onApplyStatus,
  onSoftDelete,
}: AdminOrderBulkActionBarProps) {
  return (
    <div className="border-b border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={onToggleAll}
            className="h-4 w-4 rounded border-neutral-300 accent-neutral-950"
          />
          <span className="text-[14px] font-black text-neutral-800">전체선택</span>
        </label>

        <div className="h-6 w-px bg-neutral-200" />

        <div className="rounded-xl bg-neutral-950 px-4 py-2 text-[14px] font-black text-white">
          선택 {selectedCount}건
        </div>

        <button
          type="button"
          onClick={onClear}
          disabled={selectedCount <= 0}
          className="h-10 rounded-xl border border-neutral-200 bg-white px-4 text-[13px] font-black text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          선택 해제
        </button>

        <select
          disabled={selectedCount <= 0}
          onChange={(event) => {
            const nextStatus = event.target.value;
            if (!nextStatus) return;
            onApplyStatus(nextStatus);
            event.currentTarget.value = "";
          }}
          className="h-10 min-w-[220px] rounded-xl border border-neutral-200 bg-white px-3 text-[13px] font-black text-neutral-700 outline-none disabled:cursor-not-allowed disabled:opacity-40"
          defaultValue=""
        >
          <option value="" disabled>
            선택 주문 상태변경
          </option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onSoftDelete}
          disabled={selectedCount <= 0}
          className="h-10 rounded-xl border border-red-200 bg-white px-4 text-[13px] font-black text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          선택 취소주문 숨김
        </button>

        <div className="ml-auto text-[12px] font-bold text-neutral-500">
          숨김은 주문서취소 상태만 가능합니다. 실제 삭제가 아니라 목록 숨김 처리입니다.
        </div>
      </div>
    </div>
  );
}
