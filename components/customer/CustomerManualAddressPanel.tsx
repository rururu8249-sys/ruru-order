"use client";

// components/customer/CustomerManualAddressPanel.tsx
// 목적: 브라우저 prompt 대신 주소 직접입력 패널 표시
// 주의: UI 전용. 주문 저장, 금액, 배송비, 입금, 정산 로직 없음.

import { useEffect, useState } from "react";
// [2026-09-20] 가운데 확인창 «한 벌» 틀 — ✕·배경·뒤로가기·ESC 동일, 1:1 [취소][주소 적용]. 주소 적용 로직 무변경.
import CustomerDialog from "./CustomerDialog";

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
    <CustomerDialog
      open
      onClose={onClose}
      title="주소 직접 입력"
      closeGuard={() => !cleanValue || cleanValue === (defaultValue || "").trim() || window.confirm("입력 중인 주소가 지워져요. 닫을까요?")}
      primary={{ label: "주소 적용", onClick: () => onSubmit(cleanValue), disabled: !cleanValue }}
    >
      <p className="break-keep text-[13px] font-bold text-slate-500">주소검색창이 안 뜨는 경우에만 직접 입력해 주세요.</p>
      <label className="mt-3 block">
        <span className="text-[13px] font-black text-slate-700">기본주소</span>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="예) 서울 강남구 테헤란로 123"
          className="mt-2 min-h-[96px] w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-[15px] font-bold text-slate-800 outline-none focus:border-rose-deep"
        />
      </label>
    </CustomerDialog>
  );
}
