// components/customer/CustomerOrderLookupBottomSheet.tsx
// 목적: 주문서 화면 안에서 사용하는 고객 주문조회 바텀시트 (order_group_id 단위 그룹 표시 + 무한 스크롤)
// 주의: UI 전용. DB, API, 주문저장, 입금매칭, 정산, 배송 로직 없음. (시안 딥로즈 #7B2D43 인라인)

import { useEffect, useRef, type CSSProperties } from "react";

export type CustomerOrderLookupFilter = "전체" | "입금대기" | "입금완료" | "출고완료" | "주문취소";

const BAND_TRACKING_URL = "https://band.us/@ruru8249";

export type CustomerOrderLookupGroupProduct = {
  name: string;
  optionText?: string;
  quantityText?: string;
  amountText?: string;
};

export type CustomerOrderLookupGroup = {
  id: string | number;
  orderCode?: string;
  dateText: string;
  statusLabel: CustomerOrderLookupFilter;
  statusDisplayText: string;
  deliveryLabel?: string;
  paymentMethodLabel?: string;
  productAmountText?: string;
  shippingFeeText?: string;
  cardExtraText?: string;
  totalAmountText: string;
  products: CustomerOrderLookupGroupProduct[];
};

type CustomerOrderLookupBottomSheetProps = {
  open: boolean;
  groups: CustomerOrderLookupGroup[];
  activeFilter: CustomerOrderLookupFilter;
  filters: readonly CustomerOrderLookupFilter[];
  hasMore: boolean;
  onFilterChange: (filter: CustomerOrderLookupFilter) => void;
  onLoadMore: () => void;
  onClose: () => void;
  onOpenPaymentGuide: () => void;
};

// 시안 배지색(정확 hex): 입금완료 초록#0F6E56 / 출고완료 파랑#185FA5 / 입금대기 노랑#854F0B / 주문취소 빨강#C0392B / 그 외 회색
// (카결완료는 입금완료 카테고리=초록, 카결대기는 입금대기 카테고리=노랑으로 묶임)
const paymentChipStyle = (statusLabel: CustomerOrderLookupFilter): CSSProperties => {
  if (statusLabel === "입금완료") return { background: "#E1F5EE", color: "#0F6E56" };
  if (statusLabel === "출고완료") return { background: "#E6F1FB", color: "#185FA5" };
  if (statusLabel === "입금대기") return { background: "#FAEEDA", color: "#854F0B" };
  if (statusLabel === "주문취소") return { background: "#FBEAE7", color: "#C0392B" };
  return { background: "#EEEEEE", color: "#888888" };
};

const chipBaseStyle: CSSProperties = { borderRadius: "999px", padding: "4px 10px", fontSize: "11px", fontWeight: 800 };

export default function CustomerOrderLookupBottomSheet({
  open,
  groups,
  activeFilter,
  filters,
  hasMore,
  onFilterChange,
  onLoadMore,
  onClose,
  onOpenPaymentGuide,
}: CustomerOrderLookupBottomSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 스크롤 끝 근처 도달 시 추가 로드
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      onLoadMore();
    }
  };

  // 필터 변경 등으로 목록이 줄면 스크롤을 맨 위로
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeFilter]);

  if (!open) return null;

  return (
    <div
      data-ruru-order-lookup-bottom-sheet="shell-v3-group"
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

          <div ref={scrollRef} onScroll={handleScroll} style={{ minHeight: 0, overflowY: "auto", padding: "8px 16px" }}>
            {groups.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {groups.map((group) => {
                  const orderMeta = [group.orderCode, group.dateText].filter(Boolean).join(" · ");

                  return (
                    <article key={group.id} style={{ borderRadius: "16px", background: "#fff", border: "1px solid #E8E2DD", padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <div style={{ display: "flex", minWidth: 0, alignItems: "center", gap: "6px" }}>
                          <span style={{ ...chipBaseStyle, ...paymentChipStyle(group.statusLabel) }}>{group.statusDisplayText}</span>
                        </div>
                        {group.paymentMethodLabel ? (
                          <span style={{ flexShrink: 0, fontSize: "11px", fontWeight: 800, color: "#7B2D43" }}>{group.paymentMethodLabel}</span>
                        ) : null}
                      </div>

                      <div style={{ marginTop: "10px", display: "grid", gap: "6px" }}>
                        {group.products.map((product, productIndex) => {
                          const optionLine = [product.optionText, product.quantityText].filter(Boolean).join(" · ");
                          return (
                            <div key={`${group.id}-${productIndex}`} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <p style={{ wordBreak: "break-all", whiteSpace: "normal", fontSize: "13px", fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.04em", color: "#222" }}>
                                  {product.name || "주문상품"}
                                  {optionLine ? <span style={{ fontWeight: 700, color: "#999" }}> {optionLine}</span> : null}
                                </p>
                              </div>
                              {product.amountText ? (
                                <span style={{ flexShrink: 0, fontSize: "13px", fontWeight: 800, letterSpacing: "-0.05em", color: "#7B2D43" }}>{product.amountText}</span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ marginTop: "10px", borderTop: "1px solid #F0EBE6", paddingTop: "8px" }}>
                        <p style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "11px", fontWeight: 800, color: "#999", marginBottom: "8px" }}>
                          {orderMeta || "-"}
                        </p>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#666", marginBottom: "3px" }}>
                          <span>상품금액</span>
                          <span style={{ fontWeight: 700, color: "#444" }}>{group.productAmountText ?? group.totalAmountText}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#666", marginBottom: group.cardExtraText ? "3px" : "6px" }}>
                          <span>배송비</span>
                          <span style={{ fontWeight: 700, color: "#444" }}>{group.shippingFeeText ?? "-"}</span>
                        </div>
                        {group.cardExtraText ? (
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#666", marginBottom: "6px" }}>
                            <span>카드수수료</span>
                            <span style={{ fontWeight: 700, color: "#444" }}>{group.cardExtraText}</span>
                          </div>
                        ) : null}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid #F0EBE6", paddingTop: "6px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 800, color: "#222" }}>결제금액</span>
                          <span style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "-0.07em", color: "#7B2D43" }}>{group.totalAmountText}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}

                {hasMore ? (
                  <div style={{ padding: "12px 0", textAlign: "center", fontSize: "12px", fontWeight: 700, color: "#ABA5A0" }}>
                    더 불러오는 중…
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ borderRadius: "16px", background: "#FAF6F2", padding: "20px", textAlign: "center", border: "1px solid #E8E2DD" }}>
                <p style={{ fontSize: "15px", fontWeight: 800, letterSpacing: "-0.05em", color: "#555" }}>선택한 상태의 주문내역이 없습니다.</p>
                <p style={{ marginTop: "4px", fontSize: "12px", fontWeight: 700, color: "#999" }}>다른 상태를 눌러 확인해주세요.</p>
              </div>
            )}
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
