"use client";

export default function AdminOrderTableHeader() {
  return (
    <div className="hidden w-full grid-cols-[96px_116px_132px_minmax(360px,1fr)_92px_96px_96px_60px] bg-neutral-900 px-5 py-3 text-[13px] font-black text-white lg:grid">
      <div className="text-center">주문번호</div>
      <div className="text-center">주문시간</div>
      <div className="text-center">고객</div>
      <div className="text-center">상품명</div>
      <div className="text-center">입금</div>
      <div className="text-center">금액</div>
      <div className="text-center">배송</div>
      <div className="text-center">상세</div>
    </div>
  );
}
