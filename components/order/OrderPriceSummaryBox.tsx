// components/order/OrderPriceSummaryBox.tsx
// 목적: 주문서 금액 요약 UI 전용
// 주의: 계산은 밖에서 끝난 값을 props로만 받습니다. 계산 로직 없음

type OrderPriceSummaryBoxProps = {
  productAmount: number;
  shippingFee: number;
  cardExtra: number;
  totalAmount: number;
  paymentMethod: "무통장입금" | "카드결제";
};

const won = (value: number) => `${Number(value || 0).toLocaleString()}원`;

export default function OrderPriceSummaryBox({
  productAmount,
  shippingFee,
  cardExtra,
  totalAmount,
  paymentMethod,
}: OrderPriceSummaryBoxProps) {
  return (
    <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_26px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <h2 className="text-[20px] font-black tracking-[-0.06em] text-[#151923]">
        결제금액 확인
      </h2>

      <div className="mt-4 rounded-[22px] bg-blue-50 p-4 ring-1 ring-blue-100">
        <div className="flex justify-between text-sm font-bold text-slate-600">
          <span>상품금액</span>
          <span>{won(productAmount)}</span>
        </div>

        <div className="mt-2 flex justify-between text-sm font-bold text-slate-600">
          <span>배송비</span>
          <span>{won(shippingFee)}</span>
        </div>

        {paymentMethod === "카드결제" && (
          <div className="mt-2 flex justify-between text-sm font-bold text-blue-700">
            <span>카드결제 추가금액</span>
            <span>{won(cardExtra)}</span>
          </div>
        )}

        <div className="mt-4 flex justify-between border-t border-blue-100 pt-4 text-xl font-black tracking-[-0.05em] text-[#151923]">
          <span>총 결제금액</span>
          <span>{won(totalAmount)}</span>
        </div>
      </div>
    </section>
  );
}
