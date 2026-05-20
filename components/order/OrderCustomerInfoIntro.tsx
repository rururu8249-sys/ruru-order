// components/order/OrderCustomerInfoIntro.tsx
// 목적: 주문 전 정보확인 안내 UI
// 주의: UI 전용. 주문 저장, 금액, 배송비, 입금, 정산, Supabase 로직 없음.

export default function OrderCustomerInfoIntro() {
  return (
    <div className="rounded-[26px] bg-blue-50 px-5 py-5 ring-1 ring-blue-100">
      <p className="text-[22px] font-black tracking-[-0.07em] text-[#151923]">
        주문 전 정보 확인
      </p>

      <p className="mt-2 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-blue-800">
        주문을 위한 최초 1회 정보 확인입니다.
        <br />
        한 번만 입력하면 로그아웃 전까지는 바로 상품 입력으로 이동해요.
      </p>

      <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600 ring-1 ring-blue-100">
        입력하신 정보는 주문/배송 확인용으로만 사용됩니다.
      </p>
    </div>
  );
}
