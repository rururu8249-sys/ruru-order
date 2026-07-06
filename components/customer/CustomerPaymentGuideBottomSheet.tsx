// components/customer/CustomerPaymentGuideBottomSheet.tsx
// 목적: 공통으로 사용하는 입금안내 바텀시트
// 주의: UI 전용. DB, API, 주문저장, 입금매칭, 정산, 배송 로직 없음. (시안 딥로즈 #7B2D43 인라인)

import { useState } from "react";
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

  // [추가] 주문완료 화면에서 다음 방송 알림 신청 + 앱 설치 유도 (표시 전용 — 저장 로직은 부모 콜백)
  liveAlertOptin?: boolean;
  liveAlertSaving?: boolean;
  onLiveAlertRequest?: () => void;
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
  liveAlertOptin = false,
  liveAlertSaving = false,
  onLiveAlertRequest,
}: CustomerPaymentGuideBottomSheetProps) {
  const [installHint, setInstallHint] = useState(false);

  if (!open) return null;

  const isStandaloneApp =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)")?.matches || (navigator as any).standalone === true);
  const handleInstallClick = () => {
    const p = typeof window !== "undefined" ? (window as any).__ruruPwaPrompt : null;
    if (p && typeof p.prompt === "function") {
      try { p.prompt(); return; } catch { /* 폴백으로 안내 표시 */ }
    }
    setInstallHint(true);
  };

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
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(15,23,42,0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-label={isOrderComplete ? "주문 접수 완료 및 입금 안내" : "입금 안내"}
    >
      <style>{`
  @keyframes point-right {
    0%, 100% { transform: translateY(-50%) translateX(0); }
    50% { transform: translateY(-50%) translateX(-8px); }
  }
`}</style>
      <div style={{ width: "100%", maxWidth: "560px", margin: "0 auto", overflow: "hidden", borderTopLeftRadius: "28px", borderTopRightRadius: "28px", background: "#fff", boxShadow: "0 -22px 70px rgba(15,23,42,0.22)" }}>
        <div style={{ margin: "12px auto 0", height: "5px", width: "52px", borderRadius: "3px", background: "#E8E2DD" }} />

        <div style={{ maxHeight: "86dvh", overflowY: "auto", padding: "20px 16px calc(16px + env(safe-area-inset-bottom))" }}>
          {isOrderComplete ? (
            <header>
              <div style={{ fontSize: "13px", color: "#6B6460" }}>✅ 주문 접수됐어요</div>
              <div style={{ fontSize: "12px", color: "#ABA5A0", marginTop: "3px" }}>아래 안내대로 입금해 주세요</div>
            </header>
          ) : (
            <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "-0.04em", color: "#7B2D43" }}>루루동이 LIVE</p>
                <h2 style={{ marginTop: "4px", fontSize: "26px", fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.07em", color: "#222" }}>입금 안내</h2>
                <p style={{ marginTop: "8px", wordBreak: "keep-all", fontSize: "14px", fontWeight: 700, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#666" }}>현재 보이는 닉네임으로 입금해주세요.</p>
              </div>
              <div style={{ display: "flex", height: "48px", width: "48px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "16px", background: "#F5E6EB", border: "1px solid #D9C5CC", fontSize: "25px" }}>💙</div>
            </header>
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
            <section style={{ marginTop: "16px", borderRadius: "18px", background: "#F9EEF3", border: "1px solid #D9C5CC", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ display: "flex", height: "44px", width: "44px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "14px", background: "#fff", fontSize: "23px" }}>💳</div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "-0.06em", color: "#7A1E47" }}>카드결제 안내</h3>
                  <p style={{ marginTop: "4px", wordBreak: "keep-all", fontSize: "13px", fontWeight: 700, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#7A1E47" }}>카드결제는 카톡채널 안내에 따라 진행해주세요.</p>
                </div>
              </div>
            </section>
          )}

          {showBankGuide && (
            <>
              <div style={{ position: "relative", marginTop: "16px", background: "#FFFBEB", borderRadius: "12px", padding: "16px", paddingRight: "28px" }}>
                <div style={{ fontSize: "11px", color: "#6B6460", marginBottom: "6px" }}>입금자명 (닉네임)</div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ minWidth: 0, fontSize: "26px", fontWeight: 800, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={safeNickname}>{safeNickname}</span>
                  <span style={{ flexShrink: 0, fontSize: "22px", lineHeight: 1, animation: "point-right 1s ease-in-out infinite" }}>👈</span>
                </div>
                <div style={{ fontSize: "11px", color: "#854F0B", marginTop: "6px" }}>⚠️ 반드시 이 닉네임으로 입금해 주세요</div>
                <button type="button" onClick={onCopyNickname} style={{ ...(nicknameCopyDone ? doneButtonStyle : normalButtonStyle), marginTop: "12px", width: "100%" }}>
                  {nicknameCopyDone ? "고객 닉네임 복사완료" : "입금자명(닉네임) 복사"}
                </button>              </div>

              <div style={{ textAlign: "center", fontSize: "18px", color: "#ABA5A0", margin: "8px 0" }}>↓</div>

              <div style={{ position: "relative", background: "#F9EEF3", borderRadius: "12px", padding: "16px", paddingRight: "28px" }}>
                <div style={{ fontSize: "11px", color: "#6B6460", marginBottom: "6px" }}>입금금액</div>
                <div style={{ fontSize: "26px", fontWeight: 800, color: "#7A1E47" }}>{won(safeFinalAmount)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                  <span style={{ minWidth: 0, fontSize: "18px", fontWeight: 800, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{safeBankName} {safeBankAccount}</span>
                  <span style={{ flexShrink: 0, fontSize: "22px", lineHeight: 1, animation: "point-right 1s ease-in-out infinite" }}>👈</span>
                </div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#555", marginTop: "3px" }}>예금주 {safeBankHolder}</div>
                <button type="button" onClick={onCopyBankAccount} style={{ ...(bankCopyDone ? doneButtonStyle : normalButtonStyle), marginTop: "12px", width: "100%" }}>
                  {bankCopyDone ? "계좌번호 복사완료" : "계좌번호 복사"}
                </button>              </div>
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
                  <span style={{ color: "#7A1E47" }}>{won(safeFinalAmount)}</span>
                </div>
              </div>
            </section>
          )}

          {/* [추가] 주문완료 = 참여도 최고점 — 다음 방송 알림 신청 + 앱 추가 유도 (업계 표준: 전환 직후 설치/알림 제안) */}
          {isOrderComplete && (
            <section style={{ marginTop: "16px", borderRadius: "18px", background: "#F9EEF3", border: "1px solid #E3CDD6", padding: "16px" }}>
              <div style={{ fontSize: "15px", fontWeight: 800, letterSpacing: "-0.04em", color: "#7B2D43" }}>다음 방송, 놓치지 마세요</div>
              {onLiveAlertRequest ? (
                liveAlertOptin ? (
                  <div style={{ marginTop: "10px", borderRadius: "12px", background: "#E1F5EE", border: "1px solid #C7EBDD", padding: "11px 14px", fontSize: "13px", fontWeight: 800, color: "#0F6E56" }}>
                    🔔 방송알림 신청됨 — 방송 시작하면 카톡으로 알려드려요
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={liveAlertSaving}
                    onClick={onLiveAlertRequest}
                    style={{ marginTop: "10px", display: "flex", minHeight: "46px", width: "100%", alignItems: "center", justifyContent: "center", borderRadius: "12px", border: "none", background: "#7B2D43", color: "#fff", fontSize: "14px", fontWeight: 800, cursor: liveAlertSaving ? "wait" : "pointer", opacity: liveAlertSaving ? 0.6 : 1 }}
                  >
                    {liveAlertSaving ? "신청 중..." : "🔔 방송 시작 알림 신청하기"}
                  </button>
                )
              ) : null}
              {!isStandaloneApp && (
                <>
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    style={{ marginTop: "8px", display: "flex", minHeight: "46px", width: "100%", alignItems: "center", justifyContent: "center", borderRadius: "12px", border: "1px solid #D9C5CC", background: "#fff", color: "#7B2D43", fontSize: "14px", fontWeight: 800, cursor: "pointer" }}
                  >
                    📲 홈 화면에 앱으로 추가하기
                  </button>
                  {installHint && (
                    <div style={{ marginTop: "8px", fontSize: "12px", fontWeight: 700, lineHeight: 1.6, color: "#8a6b76" }}>
                      아이폰: Safari 하단 <b>공유</b> 버튼 → <b>홈 화면에 추가</b>
                      <br />
                      안드로이드: 브라우저 메뉴(⋮) → <b>홈 화면에 추가</b>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{ marginTop: "16px", display: "flex", minHeight: "52px", width: "100%", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "none", background: "#7A1E47", padding: "0 16px", fontSize: "16px", fontWeight: 800, letterSpacing: "-0.05em", color: "#fff", cursor: "pointer" }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
