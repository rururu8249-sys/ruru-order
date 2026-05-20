// components/order/OrderCompletePaymentNotice.tsx
// 목적: 주문완료 후 입금계좌 최상단 안내 UI
// 주의: UI 전용. 주문 저장, 주문번호 생성, 금액 계산, 입금매칭, Supabase 로직 없음.

type OrderCompletePaymentNoticeProps = {
  nickname: string;
  name: string;
  paymentMethod: "무통장입금" | "카드결제";
  totalAmount: number;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  copyDone?: boolean;
  onCopyAccount?: () => void;
};

const won = (value: number) => `${Number(value || 0).toLocaleString()}원`;

export default function OrderCompletePaymentNotice({
  nickname,
  name,
  paymentMethod,
  totalAmount,
  bankName,
  bankAccount,
  bankHolder,
  copyDone = false,
  onCopyAccount,
}: OrderCompletePaymentNoticeProps) {
  const depositName = String(nickname || name || "").trim() || "현재 닉네임";

  if (paymentMethod === "카드결제") {
    return (
      <section className="mt-4 grid gap-4">
        <section className="rounded-[30px] bg-white p-5 shadow-[0_14px_35px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
          <div className="text-[13px] font-black text-blue-600">카드결제 안내</div>

          <h1 className="mt-2 text-[28px] font-black tracking-[-0.08em] text-[#151923]">
            주문서가 정상 접수되었어요
          </h1>

          <div className="mt-4 rounded-[24px] bg-blue-50 p-4 text-[14px] font-black leading-relaxed text-blue-800 ring-1 ring-blue-100">
            카드결제는 카톡채널로 문의해주세요.
            <br />
            관리자 확인 후 결제 링크를 보내드립니다.
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="mt-4 grid gap-4">
      <section className="rounded-[30px] bg-white p-5 shadow-[0_14px_35px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-black text-red-500">
              입금정보를 확인해주세요
            </div>

            <h1 className="mt-2 text-[30px] font-black tracking-[-0.08em] text-[#151923]">
              입금계좌 안내
            </h1>
          </div>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[24px] ring-1 ring-blue-100">
            💳
          </div>
        </div>

        <div className="mt-5 rounded-[24px] bg-yellow-50 p-5 ring-1 ring-yellow-100">
          <div className="text-[12px] font-black text-[#9a5b00]">{bankName}</div>

          <div className="mt-3 break-all text-[27px] font-black leading-tight tracking-[-0.04em] text-[#151923]">
            {bankAccount}
          </div>

          <div className="mt-3 text-[18px] font-black text-[#151923]">
            {bankHolder}
          </div>
        </div>

        <button
          type="button"
          onClick={onCopyAccount}
          className="mt-3 w-full rounded-2xl bg-[#071120] p-4 text-[15px] font-black text-white shadow-[0_10px_22px_rgba(15,23,42,0.18)] active:scale-[0.99]"
        >
          {copyDone ? "✓ 계좌번호가 복사되었습니다" : "계좌번호 복사"}
        </button>

        <div className="mt-3 grid gap-2">
          <div className="rounded-2xl bg-blue-50 px-4 py-3 text-[13px] font-black leading-relaxed text-blue-800 ring-1 ring-blue-100">
            입금자명은 <span className="text-blue-700">{depositName}</span>
            <br />
            이번 주문서 결제금액은 <span className="text-blue-700">{won(totalAmount)}</span>
          </div>

          <div className="rounded-2xl bg-red-50 px-4 py-3 text-center text-[13px] font-black leading-relaxed text-red-600 ring-1 ring-red-100">
            입금자명과 금액이 다르면 자동입금확인이 늦어질 수 있습니다.
            <br />
            입금 후 보통 10~30분 정도 걸릴 수 있어요.
          </div>

          <div className="rounded-2xl bg-green-50 px-4 py-3 text-center text-[13px] font-black text-green-700 ring-1 ring-green-100">
            ✓ {depositName}님 주문서가 정상 접수되었습니다
          </div>
        </div>
      </section>

      <section className="rounded-[30px] bg-white p-5 shadow-[0_14px_35px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[34px] font-black text-blue-600 ring-1 ring-blue-100">
            ✓
          </div>

          <div className="min-w-0">
            <h2 className="break-keep text-[23px] font-black leading-snug tracking-[-0.07em] text-[#151923]">
              주문서가 <span className="text-blue-600">정상 접수</span>되었어요
            </h2>

            <p className="mt-2 break-keep text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
              입금 확인 후 상품을 준비해 보내드릴게요.
            </p>
          </div>
        </div>
      </section>
    </section>
  );
}
