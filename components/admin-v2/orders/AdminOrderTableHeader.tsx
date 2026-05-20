"use client";

export default function AdminOrderTableHeader() {
  return (
    <div className="hidden w-full min-w-[1120px] grid-cols-[100px_128px_150px_minmax(360px,1fr)_110px_110px_120px_70px] bg-neutral-900 px-5 py-3 text-[13px] font-black text-white lg:grid">
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
