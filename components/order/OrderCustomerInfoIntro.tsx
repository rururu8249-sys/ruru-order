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
    <section className="mb-5 px-2 py-6 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-[0_14px_35px_rgba(30,64,175,0.12)] ring-1 ring-blue-100">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-[34px] text-blue-600 ring-1 ring-blue-100">
          🛡️
        </div>
      </div>

      <h1 className="mt-6 text-[36px] font-black leading-tight tracking-[-0.08em] text-[#151923]">
        {isEdit ? "정보수정" : "주문 전 정보 확인"}
      </h1>

      <p className="mt-4 break-keep text-[17px] font-bold leading-relaxed tracking-[-0.04em] text-slate-700">
        {isEdit ? (
          <>저장된 정보를 간단히 확인하고 수정할 수 있어요.</>
        ) : (
          <>
            주문을 위한 <span className="font-black text-blue-600">최초 1회</span> 정보 확인입니다.
            <br />
            한 번만 입력하면 로그아웃 전까지는{" "}
            <span className="font-black text-blue-600">바로 상품 입력</span>으로 이동해요.
          </>
        )}
      </p>
    </section>
  );
}
