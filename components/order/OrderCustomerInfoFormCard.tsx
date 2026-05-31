import { ORDER_PHONE_FORMAT_MAX_LENGTH } from "@/lib/order/phone";
// components/order/OrderCustomerInfoFormCard.tsx
// 목적: 처음 주문 정보 입력 / 정보수정 입력폼 UI
// 주의: UI 전용. Supabase, 주문저장, 금액계산 로직 없음.

import type { ReactNode } from "react";

type OrderCustomerInfoFormCardProps = {
  isEdit: boolean;
  youtubeNickname: string;
  customerName: string;
  customerPhone: string;
  address: string;
  detailAddress: string;
  onYoutubeNicknameChange: (value: string) => void;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onDetailAddressChange: (value: string) => void;
  onOpenAddressSearch: () => void;
  onCancel?: () => void;
  onConfirm: () => void;
};

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] font-black tracking-[-0.04em] text-slate-700">
        {children}
      </span>
      <span className="text-[11px] font-black tracking-[-0.04em] text-blue-600">
        필수
      </span>
    </div>
  );
}

export default function OrderCustomerInfoFormCard({
  isEdit,
  youtubeNickname,
  customerName,
  customerPhone,
  address,
  detailAddress,
  onYoutubeNicknameChange,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onAddressChange,
  onDetailAddressChange,
  onOpenAddressSearch,
  onCancel,
  onConfirm,
}: OrderCustomerInfoFormCardProps) {
  return (
    <section
      data-ruru-customer-info-form="redesigned"
      className="mt-4 rounded-[26px] bg-slate-50 p-4 ring-1 ring-slate-100"
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <FieldLabel>유튜브 닉네임</FieldLabel>
          <input
            value={youtubeNickname}
            onChange={(event) => onYoutubeNicknameChange(event.target.value)}
            placeholder="유튜브 닉네임"
            className="h-12 w-full rounded-[18px] border border-blue-100 bg-white px-4 text-[15px] font-bold tracking-[-0.04em] outline-none transition placeholder:text-slate-400 focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 min-[390px]:grid-cols-2">
          <div className="grid gap-2">
            <FieldLabel>이름</FieldLabel>
            <input
              value={customerName}
              onChange={(event) => onCustomerNameChange(event.target.value)}
              placeholder="이름"
              className="h-12 w-full rounded-[18px] border border-blue-100 bg-white px-4 text-[15px] font-bold tracking-[-0.04em] outline-none transition placeholder:text-slate-400 focus:border-blue-500"
            />
          </div>

          <div className="grid gap-2">
            <FieldLabel>전화번호</FieldLabel>
            <input
              value={customerPhone}
              onChange={(event) => onCustomerPhoneChange(event.target.value)}
              placeholder="010-0000-0000"
              inputMode="numeric"
              maxLength={ORDER_PHONE_FORMAT_MAX_LENGTH}
              className="h-12 w-full rounded-[18px] border border-blue-100 bg-white px-4 text-[15px] font-bold tabular-nums tracking-[-0.04em] outline-none transition placeholder:text-slate-400 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid gap-2">
          <FieldLabel>주소</FieldLabel>
          <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 min-[390px]:grid-cols-[minmax(0,1fr)_106px]">
            <input
              value={address}
              onChange={(event) => onAddressChange(event.target.value)}
              placeholder="주소를 검색해주세요"
              className="h-12 min-w-0 rounded-[18px] border border-blue-100 bg-white px-4 text-[15px] font-bold tracking-[-0.04em] outline-none transition placeholder:text-slate-400 focus:border-blue-500"
            />

            <button
              type="button"
              onClick={onOpenAddressSearch}
              className="h-12 rounded-[18px] border border-blue-600 bg-white text-[14px] font-black tracking-[-0.04em] text-blue-600 transition active:scale-[0.98]"
            >
              주소검색
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          <FieldLabel>상세주소</FieldLabel>
          <input
            value={detailAddress}
            onChange={(event) => onDetailAddressChange(event.target.value)}
            placeholder="동/호수, 건물명 등 상세주소"
            className="h-12 w-full rounded-[18px] border border-blue-100 bg-white px-4 text-[15px] font-bold tracking-[-0.04em] outline-none transition placeholder:text-slate-400 focus:border-blue-500"
          />
        </div>

        <div className={isEdit ? "grid grid-cols-2 gap-2 pt-1" : "grid pt-1"}>
          {isEdit && (
            <button
              type="button"
              onClick={onCancel}
              className="h-13 min-h-[52px] rounded-[18px] bg-slate-100 text-[16px] font-black tracking-[-0.04em] text-slate-600 transition active:scale-[0.98]"
            >
              취소
            </button>
          )}

          <button
            type="button"
            onClick={onConfirm}
            className="h-13 min-h-[52px] rounded-[18px] bg-blue-600 text-[16px] font-black tracking-[-0.04em] text-white shadow-[0_12px_24px_rgba(37,99,235,0.22)] transition active:scale-[0.98]"
          >
            {isEdit ? "수정완료" : "확인"}
          </button>
        </div>
      </div>
    </section>
  );
}
