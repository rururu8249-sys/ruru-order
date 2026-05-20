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
  const depositName = String(nickname || name || "").trim() || "현재 닉네임";

  return (
    <section className="mt-4 grid gap-5">
      <div className="px-2 py-5 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-[0_14px_35px_rgba(30,64,175,0.12)] ring-1 ring-blue-100">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-[34px] font-black text-blue-600 ring-1 ring-blue-100">
            ✓
          </div>
        </div>

        <h1 className="mt-6 text-[34px] font-black leading-tight tracking-[-0.08em] text-[#151923]">
          주문 완료 / 입금 안내
        </h1>

        <p className="mt-3 break-keep text-[16px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
          주문해주셔서 감사합니다.
        </p>
      </div>

      <section className="rounded-[30px] bg-white p-5 shadow-[0_14px_35px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[46px] font-black text-blue-600 ring-1 ring-blue-100">
            ✓
          </div>

          <div className="min-w-0">
            <h2 className="break-keep text-[25px] font-black leading-snug tracking-[-0.07em] text-[#151923]">
              주문서가 <span className="text-blue-600">정상 접수</span>되었어요
            </h2>

            <p className="mt-2 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
              입금 확인 후 빠르게 상품을 준비해 보내드릴게요.
              <br />
              주문내역은 주문조회에서 확인하실 수 있습니다.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[30px] bg-white p-5 shadow-[0_14px_35px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-[22px] text-blue-600 ring-1 ring-blue-100">
            ▣
          </div>

          <h2 className="text-[21px] font-black tracking-[-0.06em] text-[#151923]">
            주문 정보 요약
          </h2>
        </div>

        <div className="divide-y divide-slate-100 border-y border-slate-100">
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-[15px] font-bold text-slate-600">입금자명</span>
            <span className="text-right text-[16px] font-black text-blue-600">
              {depositName}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-[15px] font-bold text-slate-600">입금금액</span>
            <span className="text-right text-[18px] font-black text-[#151923]">
              {won(totalAmount)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-[15px] font-bold text-slate-600">결제방식</span>
            <span className="text-right text-[16px] font-black text-blue-600">
              {paymentMethod}
            </span>
          </div>
        </div>

        <div className="mt-4 inline-flex rounded-full bg-blue-50 px-4 py-2 text-[13px] font-black text-blue-700 ring-1 ring-blue-100">
          💰 보유 포인트 0원
        </div>
      </section>

      {paymentMethod === "무통장입금" ? (
        <section className="rounded-[30px] bg-blue-50 p-5 shadow-[0_14px_35px_rgba(30,64,175,0.08)] ring-1 ring-blue-200">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[28px] text-blue-600 ring-1 ring-blue-100">
              🏦
            </div>

            <h2 className="text-[23px] font-black tracking-[-0.07em] text-[#151923]">
              무통장입금 안내
            </h2>

            <span className="rounded-full bg-blue-100 px-3 py-1.5 text-[12px] font-black text-blue-700">
              입금 확인 후 준비
            </span>
          </div>

          <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-blue-100">
            <div className="grid gap-3 text-[15px] font-bold text-slate-700">
              <div className="flex items-center justify-between gap-4">
                <span>은행명</span>
                <span className="text-right font-black text-[#151923]">{bankName}</span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span>계좌번호</span>
                <span className="text-right text-[18px] font-black text-[#151923]">
                  {bankAccount}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span>예금주</span>
                <span className="text-right font-black text-[#151923]">{bankHolder}</span>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-center text-[14px] font-black leading-relaxed tracking-[-0.04em] text-yellow-800">
              ⚠️ 반드시 <span className="text-orange-600">현재 닉네임</span>으로 입금해주세요
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-center text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-blue-800 ring-1 ring-blue-100">
            닉네임이나 금액이 다르면 입금확인이 늦어질 수 있어요.
            <br />
            입금 후 10~30분 내 자동 확인될 수 있습니다.
          </div>
        </section>
      ) : (
        <section className="rounded-[30px] bg-blue-50 p-5 shadow-[0_14px_35px_rgba(30,64,175,0.08)] ring-1 ring-blue-200">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[26px] text-blue-600 ring-1 ring-blue-100">
              💳
            </div>

            <h2 className="text-[23px] font-black tracking-[-0.07em] text-[#151923]">
              카드결제 안내
            </h2>
          </div>

          <div className="rounded-[24px] bg-white p-5 text-[14px] font-black leading-relaxed tracking-[-0.04em] text-blue-800 ring-1 ring-blue-100">
            카드결제는 카톡채널로 문의해주세요.
            <br />
            관리자 확인 후 결제 링크를 보내드립니다.
            <br />
            카드결제 시 부가세 +10%가 적용됩니다.
          </div>
        </section>
      )}
    </section>
  );
}
