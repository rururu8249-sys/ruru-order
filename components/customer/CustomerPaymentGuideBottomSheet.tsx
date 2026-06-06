// components/customer/CustomerPaymentGuideBottomSheet.tsx
// 목적: 공통으로 사용하는 입금안내 바텀시트
// 주의: UI 전용. DB, API, 주문저장, 입금매칭, 정산, 배송 로직 없음.

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

  const normalButtonClass =
    "flex min-h-[46px] items-center justify-center rounded-[16px] bg-white px-3 py-2 text-[13px] font-black tracking-[-0.04em] text-slate-800 ring-1 ring-slate-200 transition active:scale-[0.98]";
  const doneButtonClass =
    "flex min-h-[46px] items-center justify-center rounded-[16px] bg-rose-deep px-3 py-2 text-[13px] font-black tracking-[-0.04em] text-white ring-1 ring-rose-deep transition active:scale-[0.98]";

  return (
    <div
      data-ruru-payment-guide-bottom-sheet="shell-v2"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/45 px-3"
      role="dialog"
      aria-modal="true"
      aria-label={isOrderComplete ? "주문 접수 완료 및 입금 안내" : "입금 안내"}
    >
      <div className="w-full max-w-[430px] overflow-hidden rounded-t-[30px] bg-white shadow-[0_-22px_70px_rgba(15,23,42,0.22)]">
        <div className="mx-auto mt-3 h-1.5 w-14 rounded-full bg-slate-200" />

        <div className="max-h-[86dvh] overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-5">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-black tracking-[-0.04em] text-rose-deep">
                루루동이 LIVE
              </p>
              <h2 className="mt-1 text-[26px] font-black leading-tight tracking-[-0.07em] text-slate-950">
                {isOrderComplete ? "주문 접수 완료" : "입금 안내"}
              </h2>
              <p className="mt-2 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
                {isOrderComplete
                  ? "입금자명과 계좌번호를 확인해주세요."
                  : "현재 보이는 닉네임으로 입금해주세요."}
              </p>
            </div>

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-rose-soft text-[25px] ring-1 ring-rose-line">
              {isOrderComplete ? "✅" : "💙"}
            </div>
          </header>

          {isOrderComplete && showBankGuide && (
            <div className="mt-4 rounded-[18px] bg-slate-950 px-4 py-3 text-[13px] font-black leading-relaxed tracking-[-0.04em] text-white">
              닉네임과 결제금액이 정확히 맞아야 자동 입금확인이 됩니다.
            </div>
          )}

          {isFullyPaidByPoints && (
            <section className="mt-4 rounded-[22px] bg-emerald-50 p-4 ring-1 ring-emerald-100">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-white text-[23px] ring-1 ring-emerald-100">
                  ✅
                </div>
                <div className="min-w-0">
                  <h3 className="text-[18px] font-black tracking-[-0.06em] text-emerald-900">
                    포인트로 결제완료
                  </h3>
                  <p className="mt-1 break-keep text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-emerald-800">
                    추가 입금 없이 주문이 접수됐습니다.
                  </p>
                </div>
              </div>
            </section>
          )}

          {showCardGuide && (
            <section className="mt-4 rounded-[22px] bg-rose-soft p-4 ring-1 ring-rose-line">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-white text-[23px] ring-1 ring-rose-line">
                  💳
                </div>
                <div className="min-w-0">
                  <h3 className="text-[18px] font-black tracking-[-0.06em] text-rose-deep">
                    카드결제 안내
                  </h3>
                  <p className="mt-1 break-keep text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-rose-deep">
                    카드결제는 카톡채널 안내에 따라 진행해주세요.
                  </p>
                </div>
              </div>
            </section>
          )}

          {showBankGuide && (
            <>
              <section className="mt-4 rounded-[22px] bg-rose-soft p-4 ring-1 ring-rose-line">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-black tracking-[-0.04em] text-slate-500">
                      입금자명
                    </p>
                    <p
                      className="mt-1 truncate text-[30px] font-black leading-tight tracking-[-0.08em] text-rose-deep"
                      title={safeNickname}
                    >
                      {safeNickname}
                    </p>
                    <p className="mt-2 break-keep text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
                      이 닉네임으로 입금해주세요.
                    </p>
                  </div>

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-white/80 text-[24px] ring-1 ring-rose-line">
                    👤
                  </div>
                </div>
              </section>

              <section className="mt-3 rounded-[22px] bg-amber-50 p-4 ring-1 ring-amber-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black tracking-[-0.04em] text-slate-500">
                      계좌번호
                    </p>
                    <p
                      className="mt-1 break-all text-[19px] font-black leading-snug tracking-[-0.06em] text-slate-950"
                      title={`${safeBankName} ${safeBankAccount}`}
                    >
                      {safeBankName} {safeBankAccount}
                    </p>
                    <p className="mt-2 text-[13px] font-black tracking-[-0.04em] text-slate-700">
                      예금주 {safeBankHolder}
                    </p>
                  </div>

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-white/80 text-[24px] ring-1 ring-amber-100">
                    🏦
                  </div>
                </div>
              </section>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onCopyNickname}
                  className={nicknameCopyDone ? doneButtonClass : normalButtonClass}
                >
                  {nicknameCopyDone ? "고객 닉네임 복사완료" : "입금자명(닉네임) 복사"}
                </button>

                <button
                  type="button"
                  onClick={onCopyBankAccount}
                  className={bankCopyDone ? doneButtonClass : normalButtonClass}
                >
                  {bankCopyDone ? "계좌번호 복사완료" : "계좌번호 복사"}
                </button>
              </div>


            </>
          )}

          {isOrderComplete && (
            <section className="mt-4 rounded-[22px] bg-white p-4 ring-1 ring-slate-200">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-[18px] font-black tracking-[-0.06em] text-slate-950">
                  주문 상품
                </h3>
                <span className="rounded-full bg-rose-soft px-3 py-1 text-[12px] font-black text-rose-deep ring-1 ring-rose-line">
                  총 {totalQty || orderItems.length}개
                </span>
              </div>

              <div className="grid gap-2">
                {orderItems.length > 0 ? (
                  orderItems.map((item, index) => {
                    const qty = toNumber(item.qty);
                    const amount = toNumber(item.product_price) * qty;

                    return (
                      <div
                        key={`${itemTitle(item)}-${index}`}
                        className="rounded-[18px] bg-slate-50 px-3 py-3 ring-1 ring-slate-100"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-keep text-[14px] font-black leading-relaxed tracking-[-0.04em] text-slate-950">
                              {itemTitle(item)}
                            </p>
                            <p className="mt-1 text-[12px] font-bold text-slate-500">
                              수량 {qty || 0}개
                            </p>
                          </div>
                          <p className="shrink-0 text-right text-[14px] font-black text-rose-deep">
                            {won(amount)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[18px] bg-slate-50 px-3 py-4 text-center text-[13px] font-bold text-slate-500 ring-1 ring-slate-100">
                    주문 상품 정보가 비어 있습니다.
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-[18px] bg-rose-soft p-3 ring-1 ring-rose-line">
                <div className="flex items-center justify-between py-1 text-[13px] font-bold text-slate-600">
                  <span>상품금액</span>
                  <span>{won(safeProductAmount)}</span>
                </div>

                <div className="flex items-center justify-between py-1 text-[13px] font-bold text-slate-600">
                  <span>배송비</span>
                  <span>{won(safeShippingFee)}</span>
                </div>

                {safePointUsedAmount > 0 && (
                  <div className="flex items-center justify-between py-1 text-[13px] font-black text-emerald-700">
                    <span>포인트 사용</span>
                    <span>-{won(safePointUsedAmount)}</span>
                  </div>
                )}

                <div className="mt-2 flex items-center justify-between border-t border-rose-line pt-3 text-[17px] font-black text-slate-950">
                  <span>{safePointUsedAmount > 0 ? "최종 결제금액" : "결제금액"}</span>
                  <span className="text-rose-deep">{won(safeFinalAmount)}</span>
                </div>
              </div>
            </section>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-[18px] bg-rose-deep px-4 py-3 text-[16px] font-black tracking-[-0.05em] text-white shadow-[0_12px_28px_rgba(216,90,48,0.24)] transition active:scale-[0.98]"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
