"use client";

import { useState } from "react";

type OrderDepositConfirmModalProps = {
  open: boolean;
  nickname: string;
  totalAmount: number;
  onConfirm: (hideFor24Hours: boolean) => void;
};

const won = (value: number) => `${Number(value || 0).toLocaleString()}원`;

export default function OrderDepositConfirmModal({
  open,
  nickname,
  totalAmount,
  onConfirm,
}: OrderDepositConfirmModalProps) {
  const [hideFor24Hours, setHideFor24Hours] = useState(false);

  if (!open) return null;

  const depositName = String(nickname || "").trim() || "현재 닉네임";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-[390px] rounded-[30px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.28)] ring-1 ring-blue-100">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-[30px] ring-1 ring-orange-100">
            ⚠️
          </div>

          <h2 className="mt-3 text-[24px] font-black tracking-[-0.06em] text-slate-950">
            입금 전 꼭 확인해주세요
          </h2>

          <p className="mt-2 text-[14px] font-bold leading-relaxed text-slate-500">
            자동입금확인은 아래 내용이 정확히 일치해야 처리됩니다.
          </p>
        </div>

        <div className="mt-5 rounded-[24px] bg-blue-50 p-4 ring-1 ring-blue-100">
          <div className="text-[13px] font-black text-blue-700">이번 주문서 결제금액</div>
          <div className="mt-1 text-[30px] font-black tracking-[-0.05em] text-blue-700">
            {won(totalAmount)}
          </div>
        </div>

        <div className="mt-3 grid gap-3">
          <div className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="text-[12px] font-black text-slate-400">1. 입금자명</div>
            <div className="mt-1 text-[22px] font-black tracking-[-0.05em] text-slate-950">
              {depositName}
            </div>
          </div>

          <div className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="text-[12px] font-black text-slate-400">2. 입금금액</div>
            <div className="mt-1 text-[22px] font-black tracking-[-0.05em] text-slate-950">
              {won(totalAmount)}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-[22px] bg-slate-50 p-4 text-[14px] font-bold leading-relaxed text-slate-700">
          ✅ <span className="font-black text-blue-700">입금자명 + 입금금액</span>이 일치하면
          <br />
          보통 <span className="font-black">10~30분 내 자동입금확인</span>됩니다.
        </div>

        <div className="mt-3 rounded-[22px] bg-orange-50 p-4 text-[13px] font-bold leading-relaxed text-orange-700 ring-1 ring-orange-100">
          나눠 입금하거나, 여러 주문서 금액을 합쳐 입금하면 자동확인이 안 될 수 있어요.
        </div>

        <div className="mt-5 grid grid-cols-[1fr_1.2fr] gap-2">
          <button
            type="button"
            onClick={() => setHideFor24Hours((value) => !value)}
            className={`rounded-2xl px-3 py-4 text-[13px] font-black transition active:scale-[0.98] ${
              hideFor24Hours
                ? "bg-blue-50 text-blue-700 ring-2 ring-blue-500"
                : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            24시간 열지 않기
          </button>

          <button
            type="button"
            onClick={() => onConfirm(hideFor24Hours)}
            className="rounded-2xl bg-blue-600 px-3 py-4 text-[15px] font-black text-white shadow-[0_14px_28px_rgba(37,99,235,0.26)] transition active:scale-[0.98]"
          >
            확인하고 제출
          </button>
        </div>
      </div>
    </div>
  );
}
