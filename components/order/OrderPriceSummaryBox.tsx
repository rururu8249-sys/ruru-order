// components/order/OrderPriceSummaryBox.tsx
// 목적: 주문서 금액 요약 UI 전용 (시안 딥로즈 #7B2D43 인라인)
// 주의: 계산은 밖에서 끝난 값을 props로만 받습니다. 주문 저장/입금/정산/Supabase 로직 없음.

import type { CSSProperties } from "react";

type OrderPriceSummaryBoxProps = {
  productAmount: number;
  shippingFee: number;
  cardExtra: number;
  totalAmount: number;
  paymentMethod: "무통장입금" | "카드결제";
  customerPointBalance?: number;
  customerPointLoading?: boolean;
  pointUseInput?: string;
  pointUsedAmount?: number;
  finalAmount?: number;
  pointEarnRate?: number; // 0 = 자동적립 OFF(문구 숨김) / >0 = 구매금액의 N% 적립 안내
  showPointUse?: boolean;
  onPointUseInputChange?: (value: string) => void;
  onUseAllPoints?: () => void;
};

const won = (value: number) => `${Number(value || 0).toLocaleString()}원`;

export default function OrderPriceSummaryBox({
  productAmount,
  shippingFee,
  cardExtra,
  totalAmount,
  paymentMethod,
  customerPointBalance = 0,
  customerPointLoading = false,
  pointUseInput = "",
  pointUsedAmount = 0,
  finalAmount,
  pointEarnRate = 0,
  showPointUse = false,
  onPointUseInputChange,
  onUseAllPoints,
}: OrderPriceSummaryBoxProps) {
  const safePointBalance = Math.max(0, Number(customerPointBalance || 0));
  const safePointUsedAmount = Math.max(0, Number(pointUsedAmount || 0));
  const hasSmallPoint = safePointBalance > 0 && safePointBalance < 1000;

  const rowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: "15px", fontWeight: 800, color: "#555" };

  return (
    <section style={{ width: "100%" }}>
      <div style={{ borderRadius: "18px", background: "#F5E6EB", border: "1px solid #D9C5CC", padding: "16px" }}>
        <div style={rowStyle}>
          <span>상품금액</span>
          <span style={{ color: "#333" }}>{won(productAmount)}</span>
        </div>

        <div style={{ ...rowStyle, marginTop: "10px" }}>
          <span>배송비</span>
          <span style={{ color: "#333" }}>{won(shippingFee)}</span>
        </div>

        {paymentMethod === "카드결제" ? (
          <div style={{ ...rowStyle, marginTop: "10px", color: "#7B2D43" }}>
            <span>카드결제 추가금액</span>
            <span>{won(cardExtra)}</span>
          </div>
        ) : null}

        {customerPointLoading ? (
          <div style={{ marginTop: "16px", borderRadius: "14px", background: "rgba(255,255,255,0.7)", border: "1px solid #D9C5CC", padding: "12px 16px", fontSize: "13px", fontWeight: 800, color: "#7B2D43" }}>
            포인트 확인중...
          </div>
        ) : showPointUse ? (
          <div style={{ marginTop: "16px", borderTop: "1px solid #D9C5CC", paddingTop: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "15px", fontWeight: 800, color: "#7B2D43" }}>
              <span>보유 포인트</span>
              <span>{won(safePointBalance)}</span>
            </div>

            <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
              <div style={{ position: "relative", width: "100%" }}>
                <input
                  value={pointUseInput}
                  onChange={(event) => onPointUseInputChange?.(event.target.value)}
                  inputMode="numeric"
                  placeholder="직접입력"
                  style={{ height: "48px", width: "100%", boxSizing: "border-box", borderRadius: "14px", border: "1px solid #D9C5CC", background: "#fff", padding: "0 32px 0 14px", textAlign: "center", fontSize: "15px", fontWeight: 800, color: "#222", outline: "none" }}
                />
                <span style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "13px", fontWeight: 800, color: "#7B2D43", pointerEvents: "none" }}>원</span>
              </div>

              <button
                type="button"
                onClick={onUseAllPoints}
                style={{ height: "48px", width: "100%", borderRadius: "14px", border: "none", background: "#7B2D43", color: "#fff", fontSize: "15px", fontWeight: 800, cursor: "pointer" }}
              >
                전액사용
              </button>
            </div>

            <div style={{ marginTop: "8px", fontSize: "12px", fontWeight: 700, color: "#888", lineHeight: 1.5 }}>
              포인트는 1,000원 이상부터 사용 가능하며, 주문금액을 초과해 사용할 수 없습니다.
            </div>
          </div>
        ) : hasSmallPoint ? (
          <div style={{ marginTop: "16px", borderTop: "1px solid #D9C5CC", paddingTop: "16px", fontSize: "13px", fontWeight: 700, color: "#666", lineHeight: 1.5 }}>
            보유 포인트 {won(safePointBalance)}
            <br />
            포인트는 1,000원 이상부터 사용할 수 있습니다.
          </div>
        ) : null}

        {safePointUsedAmount > 0 ? (
          <div style={{ marginTop: "12px", borderTop: "1px solid #D9C5CC", paddingTop: "12px", display: "flex", justifyContent: "space-between", fontSize: "15px", fontWeight: 800, color: "#0F6E56" }}>
            <span>포인트 사용</span>
            <span>-{won(safePointUsedAmount)}</span>
          </div>
        ) : null}

        {pointEarnRate > 0 ? (
          <div style={{ marginTop: "12px", borderTop: "1px dashed #D9C5CC", paddingTop: "12px", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#7B2D43" }}>
            🪙 결제 완료 시 구매금액의 {pointEarnRate}% 포인트 적립
          </div>
        ) : null}
      </div>
    </section>
  );
}
