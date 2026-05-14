// components/admin/AdminMoneyInputs.tsx
// 관리자 입력 컴포넌트 분리 파일
// 위치: components/admin/AdminMoneyInputs.tsx

"use client";

import { moneyText, toNumber } from "../../app/admin/adminUtils";

export function MoneyInput({
  value,
  onChange,
  disabled = false,
}: {
  value: number | string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        value={moneyText(value)}
        disabled={disabled}
        onChange={(e) => onChange(toNumber(e.target.value))}
        className="w-full border rounded-2xl p-4 pr-12 font-bold disabled:bg-gray-100"
      />
      <div className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-gray-500">
        원
      </div>
    </div>
  );
}

export function PercentInput({
  value,
  onChange,
}: {
  value: number | string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="relative">
      <input
        value={String(value || "")}
        onChange={(e) => onChange(toNumber(e.target.value))}
        className="w-full border rounded-2xl p-4 pr-12 font-bold"
      />
      <div className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-gray-500">
        %
      </div>
    </div>
  );
}
