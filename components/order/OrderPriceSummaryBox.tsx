// components/order/OrderPriceSummaryBox.tsx
// 목적: 주문서 금액 요약 UI 전용 (시안 딥로즈 #7B2D43 인라인)
// 주의: 계산은 밖에서 끝난 값을 props로만 받습니다. 주문 저장/입금/정산/Supabase 로직 없음.

import type { CSSProperties } from "react";
import { restyleV2 } from "@/lib/customerUiV2Restyle";

type OrderPriceSummaryBoxProps = {
  productAmount: number;
  shippingFee: number;
  cardExtra: number;
  totalAmount: number;
  paymentMethod: "무통장입금" | "카드결제";
  customerPointBalance?: number;
  customerPointLoading?: boolean;
  customerPointLoadFailed?: boolean;
  pointUseInput?: string;
  pointUsedAmount?: number;
  finalAmount?: number;
  pointEarnRate?: number; // 0 = 자동적립 OFF(문구 숨김) / >0 = 구매금액의 N% 적립 안내
  showPointUse?: boolean;
  onPointUseInputChange?: (value: string) => void;
  onUseAllPoints?: () => void;
  /** [㉜ 3단계] 새 모양(DESIGN.md) — 없으면 기존 모양 그대로. 표시만, 값·계산 무관. */
  tone?: "v2";
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
  customerPointLoadFailed = false,
  pointUseInput = "",
  pointUsedAmount = 0,
  finalAmount,
  pointEarnRate = 0,
  showPointUse = false,
  onPointUseInputChange,
  onUseAllPoints,
  tone,
}: OrderPriceSummaryBoxProps) {
  const v2 = tone === "v2";
  const t = (style: CSSProperties): CSSProperties => (v2 ? (restyleV2(style) as CSSProperties) : style);
  const safePointBalance = Math.max(0, Number(customerPointBalance || 0));
  const safePointUsedAmount = Math.max(0, Number(pointUsedAmount || 0));
  const hasSmallPoint = safePointBalance > 0 && safePointBalance < 1000;

  const rowStyle: CSSProperties = v2
    ? { display: "flex", justifyContent: "space-between", fontSize: "15px", fontWeight: 400, color: "#39393B" }
    : { display: "flex", justifyContent: "space-between", fontSize: "15px", fontWeight: 800, color: "#555" };

  return (
    <section style={t({ width: "100%" })}>
      <div style={v2 ? { borderRadius: "8px", background: "#F5F5F5", border: "none", padding: "16px" } : { borderRadius: "18px", background: "#F5E6EB", border: "1px solid #D9C5CC", padding: "16px" }}>
        <div style={t(rowStyle)}>
          <span>상품금액</span>
          <span style={v2 ? { color: "#111111", fontWeight: 600 } : { color: "#333" }}>{won(productAmount)}</span>
        </div>

        <div style={t({ ...rowStyle, marginTop: "10px" })}>
          <span>배송비</span>
          <span style={v2 ? { color: "#111111", fontWeight: 600 } : { color: "#333" }}>{won(shippingFee)}</span>
        </div>

        {paymentMethod === "카드결제" ? (
          <div style={t({ ...rowStyle, marginTop: "10px", color: "#7B2D43" })}>
            <span>카드결제 추가금액</span>
            <span>{won(cardExtra)}</span>
          </div>
        ) : null}

        {customerPointLoading ? (
          <div style={t({ marginTop: "16px", borderRadius: "14px", background: "rgba(255,255,255,0.7)", border: "1px solid #D9C5CC", padding: "12px 16px", fontSize: "13px", fontWeight: 800, color: "#7B2D43" })}>
            포인트 확인 중...
          </div>
        ) : customerPointLoadFailed ? (
          /* [2026-08-31 전수조사 수정] 조회 실패를 조용히 0원으로 보여주면
             손님은 포인트가 사라진 줄 알거나 그냥 못 쓰고 결제한다. 실패는 실패라고 말한다. */
          <div style={t({ marginTop: "16px", borderRadius: "14px", background: "#FFF8E6", border: "1px solid #F0E0B0", padding: "12px 16px", fontSize: "13px", fontWeight: 700, color: "#8A6A1E", lineHeight: 1.6 })}>
            {v2 ? "포인트를 못 불러왔어요(포인트는 그대로예요). 쓰시려면 새로고침 후 주문해 주세요." : (
              <>
            포인트를 못 불러왔어요. 포인트가 사라진 건 아니니 걱정 마세요!<br />
            새로고침하면 다시 보여요. 포인트를 쓰실 거면 새로고침 후 주문해 주세요.
              </>
            )}
          </div>
        ) : showPointUse ? (
          <div style={t({ marginTop: "16px", borderTop: "1px solid #D9C5CC", paddingTop: "16px" })}>
            {/* [2026-09-20 사장님] 「전부쓰기? 포인트? 알아듣게」 — 「내 포인트 N P」 + 「쓸 만큼 숫자 입력」 + 「포인트 전부 쓰기」 */}
            <div style={t({ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "15px", fontWeight: 800, color: "#7B2D43" })}>
              <span>내 포인트</span>
              <span>{safePointBalance.toLocaleString()}P</span>
            </div>

            {/* [2026-09-20 사장님] 「포인트 얼마 있는지 보여주고 직접입력도, 전부쓰기도」 — 입력칸과 전부쓰기를 한 줄에. 숫자는 쉼표(commaNumberText). */}
            <div style={t({ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 128px", gap: "8px" })}>
              <div style={t({ position: "relative", width: "100%" })}>
                <input
                  value={pointUseInput}
                  onChange={(event) => onPointUseInputChange?.(event.target.value)}
                  inputMode="numeric"
                  placeholder="쓸 만큼 숫자 입력"
                  style={v2 ? { height: "48px", width: "100%", boxSizing: "border-box", borderRadius: "24px", border: "1px solid #CACACB", background: "#FFFFFF", padding: "0 32px 0 16px", textAlign: "center", fontSize: "16px", fontWeight: 600, color: "#111111", outlineColor: "#111111" } : { height: "48px", width: "100%", boxSizing: "border-box", borderRadius: "14px", border: "1px solid #D9C5CC", background: "#fff", padding: "0 32px 0 14px", textAlign: "center", fontSize: "15px", fontWeight: 800, color: "#222", outline: "none" }}
                />
                <span style={t({ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "13px", fontWeight: 800, color: "#7B2D43", pointerEvents: "none" })}>원</span>
              </div>

              <button
                type="button"
                onClick={onUseAllPoints}
                style={v2 ? { height: "48px", width: "100%", borderRadius: "9999px", border: "1px solid #CACACB", background: "#FFFFFF", color: "#111111", fontSize: "15px", fontWeight: 600, cursor: "pointer" } : { height: "48px", width: "100%", borderRadius: "14px", border: "none", background: "#7B2D43", color: "#fff", fontSize: "14px", fontWeight: 800, cursor: "pointer" }}
              >
                포인트 전부 쓰기
              </button>
            </div>

            <div style={t({ marginTop: "6px", fontSize: "11.5px", fontWeight: 700, color: "#888", lineHeight: 1.5 })}>
              포인트는 1,000P부터 쓸 수 있고, 주문금액까지만 써져요.
            </div>
          </div>
        ) : hasSmallPoint ? (
          <div style={t({ marginTop: "16px", borderTop: "1px solid #D9C5CC", paddingTop: "16px", fontSize: "13px", fontWeight: 700, color: "#666", lineHeight: 1.5 })}>
            보유 포인트 {safePointBalance.toLocaleString()}P
            <br />
            포인트는 1,000원 이상부터 사용할 수 있습니다.
          </div>
        ) : null}

        {safePointUsedAmount > 0 ? (
          <div style={v2 ? { marginTop: "12px", borderTop: "1px solid #E5E5E5", paddingTop: "12px", display: "flex", justifyContent: "space-between", fontSize: "15px", fontWeight: 600, color: "#111111" } : { marginTop: "12px", borderTop: "1px solid #D9C5CC", paddingTop: "12px", display: "flex", justifyContent: "space-between", fontSize: "15px", fontWeight: 800, color: "#0F6E56" }}>
            <span>포인트 사용</span>
            <span>-{won(safePointUsedAmount)}</span>
          </div>
        ) : null}

        {/* [UI] 최종 금액 합계 행 — 표시 전용(계산은 부모에서 끝난 finalAmount만 받음) */}
        {/* [2026-09-20 심플하게] 총액은 크게(24px) — 손님이 이 숫자 하나만 보면 되게. */}
        <div style={v2 ? { marginTop: "14px", borderTop: "1px solid #CACACB", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "baseline", color: "#111111" } : { marginTop: "14px", borderTop: "1.5px solid #C9AEB8", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "baseline", color: "#7B2D43" }}>
          <span style={v2 ? { fontSize: "16px", fontWeight: 700 } : { fontSize: "15px", fontWeight: 900 }}>{paymentMethod === "카드결제" ? "총 결제금액" : "총 입금금액"}</span>
          <span style={v2 ? { fontSize: "26px", fontWeight: 700, letterSpacing: "-0.02em" } : { fontSize: "24px", fontWeight: 900, letterSpacing: "-0.02em" }}>{won(typeof finalAmount === "number" ? Math.max(0, finalAmount) : Math.max(0, totalAmount - safePointUsedAmount))}</span>
        </div>

        {pointEarnRate > 0 ? (
          <div style={t({ marginTop: "12px", borderTop: "1px dashed #D9C5CC", paddingTop: "12px", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#7B2D43" })}>
            {v2 ? "" : "🪙 "}결제 완료 시 구매금액의 {pointEarnRate}% 포인트 적립
          </div>
        ) : null}
      </div>
    </section>
  );
}
