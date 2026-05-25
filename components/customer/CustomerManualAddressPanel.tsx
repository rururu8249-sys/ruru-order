"use client";

// components/customer/CustomerManualAddressPanel.tsx
// 목적: 브라우저 prompt 대신 주소 직접입력 패널 표시
// 주의: UI 전용. 주문 저장, 금액, 배송비, 입금, 정산 로직 없음.

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  defaultValue?: string;
  onClose: () => void;
  onSubmit: (address: string) => void;
};

export default function CustomerManualAddressPanel({ open, defaultValue = "", onClose, onSubmit }: Props) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue || "");
  }, [defaultValue, open]);

  if (!open) return null;

  const cleanValue = value.trim();

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/35 px-4">
      <section className="w-full max-w-[520px] rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl">
        <div>
          <div className="text-[11px] font-black tracking-[0.16em] text-blue-500">MANUAL ADDRESS</div>
          <h2 className="mt-1 text-[24px] font-black tracking-[-0.05em] text-slate-950">
            주소 직접 입력
          </h2>
          <p className="mt-2 break-keep text-[14px] font-bold leading-relaxed text-slate-500">
            주소검색창이 안 뜨는 경우에만 직접 입력해주세요.
          </p>
        </div>

        <label className="mt-4 block">
          <span className="text-[13px] font-black text-slate-700">기본주소</span>
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="예) 서울 강남구 테헤란로 123"
            className="mt-2 min-h-[110px] w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-[15px] font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-600 active:scale-[0.98]"
          >
            취소
          </button>

          <button
            type="button"
            disabled={!cleanValue}
            onClick={() => onSubmit(cleanValue)}
            className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-blue-200"
          >
            주소 적용
          </button>
        </div>
      </section>
    </div>
  );
}
