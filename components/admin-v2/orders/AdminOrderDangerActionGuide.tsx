"use client";

export default function AdminOrderDangerActionGuide() {
  return (
    <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-bold leading-4 text-red-700 md:col-span-3">
      위험 작업입니다. 입금확인 취소나 카드 미결제로 되돌리기가 아니라, 주문서 자체를 폐기해야 할 때만 사용하세요.
    </div>
  );
}
