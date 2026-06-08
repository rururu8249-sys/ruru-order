// components/customer/CustomerOrderLookupBottomSheet.tsx
// 목적: 주문서 화면 안에서 사용하는 고객 주문조회 바텀시트
// 주의: UI 전용. DB, API, 주문저장, 입금매칭, 정산, 배송 로직 없음. (시안 딥로즈 #7B2D43 인라인)

import type { CSSProperties } from "react";

export type CustomerOrderLookupFilter = "전체" | "입금대기" | "입금확인" | "출고완료" | "주문취소";

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

// 시안 배지색(정확 hex): 입금확인 초록#0F6E56 / 택배출고(출고완료) 파랑#185FA5 / 입금대기 노랑#854F0B / 주문취소 빨강#C0392B / 그 외(출고대기) 회색
const paymentChipStyle = (statusLabel: CustomerOrderLookupFilter): CSSProperties => {
  if (statusLabel === "입금확인") return { background: "#E1F5EE", color: "#0F6E56" };
  if (statusLabel === "출고완료") return { background: "#E6F1FB", color: "#185FA5" };
  if (statusLabel === "입금대기") return { background: "#FAEEDA", color: "#854F0B" };
  if (statusLabel === "주문취소") return { background: "#FBEAE7", color: "#C0392B" };
  return { background: "#EEEEEE", color: "#888888" };
};

const deliveryChipStyle = (deliveryLabel: string): CSSProperties => {
  if (/출고완료|택배출고|배송완료/.test(deliveryLabel)) return { background: "#185FA5", color: "#ffffff" };
  return { background: "#EEEEEE", color: "#888888" };
};

const chipBaseStyle: CSSProperties = { borderRadius: "999px", padding: "4px 10px", fontSize: "11px", fontWeight: 800 };
const pageArrowStyle: CSSProperties = { display: "flex", height: "40px", minWidth: "40px", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid #D9C5CC", background: "#fff", fontSize: "14px", fontWeight: 800, color: "#7B2D43", cursor: "pointer" };

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
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(15,23,42,0.45)", padding: "0 12px" }}
      role="dialog"
      aria-modal="true"
      aria-label="주문조회"
    >
      <section style={{ width: "100%", maxWidth: "430px", overflow: "hidden", borderTopLeftRadius: "28px", borderTopRightRadius: "28px", background: "#fff", boxShadow: "0 -22px 70px rgba(15,23,42,0.22)" }}>
        <div style={{ margin: "12px auto 0", height: "5px", width: "52px", borderRadius: "3px", background: "#E8E2DD" }} />

        <div style={{ display: "flex", maxHeight: "88dvh", flexDirection: "column" }}>
          <header style={{ flexShrink: 0, padding: "16px 16px 8px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", whiteSpace: "nowrap" }}>
              <h2 style={{ fontSize: "26px", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.08em", color: "#7B2D43" }}>주문조회</h2>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#999" }}>최근 7일 주문내역</span>
            </div>

            <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: `repeat(${filters.length}, 1fr)`, borderRadius: "14px", background: "#F5F1F2", padding: "4px", gap: "2px" }}>
              {filters.map((filter) => {
                const selected = activeFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => onFilterChange(filter)}
                    style={{ minHeight: "38px", borderRadius: "11px", border: "none", padding: "0 4px", fontSize: "12px", fontWeight: 800, cursor: "pointer", background: selected ? "#7B2D43" : "transparent", color: selected ? "#fff" : "#888", whiteSpace: "nowrap" }}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </header>

          <div style={{ minHeight: 0, overflowY: "auto", padding: "8px 16px" }}>
            {items.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {items.map((item) => {
                  const optionLine = [item.optionText, item.quantityText].filter(Boolean).join(" · ");
                  const deliveryLabel = item.deliveryLabel || (item.statusLabel === "출고완료" ? "출고완료" : "확인중");
                  const orderMeta = [item.orderCode, item.dateText].filter(Boolean).join(" · ");

                  return (
                    <article key={item.id} style={{ borderRadius: "16px", background: "#fff", border: "1px solid #E8E2DD", padding: "8px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <div style={{ display: "flex", minWidth: 0, alignItems: "center", gap: "6px" }}>
                          <span style={{ ...chipBaseStyle, ...paymentChipStyle(item.statusLabel) }}>{item.statusLabel}</span>
                          <span style={{ ...chipBaseStyle, ...deliveryChipStyle(deliveryLabel) }}>{deliveryLabel}</span>
                        </div>
                        <p style={{ flexShrink: 0, fontSize: "10px", fontWeight: 800, color: "#999" }}>결제금액</p>
                      </div>

                      <div style={{ marginTop: "6px", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "start", gap: "12px" }}>
                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "17px", fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.07em", color: "#222" }}>
                            {item.productName || "주문상품"}
                          </h3>
                          <p style={{ marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "13px", fontWeight: 800, letterSpacing: "-0.05em", color: "#888" }}>
                            {optionLine || "옵션 없음"}
                          </p>
                        </div>
                        <p style={{ maxWidth: "112px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingTop: "2px", textAlign: "right", fontSize: "19px", fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.08em", color: "#222" }}>
                          {item.amountText}
                        </p>
                      </div>

                      <div style={{ marginTop: "6px", display: "flex", minWidth: 0, alignItems: "center", borderRadius: "12px", background: "#FAF6F2", padding: "6px 12px" }}>
                        <p style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "11px", fontWeight: 800, color: "#888" }}>
                          {orderMeta || "-"}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div style={{ borderRadius: "16px", background: "#FAF6F2", padding: "20px", textAlign: "center", border: "1px solid #E8E2DD" }}>
                <p style={{ fontSize: "15px", fontWeight: 800, letterSpacing: "-0.05em", color: "#555" }}>선택한 상태의 주문내역이 없습니다.</p>
                <p style={{ marginTop: "4px", fontSize: "12px", fontWeight: 700, color: "#999" }}>다른 상태를 눌러 확인해주세요.</p>
              </div>
            )}

            <nav
              data-ruru-order-lookup-pagination="compact-v3"
              style={{ marginTop: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              aria-label="주문조회 페이지 이동"
            >
              <button type="button" onClick={() => onPageChange(Math.max(1, safePage - 1))} disabled={safePage <= 1} style={{ ...pageArrowStyle, opacity: safePage <= 1 ? 0.25 : 1, cursor: safePage <= 1 ? "default" : "pointer" }}>&lt;</button>

              <div style={{ display: "flex", height: "40px", minWidth: "112px", alignItems: "center", justifyContent: "center", borderRadius: "999px", background: "#FAF6F2", padding: "0 16px", fontSize: "15px", fontWeight: 800, letterSpacing: "-0.05em", color: "#555" }}>
                <span style={{ color: "#7B2D43" }}>{safePage}</span>
                <span style={{ margin: "0 8px", color: "#ccc" }}>/</span>
                <span>{safeTotalPages}</span>
              </div>

              <button type="button" onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))} disabled={safePage >= safeTotalPages} style={{ ...pageArrowStyle, opacity: safePage >= safeTotalPages ? 0.25 : 1, cursor: safePage >= safeTotalPages ? "default" : "pointer" }}>&gt;</button>
            </nav>
          </div>

          <footer style={{ display: "grid", flexShrink: 0, gridTemplateColumns: "0.78fr 1.22fr", columnGap: "8px", rowGap: "6px", borderTop: "1px solid #E8E2DD", background: "#fff", padding: "10px 16px calc(12px + env(safe-area-inset-bottom))" }}>
            <a
              href={BAND_TRACKING_URL}
              target="_blank"
              rel="noreferrer"
              style={{ gridColumn: "span 2", display: "flex", minHeight: "46px", alignItems: "center", gap: "10px", borderRadius: "14px", border: "1px solid #C8E6C9", background: "#EAF6EA", padding: "6px 12px", textDecoration: "none" }}
            >
              <div style={{ display: "flex", height: "36px", width: "36px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "#21c531", fontSize: "11px", fontWeight: 800, color: "#fff" }}>BAND</div>
              <p style={{ minWidth: 0, flex: 1, wordBreak: "keep-all", fontSize: "14px", fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.05em", color: "#1B5E20" }}>밴드에서 택배송장번호 확인 가능</p>
              <div style={{ flexShrink: 0, fontSize: "18px", fontWeight: 800, color: "#2E7D32" }}>›</div>
            </a>

            <button
              type="button"
              onClick={onClose}
              style={{ display: "flex", minHeight: "48px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "1px solid #D9C5CC", background: "#fff", padding: "0 12px", fontSize: "15px", fontWeight: 800, letterSpacing: "-0.05em", color: "#666", cursor: "pointer" }}
            >
              닫기
            </button>

            <button
              type="button"
              onClick={onOpenPaymentGuide}
              style={{ display: "flex", minHeight: "48px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "none", background: "#7B2D43", padding: "0 12px", fontSize: "15px", fontWeight: 800, letterSpacing: "-0.05em", color: "#fff", cursor: "pointer" }}
            >
              입금 계좌 보기
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}
