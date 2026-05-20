"use client";

export default function AdminOrderTableHeader() {
  return (
    <div className="hidden grid-cols-[76px_112px_124px_minmax(260px,1fr)_96px_104px_96px_72px] bg-neutral-900 px-3 py-2 text-[12px] font-black text-white lg:grid">
      <div>주문</div>
      <div>작성일</div>
      <div>고객</div>
      <div>주문내역</div>
      <div>결제</div>
      <div className="text-right">금액</div>
      <div className="text-center">상태</div>
      <div className="text-center">상세</div>
    </div>
  );
}
