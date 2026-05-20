// components/myorder/MyOrderPagination.tsx
// 목적: 주문조회 최근 주문내역 모바일 페이지네이션 UI
// 주의: UI 전용. Supabase 조회, 주문 상태, 금액 계산 로직 없음.

type MyOrderPaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export default function MyOrderPagination({
  page,
  totalPages,
  onPageChange,
}: MyOrderPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 rounded-[24px] bg-white p-3 shadow-[0_10px_24px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="mb-3 text-center text-[13px] font-black text-slate-500">
        주문내역 페이지
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {Array.from({ length: totalPages }, (_, index) => {
          const pageNumber = index + 1;
          const active = pageNumber === page;

          return (
            <button
              key={pageNumber}
              type="button"
              onClick={() => onPageChange(pageNumber)}
              className={`h-10 min-w-10 rounded-2xl px-3 text-[14px] font-black active:scale-[0.98] ${
                active
                  ? "bg-blue-600 text-white shadow-[0_10px_20px_rgba(37,99,235,0.22)]"
                  : "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
              }`}
            >
              {pageNumber}
            </button>
          );
        })}
      </div>
    </div>
  );
}
