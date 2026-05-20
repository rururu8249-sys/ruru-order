"use client";

export default function AdminOrderTableHeader() {
  return (
    <div className="hidden w-full grid-cols-[92px_124px_140px_minmax(340px,1fr)_96px_104px_104px_64px] bg-neutral-900 px-4 py-3 text-[13px] font-black text-white lg:grid">
      <div>주문번호</div>
      <div>주문시간</div>
      <div>고객</div>
      <div>상품명</div>
      <div className="text-center">입금</div>
      <div className="text-right">금액</div>
      <div className="text-center">배송</div>
      <div className="text-center">상세</div>
    </div>
  );
}
