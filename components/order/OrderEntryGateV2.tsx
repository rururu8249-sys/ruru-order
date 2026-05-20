"use client";

// components/order/OrderEntryGateV2.tsx
// 목적: 주문 전 기존고객/처음주문 선택 화면 V2
// 주의: UI 전용. 주문 저장, 배송비, 합배송, 입금매칭, Supabase 로직 없음.

type OrderEntryGateV2Props = {
  loginName: string;
  loginPhone: string;
  onLoginNameChange: (value: string) => void;
  onLoginPhoneChange: (value: string) => void;
  onLoadCustomer: () => void;
  onStartNew: () => void;
};

export default function OrderEntryGateV2({
  loginName,
  loginPhone,
  onLoginNameChange,
  onLoginPhoneChange,
  onLoadCustomer,
  onStartNew,
}: OrderEntryGateV2Props) {
  const buttonBase =
    "relative z-20 flex w-full items-center justify-center rounded-[22px] px-5 py-4 text-[17px] font-black transition-all duration-150 active:scale-[0.97]";

  return (
    <section className="grid gap-4">
      <section className="overflow-hidden rounded-[30px] bg-white shadow-[0_16px_40px_rgba(30,64,175,0.10)] ring-1 ring-blue-100">
        <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-sky-400 px-5 py-5 text-white">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] bg-white/95 text-[27px] font-black text-blue-600 shadow-[0_12px_24px_rgba(15,23,42,0.18)]">
            R
          </div>

          <div className="text-center">
            <div className="text-[13px] font-black text-blue-100">
              루루동이 주문서
            </div>

            <h1 className="mt-1 text-[27px] font-black leading-tight tracking-[-0.07em]">
              주문 전 정보 확인
            </h1>

            <p className="mt-2 break-keep text-[13px] font-bold leading-relaxed text-blue-50">
              기존 고객은 정보 불러오기,
              <br />
              처음 주문은 새 정보 입력으로 진행해주세요.
            </p>
          </div>
        </div>

        <div className="grid gap-4 p-5">
          <section className="rounded-[26px] bg-blue-50/70 p-4 ring-1 ring-blue-100">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[23px] shadow-sm ring-1 ring-blue-100">
                👤
              </div>

              <div>
                <h2 className="text-[21px] font-black tracking-[-0.06em] text-[#151923]">
                  기존 고객이신가요?
                </h2>
                <p className="mt-0.5 text-[12px] font-bold text-slate-500">
                  이름과 전화번호로 정보를 불러옵니다.
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              <input
                value={loginName}
                onChange={(event) => onLoginNameChange(event.target.value)}
                placeholder="이름"
                autoComplete="name"
                className="rounded-[20px] border border-blue-100 bg-white p-4 text-[16px] font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
              />

              <input
                value={loginPhone}
                onChange={(event) => onLoginPhoneChange(event.target.value)}
                placeholder="전화번호"
                inputMode="tel"
                autoComplete="tel"
                className="rounded-[20px] border border-blue-100 bg-white p-4 text-[16px] font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
              />

              <button
                type="button"
                onClick={onLoadCustomer}
                className={`${buttonBase} bg-blue-600 text-white shadow-[0_14px_28px_rgba(37,99,235,0.25)]`}
              >
                정보 불러오기
              </button>
            </div>
          </section>

          <section className="rounded-[26px] bg-slate-50 p-4 ring-1 ring-slate-100">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[23px] shadow-sm ring-1 ring-slate-100">
                ✍️
              </div>

              <div>
                <h2 className="text-[21px] font-black tracking-[-0.06em] text-[#151923]">
                  처음 주문이신가요?
                </h2>
                <p className="mt-0.5 text-[12px] font-bold text-slate-500">
                  닉네임, 이름, 전화번호, 주소를 새로 입력합니다.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onStartNew}
              className={`${buttonBase} bg-slate-950 text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)]`}
            >
              처음 주문 정보 입력하기
            </button>
          </section>
        </div>
      </section>
    </section>
  );
}
