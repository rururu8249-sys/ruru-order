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
    <section className="mb-4 px-2 py-3 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_10px_24px_rgba(30,64,175,0.10)] ring-1 ring-blue-100">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[23px] text-blue-600 ring-1 ring-blue-100">
          {isEdit ? "✏️" : "🛡️"}
        </div>
      </div>

      <h1 className="mt-4 text-[30px] font-black leading-tight tracking-[-0.08em] text-[#151923]">
        {isEdit ? "정보수정" : "주문 전 정보 확인"}
      </h1>
    </section>
  );
}
