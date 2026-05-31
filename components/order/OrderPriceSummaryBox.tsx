// components/order/OrderPriceSummaryBox.tsx
// 목적: 주문서 금액 요약 UI 전용
// 주의: 계산은 밖에서 끝난 값을 props로만 받습니다. 주문 저장/입금/정산/Supabase 로직 없음.

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
  showPointUse = false,
  onPointUseInputChange,
  onUseAllPoints,
}: OrderPriceSummaryBoxProps) {
  const safePointBalance = Math.max(0, Number(customerPointBalance || 0));
  const safePointUsedAmount = Math.max(0, Number(pointUsedAmount || 0));
  const hasSmallPoint = safePointBalance > 0 && safePointBalance < 1000;

  return (
    <section
      data-ruru-price-summary-box="flat-balanced"
      className="w-full"
    >
      <div className="rounded-[22px] bg-blue-50 px-4 py-4 ring-1 ring-blue-100">
        <div className="flex items-center justify-between text-[15px] font-black tracking-[-0.04em] text-slate-600">
          <span>상품금액</span>
          <span className="tabular-nums text-slate-700">{won(productAmount)}</span>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-[15px] font-black tracking-[-0.04em] text-slate-600">
          <span>배송비</span>
          <span className="tabular-nums text-slate-700">{won(shippingFee)}</span>
        </div>

        {paymentMethod === "카드결제" && (
          <div className="mt-2.5 flex items-center justify-between text-[15px] font-black tracking-[-0.04em] text-blue-700">
            <span>카드결제 추가금액</span>
            <span className="tabular-nums">{won(cardExtra)}</span>
          </div>
        )}

        {customerPointLoading ? (
          <div className="mt-4 rounded-[18px] bg-white/70 px-4 py-3 text-[13px] font-black text-blue-700 ring-1 ring-blue-100">
            포인트 확인중...
          </div>
        ) : showPointUse ? (
          <div className="mt-4 border-t border-blue-100 pt-4">
            <div className="flex items-center justify-between gap-3 text-[15px] font-black tracking-[-0.04em] text-blue-800">
              <span>보유 포인트</span>
              <span className="tabular-nums">{won(safePointBalance)}</span>
            </div>

            <div className="mt-3 grid gap-2.5" data-ruru-point-input-stack>
              <div className="relative w-full" data-ruru-point-input-layout>
                <input
                  value={pointUseInput}
                  onChange={(event) => onPointUseInputChange?.(event.target.value)}
                  inputMode="numeric"
                  placeholder="직접입력"
                  className="h-13 min-w-0 w-full rounded-[18px] border border-blue-100 bg-white px-4 text-center text-[15px] font-black tabular-nums text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-black text-blue-500">
                  원
                </span>
              </div>

              <button
                type="button"
                onClick={onUseAllPoints}
                className="h-13 w-full rounded-[18px] bg-blue-600 px-4 text-[15px] font-black text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                전액사용
              </button>
            </div>

            <div className="mt-2 text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-slate-500">
              포인트는 1,000원 이상부터 사용 가능하며, 주문금액을 초과해 사용할 수 없습니다.
            </div>
          </div>
        ) : hasSmallPoint ? (
          <div className="mt-4 border-t border-blue-100 pt-4 text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
            보유 포인트 {won(safePointBalance)}
            <br />
            포인트는 1,000원 이상부터 사용할 수 있습니다.
          </div>
        ) : null}

        {safePointUsedAmount > 0 && (
          <div className="mt-3 flex items-center justify-between border-t border-blue-100 pt-3 text-[15px] font-black tracking-[-0.04em] text-emerald-700">
            <span>포인트 사용</span>
            <span className="tabular-nums">-{won(safePointUsedAmount)}</span>
          </div>
        )}


      </div>
    </section>
  );
}
