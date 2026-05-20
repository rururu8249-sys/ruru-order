"use client";

export default function AdminOrderTableHeader() {
  return (
    <div className="hidden grid-cols-[70px_104px_112px_minmax(280px,1fr)_84px_96px_88px_62px] bg-neutral-900 px-3 py-2 text-[12px] font-black text-white lg:grid">
      <div>주문</div>
      <div>작성</div>
      <div>고객</div>
      <div>상품</div>
      <div>입금</div>
      <div className="text-right">금액</div>
      <div className="text-center">상태</div>
      <div className="text-center">상세</div>
    </div>
  );
}
