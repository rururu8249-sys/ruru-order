// components/myorder/MyOrderBankAccountCard.tsx
// 목적: 주문조회 페이지 입금계좌 다시보기 카드
// 주의: UI 전용. 주문조회 Supabase 로직, 입금매칭, 주문저장, 정산 로직 없음.

type MyOrderBankAccountCardProps = {
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  copyDone: boolean;
  depositNickname?: string;
  onCopy: () => void;
};

export default function MyOrderBankAccountCard({
  bankName,
  bankAccount,
  bankHolder,
  copyDone,
  depositNickname,
  onCopy,
}: MyOrderBankAccountCardProps) {
  const safeNickname = String(depositNickname || "").trim() || "주문서 닉네임";

  return (
    <section className="mt-4 rounded-[28px] bg-white p-4 shadow-[0_10px_24px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="rounded-[24px] bg-blue-50 p-4 ring-1 ring-blue-100">
        <p className="mb-4 text-[17px] font-black tracking-[-0.05em] text-blue-700">
          입금정보를 확인해주세요
        </p>

        <div className="rounded-[20px] bg-white px-4 py-4 text-center text-[16px] font-black leading-relaxed tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100">
          <div>은행 {bankName}</div>
          <div className="mt-1">계좌 {bankAccount}</div>
          <div className="mt-1">예금주 {bankHolder}</div>
        </div>

        <button
          type="button"
          onClick={onCopy}
          className="mt-4 flex min-h-[58px] w-full items-center justify-center rounded-[22px] bg-[#071120] px-4 py-4 text-center text-[18px] font-black tracking-[-0.04em] text-white shadow-[0_12px_26px_rgba(15,23,42,0.18)] transition active:scale-[0.98]"
        >
          {copyDone ? "✓ 계좌번호 복사 완료" : "계좌번호 복사"}
        </button>

        <div className="mt-4 rounded-[20px] bg-white px-4 py-4 text-center text-[16px] font-black leading-relaxed tracking-[-0.05em] text-slate-700 ring-1 ring-blue-100">
          입금자명은 현재 닉네임{" "}
          <span className="text-blue-700">“{safeNickname}”</span> 로 입금!
          <br />
          입금금액은{" "}
          <span className="text-blue-700">주문서 결제금액</span>과 정확히 일치해야
          <br />
          <span className="text-blue-700">자동 입금확인!</span>이 됩니다.
        </div>
      </div>
    </section>
  );
}
