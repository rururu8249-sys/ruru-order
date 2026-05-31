// components/order/OrderCustomerInfoIntro.tsx
// 목적: 주문 전 정보확인 / 정보수정 상단 안내 UI
// 주의: UI 전용. 주문 저장, 고객정보 저장, 금액, 배송비, 입금, 정산, Supabase 로직 없음.

type OrderCustomerInfoIntroProps = {
  mode?: "check" | "edit";
};

export default function OrderCustomerInfoIntro({
  mode = "check",
}: OrderCustomerInfoIntroProps) {
  const isEdit = mode === "edit";

  return (
    <section
      data-ruru-customer-info-intro="redesigned"
      className="mb-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-blue-50 text-[22px] ring-1 ring-blue-100">
          {isEdit ? "✏️" : "🛡️"}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-black tracking-[-0.04em] text-blue-700">
            {isEdit ? "배송정보 수정" : "주문 전 필수 확인"}
          </p>

          <h1 className="mt-1 break-keep text-[24px] font-black leading-tight tracking-[-0.07em] text-[#151923]">
            {isEdit ? "정보수정" : "주문 전 정보 확인"}
          </h1>

          <p className="mt-2 break-keep text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-500">
            {isEdit
              ? "닉네임, 이름, 전화번호, 주소를 확인하고 저장해주세요."
              : "주문 전 닉네임, 이름, 전화번호, 배송지를 확인해주세요."}
          </p>
        </div>
      </div>
    </section>
  );
}
