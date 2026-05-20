// components/order/OrderSavedCustomerSummary.tsx
// 목적: 저장된 고객정보 요약 UI
// 주의: UI 전용. 고객정보 저장/수정, 주문 저장, Supabase 로직 없음.

type OrderSavedCustomerSummaryProps = {
  customerLabel: string;
  nickname: string;
  name: string;
  phone: string;
  address: string;
  showDetail: boolean;
  onToggleDetail: () => void;
};

export default function OrderSavedCustomerSummary({
  customerLabel,
  nickname,
  name,
  phone,
  address,
  showDetail,
  onToggleDetail,
}: OrderSavedCustomerSummaryProps) {
  return (
    <div className="rounded-[26px] bg-blue-50 p-4 ring-1 ring-blue-100">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black tracking-[-0.04em] text-blue-700">
            ✅ {customerLabel || "고객"}님 정보 확인됨
          </div>

          <p className="mt-1 break-keep text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
            저장된 정보로 바로 상품 입력을 진행할 수 있어요.
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleDetail}
          className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-black text-blue-700 ring-1 ring-blue-100 active:scale-[0.98]"
        >
          {showDetail ? "내용닫기 ▲" : "내용보기 ▼"}
        </button>
      </div>

      {showDetail && (
        <div className="mt-3 rounded-[20px] bg-white p-3 text-xs font-bold leading-relaxed text-slate-700 ring-1 ring-blue-100">
          <div>닉네임: {nickname}</div>
          <div>이름: {name}</div>
          <div>전화번호: {phone}</div>
          <div>주소: {address}</div>
        </div>
      )}
    </div>
  );
}
