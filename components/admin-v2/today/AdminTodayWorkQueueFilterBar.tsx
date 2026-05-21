"use client";

// components/admin-v2/today/AdminTodayWorkQueueFilterBar.tsx
// 목적: 오늘 입금 빠른처리 날짜/검색 필터 UI
// 주의: UI 입력 전용. 주문상태 저장, 입금매칭 저장, 자동입금확인, 금액계산 변경 없음.

type Props = {
  keyword: string;
  startDate: string;
  endDate: string;
  totalCount: number;
  filteredCount: number;
  onKeywordChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onReset: () => void;
};

export default function AdminTodayWorkQueueFilterBar({
  keyword,
  startDate,
  endDate,
  totalCount,
  filteredCount,
  onKeywordChange,
  onStartDateChange,
  onEndDateChange,
  onReset,
}: Props) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black text-neutral-950">날짜 / 검색 필터</div>
          <div className="mt-0.5 text-xs font-bold text-neutral-500">
            검색결과 {filteredCount.toLocaleString()}건 / 전체 {totalCount.toLocaleString()}건
          </div>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="h-9 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 active:scale-[0.98]"
        >
          초기화
        </button>
      </div>

      <div className="mt-3 grid gap-2 xl:grid-cols-[150px_150px_1fr]">
        <label className="grid gap-1">
          <span className="text-[11px] font-black text-neutral-500">시작일</span>
          <input
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-neutral-950"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-[11px] font-black text-neutral-500">종료일</span>
          <input
            type="date"
            value={endDate}
            onChange={(event) => onEndDateChange(event.target.value)}
            className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-neutral-950"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-[11px] font-black text-neutral-500">검색</span>
          <input
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="닉네임 / 이름 / 상품명 / 주문번호 / 금액 검색"
            className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-neutral-950"
          />
        </label>
      </div>
    </div>
  );
}
