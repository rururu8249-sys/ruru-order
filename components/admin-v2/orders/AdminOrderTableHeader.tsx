"use client";

export default function AdminOrderTableHeader() {
  return (
    <div className="hidden w-full grid-cols-[86px_108px_128px_minmax(300px,1fr)_88px_92px_96px_56px] bg-neutral-900 px-3 py-2 text-[12px] font-black text-white lg:grid">
      <div>주문번호</div>
      <div>주문시간</div>
      <div>고객</div>
      <div>상품명</div>
      <div className="text-center">입금</div>
      <div className="text-right">금액</div>
      <div className="text-center">배송상태</div>
      <div className="text-center">상세</div>
    </div>
  );
}
