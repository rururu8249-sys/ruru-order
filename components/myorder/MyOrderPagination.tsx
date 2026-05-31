// components/myorder/MyOrderPagination.tsx
// 목적: 주문조회 최근 주문내역 모바일 페이지네이션 UI
// 주의: Supabase 조회, 주문 상태, 금액 계산 로직 없음.

type MyOrderPaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

type PaginationItem = number | "...";

export default function MyOrderPagination({
  page,
  totalPages,
  onPageChange,
}: MyOrderPaginationProps) {
  if (totalPages <= 1) return null;

  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginationItems: PaginationItem[] = [];

  const pushPage = (pageNumber: number) => {
    if (!paginationItems.includes(pageNumber)) {
      paginationItems.push(pageNumber);
    }
  };

  pushPage(1);

  for (let pageNumber = safePage - 1; pageNumber <= safePage + 1; pageNumber += 1) {
    if (pageNumber > 1 && pageNumber < totalPages) {
      pushPage(pageNumber);
    }
  }

  if (totalPages > 1) {
    pushPage(totalPages);
  }

  const sortedPages = paginationItems
    .filter((item): item is number => typeof item === "number")
    .sort((a, b) => a - b);

  const displayItems: PaginationItem[] = [];
  sortedPages.forEach((pageNumber, index) => {
    const previous = sortedPages[index - 1];

    if (index > 0 && pageNumber - previous > 1) {
      displayItems.push("...");
    }

    displayItems.push(pageNumber);
  });

  const buttonBaseClass =
    "h-9 min-w-9 rounded-full px-3 text-[13px] font-black tracking-[-0.04em] transition active:scale-[0.98]";
  const activeClass = "bg-blue-700 text-white shadow-[0_8px_18px_rgba(37,99,235,0.20)]";
  const inactiveClass = "bg-white text-slate-700 ring-1 ring-slate-200";
  const disabledClass = "cursor-not-allowed bg-slate-100 text-slate-400 ring-1 ring-slate-100";

  return (
    <nav
      data-ruru-myorder-pagination="compact"
      className="mt-4 rounded-[20px] bg-slate-50 p-3 ring-1 ring-slate-100"
      aria-label="주문내역 페이지"
    >
      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          className={`${buttonBaseClass} ${safePage <= 1 ? disabledClass : inactiveClass}`}
          aria-label="이전 페이지"
        >
          &lt;
        </button>

        {displayItems.map((item, index) =>
          item === "..." ? (
            <span
              key={`ellipsis-${index}`}
              className="flex h-9 min-w-7 items-center justify-center text-[13px] font-black text-slate-400"
            >
              ...
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              className={`${buttonBaseClass} ${item === safePage ? activeClass : inactiveClass}`}
              aria-current={item === safePage ? "page" : undefined}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          className={`${buttonBaseClass} ${safePage >= totalPages ? disabledClass : inactiveClass}`}
          aria-label="다음 페이지"
        >
          &gt;
        </button>
      </div>
    </nav>
  );
}
