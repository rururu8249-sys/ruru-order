// components/customer/CustomerPaymentGuideBottomSheet.tsx
// 목적: 공통으로 사용하는 입금안내 바텀시트
// 주의: UI 전용. DB, API, 주문저장, 입금매칭, 정산, 배송 로직 없음. (시안 딥로즈 #7B2D43 인라인)

import type { CSSProperties } from "react";

type CustomerPaymentGuideOrderItem = {
  product_name?: string;
  color?: string;
  size?: string;
  qty?: string | number;
  product_price?: string | number;
};

type CustomerPaymentGuideBottomSheetProps = {
  open: boolean;
  depositNickname: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  nicknameCopyDone: boolean;
  bankCopyDone: boolean;
  onCopyNickname: () => void;
  onCopyBankAccount: () => void;
  onClose: () => void;

  isOrderComplete?: boolean;
  paymentMethod?: "무통장입금" | "카드결제";
  items?: CustomerPaymentGuideOrderItem[];
  productAmount?: number;
  shippingFee?: number;
  totalAmount?: number;
  pointUsedAmount?: number;
  finalAmount?: number;
};

const toNumber = (value: string | number | undefined) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return Number(String(value || "").replace(/[^0-9]/g, "")) || 0;
};

const won = (value: number) => `${Number(value || 0).toLocaleString()}원`;
const clean = (value: unknown) => String(value || "").trim();

const itemTitle = (item: CustomerPaymentGuideOrderItem) => {
  const name = clean(item.product_name) || "상품명 확인";
  const optionText = [clean(item.color), clean(item.size)].filter(Boolean).join(" / ");
  return optionText ? `${name} (${optionText})` : name;
};

export default function CustomerPaymentGuideBottomSheet({
  open,
  depositNickname,
  bankName,
  bankAccount,
  bankHolder,
  nicknameCopyDone,
  bankCopyDone,
  onCopyNickname,
  onCopyBankAccount,
  onClose,
  isOrderComplete = false,
  paymentMethod = "무통장입금",
  items = [],
  productAmount = 0,
  shippingFee = 0,
  totalAmount = 0,
  pointUsedAmount = 0,
  finalAmount,
}: CustomerPaymentGuideBottomSheetProps) {
  if (!open) return null;

  const safeNickname = String(depositNickname || "").trim() || "주문서 닉네임";
  const safeBankName = String(bankName || "").trim();
  const safeBankAccount = String(bankAccount || "").trim();
  const safeBankHolder = String(bankHolder || "").trim();
  const safePaymentMethod = paymentMethod === "카드결제" ? "카드결제" : "무통장입금";

  const orderItems = Array.isArray(items) ? items : [];
  const totalQty = orderItems.reduce((sum, item) => sum + toNumber(item.qty), 0);
  const safeProductAmount = Math.max(0, Number(productAmount || 0));
  const safeShippingFee = Math.max(0, Number(shippingFee || 0));
  const safeTotalAmount = Math.max(0, Number(totalAmount || safeProductAmount + safeShippingFee || 0));
  const safePointUsedAmount = Math.max(0, Number(pointUsedAmount || 0));
  const safeFinalAmount =
    finalAmount === undefined ? safeTotalAmount : Math.max(0, Number(finalAmount || 0));
  const isFullyPaidByPoints = isOrderComplete && safePointUsedAmount > 0 && safeFinalAmount <= 0;
  const showBankGuide =
    !isOrderComplete || (safePaymentMethod === "무통장입금" && !isFullyPaidByPoints);
  const showCardGuide = isOrderComplete && safePaymentMethod === "카드결제" && !isFullyPaidByPoints;

  const normalButtonStyle: CSSProperties = { display: "flex", minHeight: "46px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "1px solid #D9C5CC", background: "#fff", padding: "8px 12px", fontSize: "13px", fontWeight: 800, letterSpacing: "-0.04em", color: "#444", cursor: "pointer" };
  const doneButtonStyle: CSSProperties = { ...normalButtonStyle, border: "1px solid #7B2D43", background: "#7B2D43", color: "#fff" };
  const sumRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", fontSize: "13px", fontWeight: 700, color: "#666" };

  return (
    <div
      data-ruru-payment-guide-bottom-sheet="shell-v2"
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(15,23,42,0.45)", padding: "0 12px" }}
      role="dialog"
      aria-modal="true"
      aria-label={isOrderComplete ? "주문 접수 완료 및 입금 안내" : "입금 안내"}
    >
      <div style={{ width: "100%", maxWidth: "430px", overflow: "hidden", borderTopLeftRadius: "28px", borderTopRightRadius: "28px", background: "#fff", boxShadow: "0 -22px 70px rgba(15,23,42,0.22)" }}>
        <div style={{ margin: "12px auto 0", height: "5px", width: "52px", borderRadius: "3px", background: "#E8E2DD" }} />

        <div style={{ maxHeight: "86dvh", overflowY: "auto", padding: "20px 16px calc(16px + env(safe-area-inset-bottom))" }}>
          <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "-0.04em", color: "#7B2D43" }}>루루동이 LIVE</p>
              <h2 style={{ marginTop: "4px", fontSize: "26px", fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.07em", color: "#222" }}>
                {isOrderComplete ? "주문 접수 완료" : "입금 안내"}
              </h2>
              <p style={{ marginTop: "8px", wordBreak: "keep-all", fontSize: "14px", fontWeight: 700, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#666" }}>
                {isOrderComplete ? "입금자명과 계좌번호를 확인해주세요." : "현재 보이는 닉네임으로 입금해주세요."}
              </p>
            </div>
            <div style={{ display: "flex", height: "48px", width: "48px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "16px", background: "#F5E6EB", border: "1px solid #D9C5CC", fontSize: "25px" }}>
              {isOrderComplete ? "✅" : "💙"}
            </div>
          </header>

          {isOrderComplete && showBankGuide && (
            <div style={{ marginTop: "16px", borderRadius: "14px", background: "#7B2D43", padding: "12px 16px", fontSize: "13px", fontWeight: 800, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#fff" }}>
              닉네임과 결제금액이 정확히 맞아야 자동 입금확인이 됩니다.
            </div>
          )}

          {isFullyPaidByPoints && (
            <section style={{ marginTop: "16px", borderRadius: "18px", background: "#E1F5EE", border: "1px solid #C7EBDD", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ display: "flex", height: "44px", width: "44px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "14px", background: "#fff", fontSize: "23px" }}>✅</div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "-0.06em", color: "#0F6E56" }}>포인트로 결제완료</h3>
                  <p style={{ marginTop: "4px", wordBreak: "keep-all", fontSize: "13px", fontWeight: 700, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#0F6E56" }}>추가 입금 없이 주문이 접수됐습니다.</p>
                </div>
              </div>
            </section>
          )}

          {showCardGuide && (
            <section style={{ marginTop: "16px", borderRadius: "18px", background: "#F5E6EB", border: "1px solid #D9C5CC", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ display: "flex", height: "44px", width: "44px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "14px", background: "#fff", fontSize: "23px" }}>💳</div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "-0.06em", color: "#7B2D43" }}>카드결제 안내</h3>
                  <p style={{ marginTop: "4px", wordBreak: "keep-all", fontSize: "13px", fontWeight: 700, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#7B2D43" }}>카드결제는 카톡채널 안내에 따라 진행해주세요.</p>
                </div>
              </div>
            </section>
          )}

          {showBankGuide && (
            <>
              <section style={{ marginTop: "16px", borderRadius: "18px", background: "#F5E6EB", border: "1px solid #D9C5CC", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "-0.04em", color: "#888" }}>입금자명</p>
                    <p style={{ marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "30px", fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.08em", color: "#7B2D43" }} title={safeNickname}>
                      {safeNickname}
                    </p>
                    <p style={{ marginTop: "8px", wordBreak: "keep-all", fontSize: "12px", fontWeight: 700, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#666" }}>이 닉네임으로 입금해주세요.</p>
                  </div>
                  <div style={{ display: "flex", height: "48px", width: "48px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "16px", background: "rgba(255,255,255,0.8)", border: "1px solid #D9C5CC", fontSize: "24px" }}>👤</div>
                </div>
              </section>

              <section style={{ marginTop: "12px", borderRadius: "18px", background: "#FAF6F2", border: "1px solid #E8E2DD", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "-0.04em", color: "#888" }}>계좌번호</p>
                    <p style={{ marginTop: "4px", wordBreak: "break-all", fontSize: "19px", fontWeight: 800, lineHeight: 1.35, letterSpacing: "-0.06em", color: "#222" }} title={`${safeBankName} ${safeBankAccount}`}>
                      {safeBankName} {safeBankAccount}
                    </p>
                    <p style={{ marginTop: "8px", fontSize: "13px", fontWeight: 800, letterSpacing: "-0.04em", color: "#555" }}>예금주 {safeBankHolder}</p>
                  </div>
                  <div style={{ display: "flex", height: "48px", width: "48px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "16px", background: "rgba(255,255,255,0.8)", border: "1px solid #E8E2DD", fontSize: "24px" }}>🏦</div>
                </div>
              </section>

              <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <button type="button" onClick={onCopyNickname} style={nicknameCopyDone ? doneButtonStyle : normalButtonStyle}>
                  {nicknameCopyDone ? "고객 닉네임 복사완료" : "입금자명(닉네임) 복사"}
                </button>
                <button type="button" onClick={onCopyBankAccount} style={bankCopyDone ? doneButtonStyle : normalButtonStyle}>
                  {bankCopyDone ? "계좌번호 복사완료" : "계좌번호 복사"}
                </button>
              </div>
            </>
          )}

          {isOrderComplete && (
            <section style={{ marginTop: "16px", borderRadius: "18px", background: "#fff", border: "1px solid #E8E2DD", padding: "16px" }}>
              <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "-0.06em", color: "#222" }}>주문 상품</h3>
                <span style={{ borderRadius: "999px", background: "#F5E6EB", border: "1px solid #D9C5CC", padding: "4px 12px", fontSize: "12px", fontWeight: 800, color: "#7B2D43" }}>총 {totalQty || orderItems.length}개</span>
              </div>

              <div style={{ display: "grid", gap: "8px" }}>
                {orderItems.length > 0 ? (
                  orderItems.map((item, index) => {
                    const qty = toNumber(item.qty);
                    const amount = toNumber(item.product_price) * qty;
                    return (
                      <div key={`${itemTitle(item)}-${index}`} style={{ borderRadius: "14px", background: "#FAF6F2", padding: "12px", border: "1px solid #E8E2DD" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ wordBreak: "keep-all", fontSize: "14px", fontWeight: 800, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#222" }}>{itemTitle(item)}</p>
                            <p style={{ marginTop: "4px", fontSize: "12px", fontWeight: 700, color: "#888" }}>수량 {qty || 0}개</p>
                          </div>
                          <p style={{ flexShrink: 0, textAlign: "right", fontSize: "14px", fontWeight: 800, color: "#7B2D43" }}>{won(amount)}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ borderRadius: "14px", background: "#FAF6F2", padding: "16px", textAlign: "center", fontSize: "13px", fontWeight: 700, color: "#888", border: "1px solid #E8E2DD" }}>주문 상품 정보가 비어 있습니다.</div>
                )}
              </div>

              <div style={{ marginTop: "12px", borderRadius: "14px", background: "#F5E6EB", border: "1px solid #D9C5CC", padding: "12px" }}>
                <div style={sumRow}><span>상품금액</span><span>{won(safeProductAmount)}</span></div>
                <div style={sumRow}><span>배송비</span><span>{won(safeShippingFee)}</span></div>
                {safePointUsedAmount > 0 && (
                  <div style={{ ...sumRow, fontWeight: 800, color: "#0F6E56" }}><span>포인트 사용</span><span>-{won(safePointUsedAmount)}</span></div>
                )}
                <div style={{ marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #D9C5CC", paddingTop: "12px", fontSize: "17px", fontWeight: 800, color: "#222" }}>
                  <span>{safePointUsedAmount > 0 ? "최종 결제금액" : "결제금액"}</span>
                  <span style={{ color: "#7B2D43" }}>{won(safeFinalAmount)}</span>
                </div>
              </div>
            </section>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{ marginTop: "16px", display: "flex", minHeight: "52px", width: "100%", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "none", background: "#7B2D43", padding: "0 16px", fontSize: "16px", fontWeight: 800, letterSpacing: "-0.05em", color: "#fff", cursor: "pointer" }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
