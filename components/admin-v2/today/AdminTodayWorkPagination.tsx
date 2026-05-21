"use client";

// components/admin-v2/today/AdminTodayWorkPagination.tsx
// 목적: 오늘 입금 빠른처리 목록 페이지 번호 표시

export default function AdminTodayWorkPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-black text-neutral-600 disabled:opacity-40"
      >
        이전
      </button>

      {pages.slice(0, 8).map((pageNumber) => (
        <button
          key={pageNumber}
          type="button"
          onClick={() => onChange(pageNumber)}
          className={[
            "min-w-10 rounded-xl px-3 py-2 text-xs font-black active:scale-[0.98]",
            pageNumber === page
              ? "bg-neutral-950 text-white"
              : "border border-neutral-200 bg-white text-neutral-700",
          ].join(" ")}
        >
          {pageNumber}
        </button>
      ))}

      {totalPages > 8 ? (
        <span className="px-2 text-xs font-black text-neutral-400">...</span>
      ) : null}

      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-black text-neutral-600 disabled:opacity-40"
      >
        다음
      </button>
    </div>
  );
}
