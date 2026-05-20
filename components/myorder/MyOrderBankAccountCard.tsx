// components/myorder/MyOrderBankAccountCard.tsx
// 목적: 주문조회 페이지 입금계좌 다시보기 카드
// 주의: UI 전용. 입금확인, 입금매칭, DB 로직 없음.

type MyOrderBankAccountCardProps = {
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  copyDone: boolean;
  onCopy: () => void;
};

export default function MyOrderBankAccountCard({
  bankName,
  bankAccount,
  bankHolder,
  copyDone,
  onCopy,
}: MyOrderBankAccountCardProps) {
  return (
    <section className="mb-4 rounded-[30px] bg-white p-5 shadow-[0_12px_26px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-black tracking-[-0.04em] text-blue-700">
            입금계좌 확인
          </div>

          <h2 className="mt-1 text-[24px] font-black tracking-[-0.07em] text-[#151923]">
            계좌번호 다시 보기
          </h2>
        </div>

        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[25px] ring-1 ring-blue-100">
          💳
        </div>
      </div>

      <div className="mt-4 rounded-[24px] bg-slate-950 p-5 text-white">
        <div className="text-sm font-black text-white/70">{bankName}</div>

        <div className="mt-2 break-all text-[28px] font-black tracking-[-0.05em]">
          {bankAccount}
        </div>

        <div className="mt-2 text-lg font-black text-white/90">
          예금주 {bankHolder}
        </div>
      </div>

      <button
        type="button"
        onClick={onCopy}
        className="mt-3 w-full rounded-2xl bg-blue-600 p-4 font-black text-white shadow-[0_10px_20px_rgba(37,99,235,0.18)] transition active:scale-[0.97]"
      >
        {copyDone ? "✓ 계좌번호가 복사되었습니다" : "계좌번호 복사"}
      </button>

      <p className="mt-3 rounded-2xl bg-red-50 p-3 text-center text-sm font-black leading-relaxed text-red-700 ring-1 ring-red-100">
        입금 시 주문자명과 입금자명이 다르면 확인이 늦어질 수 있습니다.
      </p>
    </section>
  );
}
