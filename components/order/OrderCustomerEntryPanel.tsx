"use client";

// components/order/OrderCustomerEntryPanel.tsx
// 목적: 주문 전 기존고객/처음주문 선택 화면
// 주의: UI 전용. 고객 저장, 주문 저장, 금액, 배송비, Supabase 로직 없음.

import { useRef } from "react";

type OrderCustomerEntryPanelProps = {
  loginName: string;
  loginPhone: string;
  onLoginNameChange: (value: string) => void;
  onLoginPhoneChange: (value: string) => void;
  onLoadCustomer: () => void;
  onStartNew: () => void;
};

export default function OrderCustomerEntryPanel({
  loginName,
  loginPhone,
  onLoginNameChange,
  onLoginPhoneChange,
  onLoadCustomer,
  onStartNew,
}: OrderCustomerEntryPanelProps) {
  const lastActionAtRef = useRef(0);

  const runMobileSafeAction = (action: () => void) => {
    const now = Date.now();

    // 모바일에서 pointerup + click 중복 실행 방지
    if (now - lastActionAtRef.current < 450) return;

    lastActionAtRef.current = now;
    action();
  };

  const buttonBase =
    "relative z-[80] pointer-events-auto touch-manipulation select-none transition-all duration-150 active:scale-[0.97]";

  return (
    <section className="relative z-[60] grid gap-4 pointer-events-auto">
      <div className="relative z-[70] rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[23px] ring-1 ring-blue-100">
            👤
          </div>

          <div>
            <h2 className="text-[22px] font-black tracking-[-0.06em] text-[#151923]">
              기존 고객이신가요?
            </h2>
          </div>
        </div>

        <div className="grid gap-3">
          <input
            value={loginName}
            onChange={(event) => onLoginNameChange(event.target.value)}
            placeholder="이름"
            autoComplete="name"
            className="relative z-[80] pointer-events-auto rounded-2xl border border-blue-100 bg-blue-50/40 p-4 text-[16px] font-bold outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
          />

          <input
            value={loginPhone}
            onChange={(event) => onLoginPhoneChange(event.target.value)}
            placeholder="전화번호"
            inputMode="tel"
            autoComplete="tel"
            className="relative z-[80] pointer-events-auto rounded-2xl border border-blue-100 bg-blue-50/40 p-4 text-[16px] font-bold outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
          />

          <button
            type="button"
            aria-label="정보 불러오기"
            onPointerUp={(event) => {
              if (event.pointerType !== "mouse") {
                event.preventDefault();
                runMobileSafeAction(onLoadCustomer);
              }
            }}
            onTouchEnd={(event) => {
              event.preventDefault();
              runMobileSafeAction(onLoadCustomer);
            }}
            onClick={() => runMobileSafeAction(onLoadCustomer)}
            className={`${buttonBase} mt-1 rounded-2xl bg-blue-600 p-4 text-[17px] font-black text-white shadow-[0_12px_26px_rgba(37,99,235,0.22)]`}
          >
            정보 불러오기
          </button>
        </div>
      </div>

      <div className="relative z-[70] rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-[23px] ring-1 ring-slate-100">
            ✍️
          </div>

          <div>
            <h2 className="text-[22px] font-black tracking-[-0.06em] text-[#151923]">
              처음 주문이신가요?
            </h2>
          </div>
        </div>

        <button
          type="button"
          aria-label="처음 주문 정보 입력하기"
          onPointerUp={(event) => {
            if (event.pointerType !== "mouse") {
              event.preventDefault();
              runMobileSafeAction(onStartNew);
            }
          }}
          onTouchEnd={(event) => {
            event.preventDefault();
            runMobileSafeAction(onStartNew);
          }}
          onClick={() => runMobileSafeAction(onStartNew)}
          className={`${buttonBase} w-full rounded-2xl bg-slate-950 p-4 text-[17px] font-black text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)]`}
        >
          처음 주문 정보 입력하기
        </button>
      </div>
    </section>
  );
}
