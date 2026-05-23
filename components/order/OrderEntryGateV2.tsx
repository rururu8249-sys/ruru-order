"use client";

// components/order/OrderEntryGateV2.tsx
// 목적: 주문 전 카카오 간편주문 전용 진입 화면
// 주의:
// - UI 전용 컴포넌트입니다.
// - 주문 저장, 배송비, 합배송, 입금매칭, Supabase 로직 없음.
// - 고객 화면은 카카오 간편주문 전용으로 표시합니다.

type OrderEntryGateV2Props = {
  loginName: string;
  loginPhone: string;
  onLoginNameChange: (value: string) => void;
  onLoginPhoneChange: (value: string) => void;
  onLoadCustomer: () => void;
  onStartNew: () => void;
  onKakaoLogin: () => void;
};

export default function OrderEntryGateV2({ onKakaoLogin }: OrderEntryGateV2Props) {
  return (
    <section className="grid gap-4">
      <section className="overflow-hidden rounded-[34px] bg-gradient-to-b from-white via-[#f7fbff] to-[#e7f1ff] px-5 pb-7 pt-7 shadow-[0_22px_55px_rgba(37,99,235,0.13)] ring-1 ring-blue-100">
        <div className="mx-auto flex w-fit items-center justify-center gap-3 rounded-full bg-white/90 px-4 py-2 shadow-[0_10px_24px_rgba(37,99,235,0.10)] ring-1 ring-blue-100">
          <div className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-blue-600 text-[17px] font-black text-white shadow-[0_10px_20px_rgba(37,99,235,0.20)]">
            R
          </div>

          <div className="text-[20px] font-black text-slate-400">×</div>

          <div className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-[#fee500] text-[13px] font-black text-[#241b17] shadow-[0_10px_20px_rgba(234,179,8,0.22)]">
            TALK
          </div>
        </div>

        <div className="mt-7 text-center">
          <h1 className="break-keep text-[35px] font-black leading-[1.08] tracking-[-0.085em] text-[#151923]">
            <span className="text-blue-600">루루동이</span>
            <span className="text-slate-950"> X 카카오톡</span>
          </h1>

          <p className="mt-4 break-keep text-[20px] font-black leading-relaxed tracking-[-0.06em] text-slate-600">
            복잡한 배송지 정보 입력 없이
          </p>
        </div>

        <div className="relative mt-7 overflow-hidden rounded-[32px] bg-gradient-to-br from-blue-50 via-white to-blue-100 px-4 pb-7 pt-7 shadow-inner ring-1 ring-blue-100">
          <div className="pointer-events-none absolute -left-10 top-8 h-36 w-36 rounded-full bg-white/70 blur-2xl" />
          <div className="pointer-events-none absolute -right-10 bottom-5 h-40 w-40 rounded-full bg-blue-300/35 blur-2xl" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fee500]/18 blur-3xl" />

          <button
            type="button"
            onClick={onKakaoLogin}
            className="relative z-10 mx-auto flex w-full max-w-[360px] items-center justify-center rounded-[26px] bg-[#fee500] px-5 py-5 text-[#241b17] shadow-[0_18px_36px_rgba(234,179,8,0.28)] ring-1 ring-yellow-200 transition active:scale-[0.98]"
          >
            <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#241b17] text-[12px] font-black text-[#fee500]">
              TALK
            </span>

            <span className="min-w-0 flex-1 text-center text-[20px] font-black tracking-[-0.055em]">
              카카오로 간편 주문 시작
            </span>

            <span className="ml-3 text-[28px] font-black leading-none">›</span>
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-[26px] bg-white/82 shadow-[0_12px_26px_rgba(37,99,235,0.08)] ring-1 ring-blue-100">
          <div className="border-r border-blue-100 px-2 py-4 text-center">
            <div className="text-[22px]">📍</div>
            <div className="mt-1 break-keep text-[12px] font-black tracking-[-0.04em] text-slate-700">
              배송정보
            </div>
          </div>

          <div className="border-r border-blue-100 px-2 py-4 text-center">
            <div className="text-[22px]">📝</div>
            <div className="mt-1 break-keep text-[12px] font-black tracking-[-0.04em] text-slate-700">
              주문간편
            </div>
          </div>

          <div className="px-2 py-4 text-center">
            <div className="text-[22px]">🔒</div>
            <div className="mt-1 break-keep text-[12px] font-black tracking-[-0.04em] text-slate-700">
              정보보호
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
