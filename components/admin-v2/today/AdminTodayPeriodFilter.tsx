"use client";

// components/admin-v2/today/AdminTodayPeriodFilter.tsx
// 목적: 오늘할일 최상단 제목줄 옆 기간설정 UI
// 주의: 화면 필터 전용. 저장/입금확인/정산/배송/돈계산 로직 없음.

type Props = {
  draftStartDate: string;
  draftEndDate: string;
  appliedLabel: string;
  onDraftStartDateChange: (value: string) => void;
  onDraftEndDateChange: (value: string) => void;
  onApply: () => void;
  onResetToday: () => void;
};

export default function AdminTodayPeriodFilter({
  draftStartDate,
  draftEndDate,
  appliedLabel,
  onDraftStartDateChange,
  onDraftEndDateChange,
  onApply,
  onResetToday,
}: Props) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-2">
      <span className="whitespace-nowrap text-xs font-black text-neutral-700">기간설정</span>

      <input
        type="date"
        value={draftStartDate}
        onChange={(event) => onDraftStartDateChange(event.target.value)}
        className="h-8 w-[132px] rounded-full border border-neutral-200 bg-white px-2 text-xs font-black text-neutral-800 outline-none focus:border-neutral-950"
        aria-label="시작일"
      />

      <span className="text-xs font-black text-neutral-400">~</span>

      <input
        type="date"
        value={draftEndDate}
        onChange={(event) => onDraftEndDateChange(event.target.value)}
        className="h-8 w-[132px] rounded-full border border-neutral-200 bg-white px-2 text-xs font-black text-neutral-800 outline-none focus:border-neutral-950"
        aria-label="종료일"
      />

      <button
        type="button"
        onClick={onApply}
        className="h-8 rounded-full bg-neutral-950 px-3 text-xs font-black text-white active:scale-[0.98]"
      >
        확인
      </button>

      <button
        type="button"
        onClick={onResetToday}
        className="h-8 rounded-full border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 active:scale-[0.98]"
      >
        오늘
      </button>

      <span className="hidden whitespace-nowrap text-[11px] font-black text-neutral-400 2xl:inline">
        {appliedLabel}
      </span>
    </div>
  );
}
