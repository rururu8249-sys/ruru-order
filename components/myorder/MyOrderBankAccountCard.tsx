// components/myorder/MyOrderBankAccountCard.tsx
// 목적: 주문조회 페이지 입금계좌 다시보기 카드
// 주의: UI 전용. 주문조회 Supabase 로직, 입금매칭, 주문저장, 정산 로직 없음.

type MyOrderBankAccountCardProps = {
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  copyDone: boolean;
  nicknameCopyDone: boolean;
  depositNickname?: string;
  onCopy: () => void;
  onCopyNickname: () => void;
};

export default function MyOrderBankAccountCard({
  bankName,
  bankAccount,
  bankHolder,
  copyDone,
  nicknameCopyDone,
  depositNickname,
  onCopy,
  onCopyNickname,
}: MyOrderBankAccountCardProps) {
  const safeNickname = String(depositNickname || "").trim() || "주문서 닉네임";

  const copyButtonClass =
    "min-h-[42px] rounded-[15px] bg-white px-3 py-2 text-[12px] font-black tracking-[-0.04em] text-slate-800 ring-1 ring-slate-200 transition active:scale-[0.98]";
  const copyDoneButtonClass =
    "min-h-[42px] rounded-[15px] bg-blue-600 px-3 py-2 text-[12px] font-black tracking-[-0.04em] text-white ring-1 ring-blue-600 transition active:scale-[0.98]";

  return (
    <section
      data-ruru-myorder-bank-card="shell-v2"
      className="mt-3 rounded-[20px] bg-white p-3 ring-1 ring-slate-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-black tracking-[-0.04em] text-blue-700">
            입금안내
          </p>
          <h2 className="mt-0.5 break-keep text-[17px] font-black leading-tight tracking-[-0.06em] text-slate-950">
            입금자명과 금액을 정확히 확인해주세요
          </h2>
        </div>

        <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100">
          자동확인
        </span>
      </div>

      <div className="mt-3 grid gap-1.5 rounded-[16px] bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
        <div className="flex items-center justify-between gap-3 text-[13px] font-black tracking-[-0.04em]">
          <span className="shrink-0 text-slate-500">입금자명</span>
          <span
            className="min-w-0 truncate text-right text-blue-700"
            title={safeNickname}
          >
            {safeNickname}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 text-[13px] font-bold tracking-[-0.04em] text-slate-700">
          <span className="shrink-0 text-slate-500">계좌</span>
          <span className="min-w-0 truncate text-right tabular-nums" title={`${bankName} ${bankAccount}`}>
            {bankName} {bankAccount}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 text-[13px] font-bold tracking-[-0.04em] text-slate-700">
          <span className="shrink-0 text-slate-500">예금주</span>
          <span className="text-right">{bankHolder}</span>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCopyNickname}
          className={nicknameCopyDone ? copyDoneButtonClass : copyButtonClass}
        >
          {nicknameCopyDone ? "고객 닉네임 복사완료" : "입금자명(닉네임) 복사"}
        </button>

        <button
          type="button"
          onClick={onCopy}
          className={copyDone ? copyDoneButtonClass : copyButtonClass}
        >
          {copyDone ? "계좌번호 복사완료" : "계좌번호 복사"}
        </button>
      </div>

      <p className="mt-2 break-keep text-[11px] font-bold leading-relaxed tracking-[-0.04em] text-slate-500">
        입금자명과 결제금액이 주문서와 정확히 같아야 자동 입금확인이 됩니다.
      </p>
    </section>
  );
}
