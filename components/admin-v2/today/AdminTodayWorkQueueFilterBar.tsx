"use client";

// components/admin-v2/today/AdminTodayWorkQueueFilterBar.tsx
// 목적: 오늘 입금 빠른처리 안쪽 검색 UI
// 주의: 검색 전용. 날짜는 상단 기간설정에서만 관리.

type Props = {
  draftKeyword: string;
  appliedKeyword: string;
  totalCount: number;
  filteredCount: number;
  onDraftKeywordChange: (value: string) => void;
  onSearch: () => void;
  onReset: () => void;
};

export default function AdminTodayWorkQueueFilterBar({
  draftKeyword,
  appliedKeyword,
  totalCount,
  filteredCount,
  onDraftKeywordChange,
  onSearch,
  onReset,
}: Props) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black text-neutral-950">검색 필터</div>
          <div className="mt-0.5 text-xs font-bold text-neutral-500">
            검색결과 {filteredCount.toLocaleString()}건 / 기간 내 전체 {totalCount.toLocaleString()}건
            {appliedKeyword ? ` · 검색어: ${appliedKeyword}` : ""}
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

      <div className="mt-3 grid gap-2 xl:grid-cols-[1fr_90px]">
        <input
          value={draftKeyword}
          onChange={(event) => onDraftKeywordChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSearch();
          }}
          placeholder="닉네임 / 이름 / 상품명 / 주문번호 / 금액 검색"
          className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-neutral-950"
        />

        <button
          type="button"
          onClick={onSearch}
          className="h-11 rounded-xl bg-neutral-950 px-4 text-sm font-black text-white active:scale-[0.98]"
        >
          검색
        </button>
      </div>
    </div>
  );
}
