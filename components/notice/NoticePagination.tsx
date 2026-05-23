// components/notice/NoticePagination.tsx
// 목적: 공지사항 목록 모바일 페이지네이션 UI
// 주의: UI 전용. Supabase, 공지 저장/수정/삭제 로직 없음.

type NoticePaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export default function NoticePagination({
  currentPage,
  totalPages,
  onPageChange,
}: NoticePaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <nav className="mt-5 flex flex-wrap items-center justify-center gap-2" aria-label="공지 페이지">
      {pages.map((page) => {
        const active = page === currentPage;

        return (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            className={[
              "flex h-11 min-w-11 items-center justify-center rounded-2xl px-4 text-[15px] font-black transition active:scale-[0.97]",
              active
                ? "bg-blue-600 text-white shadow-[0_10px_22px_rgba(37,99,235,0.25)]"
                : "bg-white text-slate-700 ring-1 ring-blue-100",
            ].join(" ")}
          >
            {page}
          </button>
        );
      })}
    </nav>
  );
}
