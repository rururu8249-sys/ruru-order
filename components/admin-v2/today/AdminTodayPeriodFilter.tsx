"use client";

// components/admin-v2/today/AdminTodayPeriodFilter.tsx
// 목적: 오늘할일 페이지 전체 기간설정 UI
// 주의: 화면 필터 전용. 저장/입금확인/정산/배송 로직 없음.

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
    <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-black text-neutral-950">기간설정</span>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
              적용중: {appliedLabel}
            </span>
          </div>
          <p className="mt-1 text-xs font-bold text-neutral-500">
            확인을 누르면 오늘할일 페이지 전체가 선택 기간 기준으로 바뀝니다.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">
            <span className="text-[11px] font-black text-neutral-500">시작일</span>
            <input
              type="date"
              value={draftStartDate}
              onChange={(event) => onDraftStartDateChange(event.target.value)}
              className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-neutral-950"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-[11px] font-black text-neutral-500">종료일</span>
            <input
              type="date"
              value={draftEndDate}
              onChange={(event) => onDraftEndDateChange(event.target.value)}
              className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-neutral-950"
            />
          </label>

          <button
            type="button"
            onClick={onApply}
            className="h-10 rounded-xl bg-neutral-950 px-4 text-sm font-black text-white active:scale-[0.98]"
          >
            확인
          </button>

          <button
            type="button"
            onClick={onResetToday}
            className="h-10 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-700 active:scale-[0.98]"
          >
            오늘
          </button>
        </div>
      </div>
    </div>
  );
}
