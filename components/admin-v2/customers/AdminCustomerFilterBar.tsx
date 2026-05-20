"use client";

// components/admin-v2/customers/AdminCustomerFilterBar.tsx
// 목적: 고객관리 검색/필터/정렬 바
// 주의: UI 전용. 고객 차단 저장, 주문/정산/입금 로직 없음.

type AdminCustomerFilterBarProps = {
  keyword: string;
  setKeyword: (value: string) => void;
  blockFilter: "all" | "normal" | "blocked";
  setBlockFilter: (value: "all" | "normal" | "blocked") => void;
  sortKey: "last_order" | "created" | "nickname" | "name";
  setSortKey: (value: "last_order" | "created" | "nickname" | "name") => void;
  totalCount: number;
  filteredCount: number;
};

export default function AdminCustomerFilterBar({
  keyword,
  setKeyword,
  blockFilter,
  setBlockFilter,
  sortKey,
  setSortKey,
  totalCount,
  filteredCount,
}: AdminCustomerFilterBarProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black tracking-[-0.04em] text-neutral-950">
            고객관리
          </h2>
          <p className="mt-1 text-xs font-bold text-neutral-500">
            닉네임·이름·전화번호로 빠르게 찾고, 고객을 클릭하면 상세정보를 확인합니다.
          </p>
        </div>

        <div className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white">
          {filteredCount.toLocaleString()}명 / 전체 {totalCount.toLocaleString()}명
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_150px_170px]">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="닉네임 / 이름 / 전화번호 검색"
          className="h-11 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-black outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
        />

        <select
          value={blockFilter}
          onChange={(event) => setBlockFilter(event.target.value as "all" | "normal" | "blocked")}
          className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-blue-500"
        >
          <option value="all">전체 고객</option>
          <option value="normal">정상 고객</option>
          <option value="blocked">차단 고객</option>
        </select>

        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as "last_order" | "created" | "nickname" | "name")}
          className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-blue-500"
        >
          <option value="last_order">최근 주문순</option>
          <option value="created">가입/등록 최신순</option>
          <option value="nickname">닉네임순</option>
          <option value="name">이름순</option>
        </select>
      </div>
    </section>
  );
}
