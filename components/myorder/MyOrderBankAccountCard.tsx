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

  return (
    <section
      data-ruru-myorder-bank-card="compact"
      className="mt-4 rounded-[22px] bg-blue-50 p-4 ring-1 ring-blue-100"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-black tracking-[-0.04em] text-blue-700">
            입금정보
          </p>
          <h2 className="mt-1 text-[18px] font-black tracking-[-0.06em] text-slate-950">
            닉네임/금액 정확히 입금
          </h2>
        </div>

        <div className="shrink-0 rounded-full bg-white px-3 py-1 text-[12px] font-black text-blue-700 ring-1 ring-blue-100">
          자동확인
        </div>
      </div>

      <div className="mt-3 rounded-[18px] bg-white p-3 ring-1 ring-blue-100">
        <div className="grid gap-1.5 text-[13px] font-black tracking-[-0.04em] text-slate-700">
          <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 text-slate-500">입금자명</span>
            <span className="min-w-0 truncate text-right text-blue-700">{safeNickname}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 text-slate-500">은행</span>
            <span className="text-right">{bankName}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 text-slate-500">계좌</span>
            <span className="min-w-0 truncate text-right tabular-nums">{bankAccount}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 text-slate-500">예금주</span>
            <span className="text-right">{bankHolder}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCopyNickname}
          className="min-h-[46px] rounded-[16px] bg-white px-3 py-2 text-[13px] font-black tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100 transition active:scale-[0.98]"
        >
          {nicknameCopyDone ? "입금자명 복사완료" : "입금자명(닉네임) 복사"}
        </button>

        <button
          type="button"
          onClick={onCopy}
          className="min-h-[46px] rounded-[16px] bg-slate-950 px-3 py-2 text-[13px] font-black tracking-[-0.04em] text-white shadow-[0_10px_20px_rgba(15,23,42,0.18)] transition active:scale-[0.98]"
        >
          {copyDone ? "계좌 복사완료" : "계좌번호 복사"}
        </button>
      </div>

      <p className="mt-3 break-keep text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
        입금자명은 <span className="font-black text-blue-700">{safeNickname}</span>, 입금금액은
        주문서 결제금액과 정확히 같아야 자동 입금확인이 됩니다.
      </p>
    </section>
  );
}
