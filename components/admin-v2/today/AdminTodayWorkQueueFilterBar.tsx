"use client";

// components/admin-v2/today/AdminTodayWorkQueueFilterBar.tsx
// 목적: 오늘할일 빠른처리 검색 UI
// 주의: 검색 전용. 날짜는 상단 기간설정에서만 관리. DB 저장/입금매칭/정산 로직 없음.

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
    <div className="grid min-w-0 gap-1.5 rounded-2xl border border-neutral-200 bg-neutral-50 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-black text-neutral-950">검색 필터</div>
          <div className="truncate text-[11px] font-bold text-neutral-400">
            검색결과 {filteredCount.toLocaleString()}건 / 전체 {totalCount.toLocaleString()}건
            {appliedKeyword ? ` · "${appliedKeyword}"` : ""}
          </div>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="h-8 shrink-0 rounded-xl border border-neutral-200 bg-white px-3 text-[11px] font-black text-neutral-600 active:scale-[0.98]"
        >
          초기화
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          value={draftKeyword}
          onChange={(event) => onDraftKeywordChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSearch();
          }}
          placeholder="닉네임 / 이름 / 상품명 / 주문번호"
          className="h-10 min-w-0 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
        />

        <button
          type="button"
          onClick={onSearch}
          className="h-10 rounded-xl bg-neutral-950 px-4 text-xs font-black text-white active:scale-[0.98]"
        >
          검색
        </button>
      </div>
    </div>
  );
}
