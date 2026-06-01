// components/customer/CustomerOrderLookupBottomSheet.tsx
// 목적: 주문서 화면 안에서 사용하는 고객 주문조회 바텀시트
// 주의: UI 전용. DB, API, 주문저장, 입금매칭, 정산, 배송 로직 없음.

export type CustomerOrderLookupFilter = "전체" | "입금대기" | "입금확인" | "출고완료";

const BAND_TRACKING_URL = "https://band.us/@ruru8249";

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

const clampPage = (page: number, totalPages: number) => {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Number.isFinite(page) ? page : 1;
  return Math.min(Math.max(1, safePage), safeTotalPages);
};

const paymentChipClassName = (statusLabel: CustomerOrderLookupFilter) => {
  if (statusLabel === "입금확인") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
  }

  if (statusLabel === "출고완료") {
    return "bg-blue-50 text-blue-700 ring-1 ring-blue-100";
  }

  if (statusLabel === "입금대기") {
    return "bg-orange-50 text-orange-700 ring-1 ring-orange-100";
  }

  return "bg-slate-100 text-slate-600 ring-1 ring-slate-100";
};

const deliveryChipClassName = (deliveryLabel: string) => {
  if (/출고완료|택배출고|배송완료/.test(deliveryLabel)) {
    return "bg-blue-600 text-white";
  }

  return "bg-slate-100 text-slate-500 ring-1 ring-slate-100";
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

  return (
    <div
      data-ruru-order-lookup-bottom-sheet="shell-v2"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/45 px-3"
      role="dialog"
      aria-modal="true"
      aria-label="주문조회"
    >
      <section className="w-full max-w-[430px] overflow-hidden rounded-t-[30px] bg-white shadow-[0_-22px_70px_rgba(15,23,42,0.22)]">
        <div className="mx-auto mt-3 h-1.5 w-14 rounded-full bg-slate-200" />

        <div className="flex h-[88dvh] max-h-[88dvh] flex-col">
          <header className="shrink-0 px-4 pb-2 pt-5">
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <h2 className="text-[26px] font-black leading-none tracking-[-0.08em] text-slate-950">
                주문조회
              </h2>
              <span className="text-[12px] font-black tracking-[-0.05em] text-slate-400">
                최근 7일 주문내역
              </span>
            </div>

            <div className="mt-4 grid grid-cols-4 rounded-[18px] bg-slate-50 p-1 ring-1 ring-slate-100">
              {filters.map((filter) => {
                const selected = activeFilter === filter;

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => onFilterChange(filter)}
                    className={
                      selected
                        ? "min-h-[38px] rounded-[15px] bg-blue-700 px-1.5 text-[12px] font-black tracking-[-0.05em] text-white shadow-[0_8px_18px_rgba(29,78,216,0.22)] transition active:scale-[0.98]"
                        : "min-h-[38px] rounded-[15px] px-1.5 text-[12px] font-black tracking-[-0.05em] text-slate-500 transition active:scale-[0.98]"
                    }
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-1">
            {items.length > 0 ? (
              <div className="grid gap-2.5">
                {items.map((item) => {
                  const optionLine = [item.optionText, item.quantityText].filter(Boolean).join(" · ");
                  const deliveryLabel =
                    item.deliveryLabel || (item.statusLabel === "출고완료" ? "출고완료" : "확인중");
                  const orderMeta = [item.orderCode, item.dateText].filter(Boolean).join(" · ");

                  return (
                    <article
                      key={item.id}
                      className="rounded-[22px] bg-white px-4 py-3 ring-1 ring-slate-200"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-black tracking-[-0.04em] ${paymentChipClassName(item.statusLabel)}`}
                          >
                            {item.statusLabel}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-black tracking-[-0.04em] ${deliveryChipClassName(deliveryLabel)}`}
                          >
                            {deliveryLabel}
                          </span>
                        </div>

                        <p className="shrink-0 text-[10px] font-black tracking-[-0.04em] text-slate-400">
                          결제금액
                        </p>
                      </div>

                      <div className="mt-2.5 grid grid-cols-[1fr_auto] items-start gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-[17px] font-black leading-tight tracking-[-0.07em] text-slate-950">
                            {item.productName || "주문상품"}
                          </h3>

                          <p className="mt-1 truncate text-[13px] font-black tracking-[-0.05em] text-slate-500">
                            {optionLine || "옵션 없음"}
                          </p>
                        </div>

                        <p className="max-w-[112px] truncate pt-0.5 text-right text-[19px] font-black leading-tight tracking-[-0.08em] text-slate-950">
                          {item.amountText}
                        </p>
                      </div>

                      <div className="mt-2.5 flex min-w-0 items-center rounded-[14px] bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                        <p className="min-w-0 flex-1 truncate text-[11px] font-black tracking-[-0.04em] text-slate-500">
                          {orderMeta || "-"}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[22px] bg-slate-50 p-5 text-center ring-1 ring-slate-100">
                <p className="text-[15px] font-black tracking-[-0.05em] text-slate-700">
                  선택한 상태의 주문내역이 없습니다.
                </p>
                <p className="mt-1 text-[12px] font-bold tracking-[-0.04em] text-slate-400">
                  다른 상태를 눌러 확인해주세요.
                </p>
              </div>
            )}

            <nav
              data-ruru-order-lookup-pagination="compact-v3"
              className="mt-3 flex items-center justify-center gap-2"
              aria-label="주문조회 페이지 이동"
            >
              <button
                type="button"
                onClick={() => onPageChange(Math.max(1, safePage - 1))}
                disabled={safePage <= 1}
                className="flex h-10 min-w-10 items-center justify-center rounded-full bg-white px-3 text-[14px] font-black text-slate-500 ring-1 ring-slate-200 transition active:scale-[0.97] disabled:opacity-25"
              >
                &lt;
              </button>

              <div className="flex h-10 min-w-[112px] items-center justify-center rounded-full bg-slate-50 px-4 text-[15px] font-black tracking-[-0.05em] text-slate-700 ring-1 ring-slate-100">
                <span className="text-blue-700">{safePage}</span>
                <span className="mx-2 text-slate-300">/</span>
                <span>{safeTotalPages}</span>
              </div>

              <button
                type="button"
                onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
                disabled={safePage >= safeTotalPages}
                className="flex h-10 min-w-10 items-center justify-center rounded-full bg-white px-3 text-[14px] font-black text-slate-500 ring-1 ring-slate-200 transition active:scale-[0.97] disabled:opacity-25"
              >
                &gt;
              </button>
            </nav>
          </div>

          <footer className="grid shrink-0 grid-cols-[0.78fr_1.22fr] gap-x-2 gap-y-2 border-t border-slate-100 bg-white px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3">
            <a
              href={BAND_TRACKING_URL}
              target="_blank"
              rel="noreferrer"
              className="col-span-2 flex items-center gap-3 rounded-[18px] border border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 px-3.5 py-2.5 shadow-sm transition active:scale-[0.98]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#21c531] text-[12px] font-black tracking-[-0.04em] text-white shadow-sm">
                BAND
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-black leading-tight tracking-[-0.05em] text-green-800">
                  밴드에서 송장 확인
                </p>
                <p className="mt-0.5 break-keep text-[11px] font-bold leading-relaxed tracking-[-0.04em] text-green-700">
                  택배출고 완료 후 당일 저녁 밴드에서 택배송장번호 확인 가능!
                </p>
              </div>

              <div className="shrink-0 text-[19px] font-black text-green-700">
                ›
              </div>
            </a>

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
