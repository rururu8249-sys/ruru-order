// components/order/OrderDepositConfirmModal.tsx
// 목적: 주문서 제출 버튼 클릭 후, 실제 주문 저장 전 입금자명/입금금액 확인 팝업
// 주의:
// - UI 전용 컴포넌트입니다.
// - 주문 저장, 금액 계산, 배송비, 입금매칭, Supabase 로직을 건드리지 않습니다.
// - 작은 스마트폰에서도 내용이 잘리지 않도록 max-height + 내부 스크롤 + 하단 버튼 고정 구조를 사용합니다.

type OrderDepositConfirmModalProps = {
  open: boolean;
  nickname: string;
  totalAmount: number;
  onConfirm: (hideFor24Hours: boolean) => void;
};

const formatWon = (value: number) => {
  return `${Math.max(0, Number(value || 0)).toLocaleString("ko-KR")}원`;
};

export default function OrderDepositConfirmModal({
  open,
  nickname,
  totalAmount,
  onConfirm,
}: OrderDepositConfirmModalProps) {
  const safeNickname = String(nickname || "").trim() || "현재 닉네임";
  const safeAmount = formatWon(totalAmount);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/72 px-3 py-3 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
    >
      <section className="flex max-h-[calc(100dvh-24px)] w-full max-w-[430px] flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.42)] ring-1 ring-white/70">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-5 sm:px-5">
          <div className="mx-auto mb-3 flex w-fit items-center rounded-full bg-blue-50 px-4 py-2 text-[14px] font-black tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100">
            주문서 제출 전 확인
          </div>

          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-blue-600 text-[32px] text-white shadow-[0_14px_28px_rgba(37,99,235,0.26)]">
              
            </div>

            <h2 className="mt-4 break-keep text-[28px] font-black leading-[1.15] tracking-[-0.08em] text-[#151923] sm:text-[31px]">
              입금 전 꼭
              <br />
              확인해주세요
            </h2>

            <p className="mt-3 break-keep text-[15px] font-black leading-relaxed tracking-[-0.04em] text-slate-600">
              닉네임과 금액이 정확히 맞아야
              <br />
              자동 입금확인 처리가 가능합니다
            </p>
          </div>

          <div className="mt-5 grid gap-3">
            <div className="rounded-[24px] bg-blue-50 p-3 ring-1 ring-blue-100">
              <div className="mb-1 flex items-center gap-2 text-[13px] font-black tracking-[-0.04em] text-blue-700">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-[17px] text-white">
                  
                </span>
                현재 주문서 금액
              </div>

              <div className="break-all pl-10 text-[28px] font-black leading-tight tracking-[-0.05em] text-blue-700">
                {safeAmount}
              </div>
            </div>

            <div className="rounded-[24px] bg-slate-50 p-3 ring-1 ring-slate-100">
              <div className="mb-1 flex items-center gap-2 text-[13px] font-black tracking-[-0.04em] text-slate-700">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[17px] text-white">
                  👤
                </span>
                설정된 입금 닉네임
              </div>

              <div className="break-all pl-10 text-[26px] font-black leading-tight tracking-[-0.05em] text-[#151923]">
                {safeNickname}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] bg-yellow-50 p-4 text-center ring-1 ring-yellow-100">
            <p className="break-keep text-[19px] font-black leading-relaxed tracking-[-0.06em] text-[#151923]">
              입금자명은{" "}
              <span className="text-blue-700">{safeNickname}</span>
              <br />
              입금금액은{" "}
              <span className="text-blue-700">{safeAmount}</span>
            </p>

            <p className="mt-3 break-keep text-[15px] font-black leading-relaxed tracking-[-0.04em] text-slate-700">
              다르게 입금하면 자동확인이 안 될 수 있어요.
              <br />
              자동 입금확인은 보통 10분 정도 소요됩니다.
            </p>
          </div>

          <div className="mt-3 rounded-[20px] bg-red-50 px-4 py-3 text-[13px] font-black leading-relaxed tracking-[-0.04em] text-red-700 ring-1 ring-red-100">
            ⚠️ 여러 주문 금액을 합쳐 입금하거나, 나눠 입금하면 자동확인이 늦어질 수 있습니다.
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onConfirm(true)}
              className="min-h-[54px] rounded-[18px] bg-slate-100 px-3 py-3 text-[15px] font-black tracking-[-0.05em] text-slate-700 transition active:scale-[0.98]"
            >
              24시간 열지 않기
            </button>

            <button
              type="button"
              onClick={() => onConfirm(false)}
              className="min-h-[54px] rounded-[18px] bg-blue-600 px-3 py-3 text-[17px] font-black tracking-[-0.05em] text-white shadow-[0_12px_24px_rgba(37,99,235,0.25)] transition active:scale-[0.98]"
            >
              확인
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
