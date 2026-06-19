"use client";

import { formatMoneyInput, onlyDigits } from "./settlementUtils";

type Props = {
  actualCardFeeRate: string;
  customerCardExtraRate: string;
  cardPaymentMinAmount: string;
  saving: boolean;
  onActualCardFeeRateChange: (value: string) => void;
  onCustomerCardExtraRateChange: (value: string) => void;
  onCardPaymentMinAmountChange: (value: string) => void;
  onSave: () => void;
};

export default function SettlementSettingsCard({
  actualCardFeeRate,
  customerCardExtraRate,
  cardPaymentMinAmount,
  saving,
  onActualCardFeeRateChange,
  onCustomerCardExtraRateChange,
  onCardPaymentMinAmountChange,
  onSave,
}: Props) {
  return (
    <div className="overflow-hidden rounded-[30px] border border-line bg-surface p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black tracking-[0.22em] text-info-tx">SETTLEMENT SETTINGS</div>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-ink">정산 기준 설정</h3>
          <p className="mt-2 text-sm font-bold text-ink-soft">
            새 주문부터 적용되는 카드수수료·고객 부가세·카드결제 최소금액 기준입니다.
          </p>
        </div>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-2xl bg-rose-deep px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-rose-deep disabled:cursor-wait disabled:opacity-50"
        >
          {saving ? "저장중" : "정산 설정 저장"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-[24px] border border-line bg-surface-2 p-4">
          <div className="text-xs font-black text-ink-soft">실제 카드업체 수수료율</div>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={actualCardFeeRate}
              onChange={(event) => onActualCardFeeRateChange(onlyDigits(event.target.value))}
              className="h-12 w-full rounded-2xl border border-line bg-surface px-4 text-lg font-black outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />
            <span className="text-sm font-black text-ink-soft">%</span>
          </div>
          <div className="mt-2 text-xs font-bold text-ink-mute">카드 결제완료 금액에서 지출로 차감합니다.</div>
        </div>

        <div className="rounded-[24px] border border-line bg-surface-2 p-4">
          <div className="text-xs font-black text-ink-soft">고객 카드 부가세율</div>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={customerCardExtraRate}
              onChange={(event) => onCustomerCardExtraRateChange(onlyDigits(event.target.value))}
              className="h-12 w-full rounded-2xl border border-line bg-surface px-4 text-lg font-black outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />
            <span className="text-sm font-black text-ink-soft">%</span>
          </div>
          <div className="mt-2 text-xs font-bold text-ink-mute">고객 주문서에 부과되는 카드 추가금 기준입니다.</div>
        </div>

        <div className="rounded-[24px] border border-line bg-surface-2 p-4">
          <div className="text-xs font-black text-ink-soft">카드결제 최소금액</div>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={cardPaymentMinAmount}
              onChange={(event) => onCardPaymentMinAmountChange(formatMoneyInput(event.target.value))}
              className="h-12 w-full rounded-2xl border border-line bg-surface px-4 text-lg font-black outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />
            <span className="text-sm font-black text-ink-soft">원</span>
          </div>
          <div className="mt-2 text-xs font-bold text-ink-mute">고객 주문서 카드결제 제한 기준입니다.</div>
        </div>
      </div>
    </div>
  );
}
