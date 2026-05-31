// components/customer/CustomerOrderLookupBottomSheet.tsx
// 목적: 주문서 화면 안에서 사용하는 고객 주문조회 바텀시트
// 주의: UI 전용. DB, API, 주문저장, 입금매칭, 정산, 배송 로직 없음.

export type CustomerOrderLookupFilter = "전체" | "입금대기" | "입금확인" | "출고완료";

export type CustomerOrderLookupItem = {
  id: string | number;
  productName: string;
  optionText?: string;
  quantityText?: string;
  amountText: string;
  statusLabel: CustomerOrderLookupFilter;
  deliveryLabel?: string;
  dateText: string;
  orderCode?: string;
};

type CustomerOrderLookupBottomSheetProps = {
  open: boolean;
  items: CustomerOrderLookupItem[];
  activeFilter: CustomerOrderLookupFilter;
  page: number;
  totalPages: number;
  filters: readonly CustomerOrderLookupFilter[];
  onFilterChange: (filter: CustomerOrderLookupFilter) => void;
  onPageChange: (page: number) => void;
  onClose: () => void;
  onOpenPaymentGuide: () => void;
};

const PAGE_RANGE_LIMIT = 5;

const clampPage = (page: number, totalPages: number) => {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Number.isFinite(page) ? page : 1;
  return Math.min(Math.max(1, safePage), safeTotalPages);
};

const buildPaginationItems = (page: number, totalPages: number): Array<number | "..."> => {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = clampPage(page, safeTotalPages);

  if (safeTotalPages <= PAGE_RANGE_LIMIT) {
    return Array.from({ length: safeTotalPages }, (_, index) => index + 1);
  }

  const items: Array<number | "..."> = [1];

  const start = Math.max(2, safePage - 1);
  const end = Math.min(safeTotalPages - 1, safePage + 1);

  if (start > 2) items.push("...");

  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    items.push(pageNumber);
  }

  if (end < safeTotalPages - 1) items.push("...");

  items.push(safeTotalPages);

  return items;
};

const statusClassName = (statusLabel: CustomerOrderLookupFilter) => {
  if (statusLabel === "출고완료") {
    return "bg-blue-600 text-white";
  }

  if (statusLabel === "입금확인") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
  }

  if (statusLabel === "입금대기") {
    return "bg-orange-50 text-orange-700 ring-1 ring-orange-100";
  }

  return "bg-slate-100 text-slate-600 ring-1 ring-slate-100";
};

export default function CustomerOrderLookupBottomSheet({
  open,
  items,
  activeFilter,
  page,
  totalPages,
  filters,
  onFilterChange,
  onPageChange,
  onClose,
  onOpenPaymentGuide,
}: CustomerOrderLookupBottomSheetProps) {
  if (!open) return null;

  const safeTotalPages = Math.max(1, totalPages);
  const safePage = clampPage(page, safeTotalPages);
  const paginationItems = buildPaginationItems(safePage, safeTotalPages);

  return (
    <div
      data-ruru-order-lookup-bottom-sheet="shell-v1"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/45 px-3"
      role="dialog"
      aria-modal="true"
      aria-label="주문조회"
    >
      <section className="w-full max-w-[430px] overflow-hidden rounded-t-[30px] bg-white shadow-[0_-22px_70px_rgba(15,23,42,0.22)]">
        <div className="mx-auto mt-3 h-1.5 w-14 rounded-full bg-slate-200" />

        <div className="flex max-h-[86dvh] flex-col">
          <header className="shrink-0 px-4 pb-3 pt-5">
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <h2 className="text-[25px] font-black leading-tight tracking-[-0.07em] text-slate-950">
                주문조회
              </h2>
              <span className="text-[12px] font-bold tracking-[-0.04em] text-slate-400">
                최근 7일 주문내역
              </span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {filters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => onFilterChange(filter)}
                  className={
                    activeFilter === filter
                      ? "min-h-[34px] rounded-full bg-blue-700 px-2 text-[11px] font-black tracking-[-0.04em] text-white transition active:scale-[0.98]"
                      : "min-h-[34px] rounded-full bg-slate-50 px-2 text-[11px] font-black tracking-[-0.04em] text-slate-600 ring-1 ring-slate-100 transition active:scale-[0.98]"
                  }
                >
                  {filter}
                </button>
              ))}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
            {items.length > 0 ? (
              <div className="grid gap-2.5">
                {items.map((item) => {
                  const optionLine = [item.optionText, item.quantityText].filter(Boolean).join(" · ");
                  const deliveryLabel = item.deliveryLabel || (item.statusLabel === "출고완료" ? "출고완료" : "확인중");

                  return (
                    <article
                      key={item.id}
                      className="overflow-hidden rounded-[18px] bg-white p-3 ring-1 ring-slate-200"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`rounded-full px-2 py-1 text-[11px] font-black tracking-[-0.04em] ${statusClassName(item.statusLabel)}`}>
                              {item.statusLabel}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black tracking-[-0.04em] text-slate-500">
                              {deliveryLabel}
                            </span>
                          </div>

                          <h3 className="mt-2 truncate text-[15px] font-black leading-snug tracking-[-0.05em] text-slate-950">
                            {item.productName || "주문상품"}
                          </h3>

                          {optionLine ? (
                            <p className="mt-1 truncate text-[12px] font-bold tracking-[-0.04em] text-slate-500">
                              {optionLine}
                            </p>
                          ) : null}
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-[11px] font-bold tracking-[-0.04em] text-slate-400">
                            결제금액
                          </p>
                          <p className="mt-1 max-w-[112px] truncate text-[17px] font-black tracking-[-0.06em] text-slate-950">
                            {item.amountText}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 rounded-[14px] bg-slate-50 px-3 py-2 text-[11px] font-bold tracking-[-0.04em] text-slate-500 ring-1 ring-slate-100">
                        <div className="min-w-0">
                          <p className="text-slate-400">주문일</p>
                          <p className="mt-0.5 truncate font-black text-slate-700">
                            {item.dateText}
                          </p>
                        </div>

                        <div className="min-w-0 text-right">
                          <p className="text-slate-400">주문번호</p>
                          <p className="mt-0.5 truncate font-black text-slate-700">
                            {item.orderCode || "-"}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[20px] bg-slate-50 p-5 text-center ring-1 ring-slate-100">
                <p className="text-[14px] font-black tracking-[-0.04em] text-slate-700">
                  선택한 상태의 주문내역이 없습니다.
                </p>
              </div>
            )}

            <nav
              data-ruru-order-lookup-pagination="shell-v1"
              className="mt-3 flex items-center justify-center gap-1"
              aria-label="주문조회 페이지 이동"
            >
              <button
                type="button"
                onClick={() => onPageChange(Math.max(1, safePage - 1))}
                disabled={safePage <= 1}
                className="flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-50 px-2 text-[12px] font-black text-slate-500 ring-1 ring-slate-100 disabled:opacity-35"
              >
                &lt;
              </button>

              {paginationItems.map((paginationItem, index) =>
                paginationItem === "..." ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="flex h-8 min-w-8 items-center justify-center text-[12px] font-black text-slate-400"
                  >
                    ..
                  </span>
                ) : (
                  <button
                    key={paginationItem}
                    type="button"
                    onClick={() => onPageChange(paginationItem)}
                    className={
                      safePage === paginationItem
                        ? "flex h-8 min-w-8 items-center justify-center rounded-full bg-blue-700 px-2 text-[12px] font-black text-white"
                        : "flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-50 px-2 text-[12px] font-black text-slate-600 ring-1 ring-slate-100"
                    }
                  >
                    {paginationItem}
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
                disabled={safePage >= safeTotalPages}
                className="flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-50 px-2 text-[12px] font-black text-slate-500 ring-1 ring-slate-100 disabled:opacity-35"
              >
                &gt;
              </button>
            </nav>
          </div>

          <footer className="grid shrink-0 grid-cols-[0.75fr_1.25fr] gap-2 border-t border-slate-100 bg-white px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[50px] items-center justify-center rounded-[18px] bg-slate-100 px-3 text-[15px] font-black tracking-[-0.05em] text-slate-700 transition active:scale-[0.98]"
            >
              닫기
            </button>

            <button
              type="button"
              onClick={onOpenPaymentGuide}
              className="flex min-h-[50px] items-center justify-center rounded-[18px] bg-blue-600 px-3 text-[15px] font-black tracking-[-0.05em] text-white shadow-[0_12px_28px_rgba(37,99,235,0.22)] transition active:scale-[0.98]"
            >
              입금 계좌 보기
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}
