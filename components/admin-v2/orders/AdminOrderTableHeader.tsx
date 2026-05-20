"use client";

export default function AdminOrderTableHeader() {
  return (
    <div className="hidden w-full grid-cols-[78px_104px_120px_minmax(280px,1fr)_82px_88px_86px_54px] bg-neutral-900 px-3 py-2 text-[12px] font-black text-white lg:grid">
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
