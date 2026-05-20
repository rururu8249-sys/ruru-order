// components/group-buy/GroupBuyDeliveryNotice.tsx
// 목적: 공구상품 배송비 안내 UI
// 주의: UI 전용. 배송비 계산/주문 저장/Supabase 로직 없음.

export default function GroupBuyDeliveryNotice() {
  return (
    <section className="mb-5 rounded-[28px] bg-white p-5 shadow-[0_12px_26px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[25px] ring-1 ring-blue-100">
          🚚
        </div>

        <div>
          <div className="text-[18px] font-black tracking-[-0.06em] text-[#151923]">
            배송비 안내
          </div>

          <p className="mt-2 break-keep text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
            일반배송 상품끼리는 합배송 기준으로 배송비 1회가 적용될 수 있어요.
            <br />
            업체배송 상품은 별도배송으로 배송비가 따로 발생합니다.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-[13px] font-black tracking-[-0.04em]">
        <div className="rounded-2xl bg-green-50 px-4 py-3 text-green-700 ring-1 ring-green-100">
          🟢 일반배송 = 방송상품 + 합배송 가능 공구상품
        </div>

        <div className="rounded-2xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-100">
          🔴 업체배송 = 별도배송 상품
        </div>
      </div>
    </section>
  );
}
