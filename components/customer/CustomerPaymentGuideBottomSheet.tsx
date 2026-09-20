// components/customer/CustomerPaymentGuideBottomSheet.tsx
// 목적: 공통으로 사용하는 입금안내 바텀시트
// 주의: UI 전용. DB, API, 주문저장, 입금매칭, 정산, 배송 로직 없음. (시안 딥로즈 #7B2D43 인라인)

import { useState } from "react";
import type { CSSProperties } from "react";
// [2026-09-20] 바텀시트 «한 벌» 틀(높이·헤더·✕·닫기 5종). 계좌·금액·안내 내용은 그대로.
import CustomerBottomSheet, { csPrimaryButtonStyle } from "@/components/customer/CustomerBottomSheet";

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
  onOpenOrderLookup?: () => void;

  isOrderComplete?: boolean;
  paymentMethod?: "무통장입금" | "카드결제";
  items?: CustomerPaymentGuideOrderItem[];
  productAmount?: number;
  shippingFee?: number;
  cardExtra?: number;
  totalAmount?: number;
  pointUsedAmount?: number;
  finalAmount?: number;
  recipientName?: string;
  recipientPhone?: string;
  shippingAddress?: string;

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

// [2026-08-28 P0-3] 옵션값 전용 정리 — 저장상 "없음/-" 등 빈 옵션 센티널을 손님 화면에 찍지 않는다.
// clean()은 상품명·닉네임 등에도 쓰이므로 건드리지 않고 옵션에만 이 함수를 쓴다.
const EMPTY_OPTION_VALUES = ["없음", "없슴", "색상없음", "사이즈없음", "옵션없음", "x", "-", "none", "n/a", "na"];
const cleanOption = (value: unknown) => {
  const text = clean(value);
  return EMPTY_OPTION_VALUES.includes(text.toLowerCase()) ? "" : text;
};

const itemTitle = (item: CustomerPaymentGuideOrderItem) => {
  const name = clean(item.product_name) || "상품명 확인";
  const optionText = [cleanOption(item.color), cleanOption(item.size)].filter(Boolean).join(" / ");
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
  onOpenOrderLookup,
  isOrderComplete = false,
  paymentMethod = "무통장입금",
  items = [],
  productAmount = 0,
  shippingFee = 0,
  cardExtra = 0,
  totalAmount = 0,
  pointUsedAmount = 0,
  finalAmount,
  recipientName = "",
  recipientPhone = "",
  shippingAddress = "",
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
  const safeCardExtra = safePaymentMethod === "카드결제" ? Math.max(0, Number(cardExtra || 0)) : 0;
  const safeTotalAmount = Math.max(0, Number(totalAmount || safeProductAmount + safeShippingFee || 0));
  const safePointUsedAmount = Math.max(0, Number(pointUsedAmount || 0));
  const safeFinalAmount =
    finalAmount === undefined ? safeTotalAmount : Math.max(0, Number(finalAmount || 0));
  const safeRecipientName = clean(recipientName) || "받는 분 미확인";
  const safeRecipientPhone = clean(recipientPhone) || "연락처 미확인";
  const safeShippingAddress = clean(shippingAddress) || "배송지 미확인";
  const isFullyPaidByPoints = isOrderComplete && safePointUsedAmount > 0 && safeFinalAmount <= 0;
  const showBankGuide =
    !isOrderComplete || (safePaymentMethod === "무통장입금" && !isFullyPaidByPoints);
  const showCardGuide = isOrderComplete && safePaymentMethod === "카드결제" && !isFullyPaidByPoints;

  const normalButtonStyle: CSSProperties = { display: "flex", minHeight: "46px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "1px solid #D9C5CC", background: "#fff", padding: "8px 12px", fontSize: "13px", fontWeight: 800, letterSpacing: "-0.04em", color: "#444", cursor: "pointer" };
  const doneButtonStyle: CSSProperties = { ...normalButtonStyle, border: "1px solid #7B2D43", background: "#7B2D43", color: "#fff" };
  const sumRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", fontSize: "13px", fontWeight: 700, color: "#666" };

  const sheetTitle = isOrderComplete ? "✅ 주문 접수됐어요" : "입금 안내";
  const sheetSubtitle = isOrderComplete
    ? (isFullyPaidByPoints ? "추가 결제 없이 접수됐어요" : showCardGuide ? "카카오톡으로 전송되는 결제링크에서 결제해 주세요" : "아래 계좌로 입금해 주세요")
    : "현재 보이는 닉네임으로 입금해 주세요.";

  return (
    <CustomerBottomSheet
      open
      onClose={onClose}
      title={sheetTitle}
      subtitle={sheetSubtitle}
      ariaLabel={isOrderComplete ? "주문 접수 완료 및 입금 안내" : "입금 안내"}
      bodyPadding="4px 16px 16px"
      footer={<button type="button" onClick={onClose} style={csPrimaryButtonStyle(true)}>확인</button>}
    >
          {/* [2026-09-20 사장님 「제출 후 화면도 심플하고 난독증 손님이 봐도 보기 좋게」]
              · 무통장: 상자 3개(입금자명·금액·계좌)+화살표+손가락 → «이렇게 입금해 주세요» 상자 1개, 줄 3개, 복사는 줄 옆 버튼.
              · 포인트 전액: 초록 한 줄. · 배송지 ⚠️ 상자 → 회색 한 줄. · 「다음 방송」 상자 → 버튼 2개 한 줄.
              계좌·금액·닉네임 값과 복사 동작(onCopy*)은 그대로. */}
          {isFullyPaidByPoints && (
            <section style={{ marginTop: "12px", borderRadius: "14px", background: "#E1F5EE", border: "1px solid #C7EBDD", padding: "14px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "22px", lineHeight: 1 }}>✅</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "16px", fontWeight: 900, color: "#0F6E56" }}>포인트로 결제 끝났어요</div>
                <div style={{ marginTop: "2px", fontSize: "13px", fontWeight: 700, color: "#397A68" }}>더 낼 돈이 없습니다.</div>
              </div>
            </section>
          )}

          {showCardGuide && (
            <section style={{ marginTop: "12px", borderRadius: "14px", background: "#F9EEF3", border: "1px solid #D9C5CC", padding: "14px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "22px", lineHeight: 1 }}>💳</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "16px", fontWeight: 900, color: "#7A1E47" }}>카카오톡으로 결제링크를 보내드려요</div>
                <div style={{ marginTop: "2px", fontSize: "13px", fontWeight: 700, color: "#7A1E47", wordBreak: "keep-all" }}>카톡이 오면 링크에서 {won(safeFinalAmount)} 결제해 주세요.</div>
              </div>
            </section>
          )}

          {showBankGuide && (
            <section style={{ marginTop: "12px", borderRadius: "16px", background: "#FFFBEB", border: "1.5px solid #F0E0B0", padding: "14px 16px" }}>
              <div style={{ fontSize: "15px", fontWeight: 900, color: "#1A1A1A" }}>이렇게 입금해 주세요</div>

              <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6E655E" }}>① 입금자명 (닉네임)</div>
                  <div style={{ fontSize: "22px", fontWeight: 900, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{safeNickname}</div>
                </div>
                <button type="button" onClick={onCopyNickname} style={{ ...(nicknameCopyDone ? doneButtonStyle : normalButtonStyle), flexShrink: 0, minHeight: "40px", padding: "0 14px", fontSize: "13px" }}>
                  {nicknameCopyDone ? "복사됨" : "복사"}
                </button>
              </div>
              <div style={{ marginTop: "4px", fontSize: "12px", fontWeight: 800, color: "#854F0B" }}>⚠️ 꼭 이 이름으로 입금해야 확인돼요</div>

              <div style={{ marginTop: "12px", borderTop: "1px solid #F0E0B0", paddingTop: "12px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6E655E" }}>② 입금금액</div>
                <div style={{ fontSize: "26px", fontWeight: 900, color: "#7A1E47" }}>{won(safeFinalAmount)}</div>
              </div>

              <div style={{ marginTop: "12px", borderTop: "1px solid #F0E0B0", paddingTop: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6E655E" }}>③ 계좌</div>
                  <div style={{ fontSize: "17px", fontWeight: 900, color: "#1A1A1A", wordBreak: "break-all" }}>{safeBankName} {safeBankAccount}</div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#555" }}>예금주 {safeBankHolder}</div>
                </div>
                <button type="button" onClick={onCopyBankAccount} style={{ ...(bankCopyDone ? doneButtonStyle : normalButtonStyle), flexShrink: 0, minHeight: "40px", padding: "0 14px", fontSize: "13px" }}>
                  {bankCopyDone ? "복사됨" : "복사"}
                </button>
              </div>

              {isOrderComplete ? (
                <div style={{ marginTop: "12px", borderTop: "1px solid #F0E0B0", paddingTop: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", fontSize: "12.5px", fontWeight: 700, color: "#397A68" }}>
                  <span>입금 확인은 보통 10~30분 걸려요</span>
                  {onOpenOrderLookup ? (
                    <button type="button" onClick={onOpenOrderLookup} style={{ flexShrink: 0, border: "none", background: "none", padding: 0, fontSize: "12.5px", fontWeight: 900, color: "#0F6E56", textDecoration: "underline", cursor: "pointer" }}>주문내역 보기</button>
                  ) : null}
                </div>
              ) : null}
            </section>
          )}

          {isOrderComplete && (
            <section style={{ marginTop: "12px", borderRadius: "16px", background: "#fff", border: "1px solid #E8E2DD", padding: "14px 16px" }}>
              <div style={{ marginBottom: "8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 900, color: "#222" }}>주문 상품</h3>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "#7B2D43" }}>총 {totalQty}개</span>
              </div>

              <div style={{ display: "grid", gap: "6px" }}>
                {orderItems.length > 0 ? (
                  orderItems.map((item, index) => {
                    const qty = toNumber(item.qty);
                    const amount = toNumber(item.product_price) * qty;
                    return (
                      <div key={`${itemTitle(item)}-${index}`} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", padding: "8px 0", borderBottom: "0.5px solid #EEE7E1" }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ wordBreak: "keep-all", fontSize: "14px", fontWeight: 800, lineHeight: 1.5, color: "#222" }}>{itemTitle(item)}</p>
                          <p style={{ marginTop: "2px", fontSize: "12px", fontWeight: 700, color: "#888" }}>{qty || 0}개</p>
                        </div>
                        <p style={{ flexShrink: 0, textAlign: "right", fontSize: "14px", fontWeight: 800, color: "#7B2D43" }}>{won(amount)}</p>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: "12px", textAlign: "center", fontSize: "13px", fontWeight: 700, color: "#888" }}>주문 상품 정보가 없습니다.</div>
                )}
              </div>

              <div style={{ marginTop: "10px" }}>
                <div style={sumRow}><span>상품금액</span><span>{won(safeProductAmount)}</span></div>
                <div style={sumRow}><span>배송비</span><span>{won(safeShippingFee)}</span></div>
                {safeCardExtra > 0 && (
                  <div style={sumRow}><span>카드 추가금</span><span>+{won(safeCardExtra)}</span></div>
                )}
                {safePointUsedAmount > 0 && (
                  <div style={{ ...sumRow, fontWeight: 800, color: "#0F6E56" }}><span>포인트 사용</span><span>-{won(safePointUsedAmount)}</span></div>
                )}
                <div style={{ marginTop: "6px", display: "flex", alignItems: "baseline", justifyContent: "space-between", borderTop: "1px solid #E8E2DD", paddingTop: "8px", fontSize: "15px", fontWeight: 900, color: "#222" }}>
                  <span>{safePointUsedAmount > 0 ? "최종 결제금액" : "결제금액"}</span>
                  <span style={{ color: "#7A1E47", fontSize: "20px" }}>{won(safeFinalAmount)}</span>
                </div>
              </div>
            </section>
          )}

          {isOrderComplete && (
            <section style={{ marginTop: "12px", borderRadius: "16px", background: "#fff", border: "1px solid #E8E2DD", padding: "14px 16px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 900, color: "#222" }}>🚚 받는 곳</h3>
              <div style={{ marginTop: "6px", fontSize: "14px", fontWeight: 800, color: "#222" }}>{safeRecipientName} · {safeRecipientPhone}</div>
              <div style={{ marginTop: "2px", fontSize: "13px", fontWeight: 600, color: "#444", wordBreak: "keep-all" }}>{safeShippingAddress}</div>
              <div style={{ marginTop: "8px", fontSize: "12px", fontWeight: 700, color: "#8A7A7D" }}>배송지를 바꿔야 하면 카톡채널로 알려주세요. (내정보에서 바꿔도 이 주문엔 적용 안 돼요)</div>
            </section>
          )}

          {/* 주문완료 = 참여도 최고점 — 알림 신청·앱 추가는 한 줄 버튼 2개로만 */}
          {isOrderComplete && (onLiveAlertRequest || !isStandaloneApp) && (
            <section style={{ marginTop: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: onLiveAlertRequest && !isStandaloneApp ? "1fr 1fr" : "1fr", gap: "8px" }}>
                {onLiveAlertRequest ? (
                  liveAlertOptin ? (
                    <div style={{ minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "12px", background: "#E1F5EE", border: "1px solid #C7EBDD", padding: "0 10px", fontSize: "12.5px", fontWeight: 800, color: "#0F6E56", textAlign: "center", wordBreak: "keep-all" }}>
                      🔔 방송 알림 받는 중
                    </div>
                  ) : (
                    <button type="button" disabled={liveAlertSaving} onClick={onLiveAlertRequest} style={{ minHeight: "44px", borderRadius: "12px", border: "1px solid #D9C5CC", background: "#fff", padding: "0 10px", fontSize: "12.5px", fontWeight: 800, color: "#7B2D43", cursor: "pointer" }}>
                      {liveAlertSaving ? "신청 중..." : "🔔 방송 알림 받기"}
                    </button>
                  )
                ) : null}
                {!isStandaloneApp ? (
                  <button type="button" onClick={handleInstallClick} style={{ minHeight: "44px", borderRadius: "12px", border: "1px solid #D9C5CC", background: "#fff", padding: "0 10px", fontSize: "12.5px", fontWeight: 800, color: "#7B2D43", cursor: "pointer" }}>
                    📲 홈 화면에 추가
                  </button>
                ) : null}
              </div>
              {installHint && (
                <div style={{ marginTop: "8px", fontSize: "12px", fontWeight: 700, lineHeight: 1.6, color: "#8a6b76" }}>
                  아이폰: Safari 하단 <b>공유</b> 버튼 → <b>홈 화면에 추가</b>
                  <br />
                  안드로이드: 브라우저 메뉴(⋮) → <b>홈 화면에 추가</b>
                </div>
              )}
            </section>
          )}

    </CustomerBottomSheet>
  );
}
