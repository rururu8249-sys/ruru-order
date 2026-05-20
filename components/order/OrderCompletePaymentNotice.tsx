// components/order/OrderCompletePaymentNotice.tsx
// 목적: 주문완료 후 입금/결제 안내 UI
// 주의: UI 전용. 주문 저장, 주문번호 생성, 금액 계산, 입금매칭, Supabase 로직 없음.

type OrderCompletePaymentNoticeProps = {
  nickname: string;
  name: string;
  paymentMethod: "무통장입금" | "카드결제";
  totalAmount: number;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
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
}: OrderCompletePaymentNoticeProps) {
  const depositName = String(nickname || name || "").trim() || "주문자명";

  return (
    <section className="mt-5 rounded-[30px] bg-white p-5 shadow-[0_14px_30px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="rounded-[24px] bg-blue-50 px-4 py-4 ring-1 ring-blue-100">
        <p className="text-[22px] font-black tracking-[-0.07em] text-[#151923]">
          주문서가 정상 접수되었어요
        </p>

        <p className="mt-2 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-blue-800">
          아래 결제정보를 확인하고 입금을 진행해주세요.
        </p>

        <div className="mt-3 inline-flex rounded-full bg-white px-3 py-2 text-[13px] font-black text-blue-700 ring-1 ring-blue-100">
          💰 보유 포인트 0원
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
          <div className="flex justify-between gap-3 text-[14px] font-bold text-slate-500">
            <span>결제방식</span>
            <span className="text-right font-black text-slate-900">{paymentMethod}</span>
          </div>

          <div className="mt-2 flex justify-between gap-3 text-[14px] font-bold text-slate-500">
            <span>입금자명</span>
            <span className="text-right font-black text-blue-700">{depositName}</span>
          </div>

          <div className="mt-2 flex justify-between gap-3 text-[14px] font-bold text-slate-500">
            <span>입금금액</span>
            <span className="text-right text-[18px] font-black text-slate-950">{won(totalAmount)}</span>
          </div>
        </div>

        {paymentMethod === "무통장입금" ? (
          <>
            <div className="rounded-2xl bg-slate-950 px-4 py-4 text-white">
              <p className="text-[13px] font-bold text-white/70">입금계좌</p>
              <p className="mt-1 text-[20px] font-black tracking-[-0.04em]">
                {bankName} {bankAccount}
              </p>
              <p className="mt-1 text-[14px] font-bold text-white/80">
                예금주 {bankHolder}
              </p>
            </div>

            <div className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] font-black leading-relaxed tracking-[-0.04em] text-red-700 ring-1 ring-red-100">
              반드시 현재 닉네임과 동일한 이름으로 입금해주세요.
              <br />
              닉네임이나 금액이 다르면 입금확인이 늦어질 수 있어요.
            </div>

            <div className="rounded-2xl bg-blue-50 px-4 py-3 text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-blue-800 ring-1 ring-blue-100">
              입금 후 10~30분 내 자동 확인될 수 있습니다.
              <br />
              은행 상황에 따라 시간이 달라질 수 있습니다.
            </div>
          </>
        ) : (
          <div className="rounded-2xl bg-blue-50 px-4 py-4 text-[13px] font-black leading-relaxed tracking-[-0.04em] text-blue-800 ring-1 ring-blue-100">
            카드결제는 카톡채널로 문의해주세요.
            <br />
            카드결제 시 부가세 +10%가 적용됩니다.
          </div>
        )}
      </div>
    </section>
  );
}
