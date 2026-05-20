"use client";

export default function AdminOrderTableHeader() {
  return (
    <div className="hidden grid-cols-[84px_124px_128px_minmax(250px,1fr)_82px_108px_106px_90px] bg-neutral-950 px-3 py-2 text-[13px] font-black text-white lg:grid">
      <div>주문번호</div>
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
