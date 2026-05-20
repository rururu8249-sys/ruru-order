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
    <div className="flex items-center gap-2 text-[18px] font-black tracking-[-0.05em] text-[#151923]">
      <span>{children}</span>
      <span className="text-blue-600">•</span>
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
    <section className="mt-5 rounded-[34px] bg-white p-5 shadow-[0_18px_40px_rgba(30,64,175,0.10)] ring-1 ring-blue-100">
      <div className="grid gap-5">
        <div className="grid gap-2">
          <FieldLabel>유튜브 닉네임</FieldLabel>
          <input
            value={youtubeNickname}
            onChange={(event) => onYoutubeNicknameChange(event.target.value)}
            placeholder="유튜브 닉네임을 입력해주세요"
            className="h-14 w-full rounded-2xl border border-blue-100 bg-white px-4 text-[16px] font-bold outline-none transition placeholder:text-slate-400 focus:border-blue-500"
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel>이름</FieldLabel>
          <input
            value={customerName}
            onChange={(event) => onCustomerNameChange(event.target.value)}
            placeholder="이름을 입력해주세요"
            className="h-14 w-full rounded-2xl border border-blue-100 bg-white px-4 text-[16px] font-bold outline-none transition placeholder:text-slate-400 focus:border-blue-500"
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel>전화번호</FieldLabel>
          <input
            value={customerPhone}
            onChange={(event) => onCustomerPhoneChange(event.target.value)}
            placeholder="- 없이 숫자만 입력해주세요"
            inputMode="numeric"
            className="h-14 w-full rounded-2xl border border-blue-100 bg-white px-4 text-[16px] font-bold outline-none transition placeholder:text-slate-400 focus:border-blue-500"
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel>주소</FieldLabel>
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <input
              value={address}
              onChange={(event) => onAddressChange(event.target.value)}
              placeholder="주소를 검색해주세요"
              className="h-14 min-w-0 rounded-2xl border border-blue-100 bg-white px-4 text-[16px] font-bold outline-none transition placeholder:text-slate-400 focus:border-blue-500"
            />

            <button
              type="button"
              onClick={onOpenAddressSearch}
              className="h-14 rounded-2xl border border-blue-600 bg-white text-[16px] font-black text-blue-600 transition active:scale-[0.98]"
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
            placeholder="상세주소를 입력해주세요"
            className="h-14 w-full rounded-2xl border border-blue-100 bg-white px-4 text-[16px] font-bold outline-none transition placeholder:text-slate-400 focus:border-blue-500"
          />
        </div>

        <div className={isEdit ? "grid grid-cols-2 gap-2 pt-2" : "grid pt-2"}>
          {isEdit && (
            <button
              type="button"
              onClick={onCancel}
              className="h-14 rounded-2xl bg-slate-100 text-[18px] font-black text-slate-600 transition active:scale-[0.98]"
            >
              취소
            </button>
          )}

          <button
            type="button"
            onClick={onConfirm}
            className="h-14 rounded-2xl bg-blue-600 text-[18px] font-black text-white shadow-[0_12px_24px_rgba(37,99,235,0.22)] transition active:scale-[0.98]"
          >
            확인
          </button>
        </div>
      </div>
    </section>
  );
}
