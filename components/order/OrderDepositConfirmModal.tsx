"use client";

type OrderDepositConfirmModalProps = {
  open: boolean;
  nickname: string;
  totalAmount: number;
  onConfirm: (hideFor24Hours: boolean) => void;
};

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

export default function OrderDepositConfirmModal({
  open,
  nickname,
  totalAmount,
  onConfirm,
}: OrderDepositConfirmModalProps) {
  if (!open) return null;

  const safeNickname = String(nickname || "").trim() || "현재 닉네임";
  const safeTotalAmount = Number(totalAmount || 0);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 px-3 py-3 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
    >
      <section className="flex max-h-[92dvh] w-full max-w-[350px] flex-col overflow-hidden rounded-[25px] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.38)] ring-1 ring-blue-100">
        <div className="shrink-0 px-4 pb-3 pt-4 text-center">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-[20px] ring-1 ring-amber-100">
            ⚠️
          </div>

          <h2 className="mt-2 text-[20px] font-black tracking-[-0.06em] text-slate-950">
            입금 전 꼭 확인해주세요
          </h2>

          <p className="mt-1 text-[12px] font-bold leading-relaxed tracking-[-0.03em] text-slate-500">
            아래 2가지가 정확히 일치해야 자동확인됩니다.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 overscroll-contain">
          <div className="rounded-[19px] bg-blue-50 p-3 ring-1 ring-blue-100">
            <div className="text-[12px] font-black text-blue-700">
              이번 주문서 결제금액
            </div>
            <div className="mt-1 text-[25px] font-black tracking-[-0.06em] text-blue-700">
              {money(safeTotalAmount)}
            </div>
          </div>

          <div className="mt-2 grid gap-2">
            <div className="rounded-[17px] bg-white p-3 shadow-sm ring-1 ring-slate-100">
              <div className="text-[11px] font-black text-slate-400">
                1. 입금자명
              </div>
              <div className="mt-1 break-all text-[19px] font-black tracking-[-0.05em] text-slate-950">
                {safeNickname}
              </div>
            </div>

            <div className="rounded-[17px] bg-white p-3 shadow-sm ring-1 ring-slate-100">
              <div className="text-[11px] font-black text-slate-400">
                2. 입금금액
              </div>
              <div className="mt-1 text-[19px] font-black tracking-[-0.05em] text-slate-950">
                {money(safeTotalAmount)}
              </div>
            </div>
          </div>

          <div className="mt-2 rounded-[17px] bg-slate-50 p-3 text-[12px] font-black leading-relaxed tracking-[-0.03em] text-slate-800 ring-1 ring-slate-100">
            <p className="text-blue-700">
              ✅ 입금자명 + 입금금액이 일치하면
            </p>
            <p>보통 10~30분 내 자동입금확인됩니다.</p>
          </div>

          <div className="mt-2 rounded-[17px] bg-orange-50 p-3 text-[12px] font-black leading-relaxed tracking-[-0.03em] text-orange-700 ring-1 ring-orange-100">
            나눠 입금하거나, 여러 주문서 금액을 합쳐 입금하면 자동확인이 안 될 수 있어요.
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3">
          <div className="grid grid-cols-[0.92fr_1.08fr] gap-2">
            <button
              type="button"
              onClick={() => onConfirm(true)}
              className="h-12 rounded-[17px] bg-slate-100 px-2 text-[12px] font-black tracking-[-0.04em] text-slate-700 active:scale-[0.98]"
            >
              24시간 열지 않기
            </button>

            <button
              type="button"
              onClick={() => onConfirm(false)}
              className="h-12 rounded-[17px] bg-blue-600 px-2 text-[13px] font-black tracking-[-0.04em] text-white shadow-[0_10px_22px_rgba(37,99,235,0.28)] active:scale-[0.98]"
            >
              확인하고 제출
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
