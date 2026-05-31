// components/customer/CustomerPaymentGuideBottomSheet.tsx
// 목적: 공통으로 사용하는 입금안내 바텀시트
// 주의: UI 전용. DB, API, 주문저장, 입금매칭, 정산, 배송 로직 없음.

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
}: CustomerPaymentGuideBottomSheetProps) {
  if (!open) return null;

  const safeNickname = String(depositNickname || "").trim() || "주문서 닉네임";
  const safeBankName = String(bankName || "").trim();
  const safeBankAccount = String(bankAccount || "").trim();
  const safeBankHolder = String(bankHolder || "").trim();

  const normalButtonClass =
    "flex min-h-[46px] items-center justify-center rounded-[16px] bg-white px-3 py-2 text-[13px] font-black tracking-[-0.04em] text-slate-800 ring-1 ring-slate-200 transition active:scale-[0.98]";
  const doneButtonClass =
    "flex min-h-[46px] items-center justify-center rounded-[16px] bg-blue-600 px-3 py-2 text-[13px] font-black tracking-[-0.04em] text-white ring-1 ring-blue-600 transition active:scale-[0.98]";

  return (
    <div
      data-ruru-payment-guide-bottom-sheet="shell-v1"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/45 px-3"
      role="dialog"
      aria-modal="true"
      aria-label="입금 안내"
    >
      <div className="w-full max-w-[430px] overflow-hidden rounded-t-[30px] bg-white shadow-[0_-22px_70px_rgba(15,23,42,0.22)]">
        <div className="mx-auto mt-3 h-1.5 w-14 rounded-full bg-slate-200" />

        <div className="max-h-[86dvh] overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-5">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-black tracking-[-0.04em] text-blue-700">
                루루동이 LIVE
              </p>
              <h2 className="mt-1 text-[26px] font-black leading-tight tracking-[-0.07em] text-slate-950">
                입금 안내
              </h2>
              <p className="mt-2 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
                현재 보이는 <span className="font-black text-blue-700">닉네임</span>으로 입금해주세요.
              </p>
            </div>

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-blue-50 text-[25px] ring-1 ring-blue-100">
              💙
            </div>
          </header>

          <section className="mt-4 rounded-[22px] bg-blue-50 p-4 ring-1 ring-blue-100">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-black tracking-[-0.04em] text-slate-500">
                  입금자명
                </p>
                <p
                  className="mt-1 truncate text-[30px] font-black leading-tight tracking-[-0.08em] text-blue-700"
                  title={safeNickname}
                >
                  {safeNickname}
                </p>
                <p className="mt-2 break-keep text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
                  현재 닉네임 그대로 입금해야 자동 확인됩니다.
                </p>
              </div>

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-white/80 text-[24px] ring-1 ring-blue-100">
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

          <div className="mt-3 rounded-[18px] bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
            <p className="break-keep text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
              입금자명과 결제금액이 주문서와 정확히 같아야 자동 입금확인이 됩니다.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-[18px] bg-blue-600 px-4 py-3 text-[16px] font-black tracking-[-0.05em] text-white shadow-[0_12px_28px_rgba(37,99,235,0.24)] transition active:scale-[0.98]"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
