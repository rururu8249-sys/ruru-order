"use client";

export default function LiveOrderDangerActionGuide() {
  return (
    <div className="rounded-xl border border-line bg-danger-bg px-3 py-2 text-[11px] font-bold leading-4 text-danger-tx">
      위험 작업입니다. 입금확인 취소나 카드 미결제로 되돌리기가 아니라, 주문서 자체를 폐기해야 할 때만 사용하세요.
    </div>
  );
}
