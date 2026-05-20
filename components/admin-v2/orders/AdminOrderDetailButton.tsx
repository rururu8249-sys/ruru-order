"use client";

// components/admin-v2/orders/AdminOrderDetailButton.tsx
// 목적: 주문상세 패널 열기 버튼
// 주의: UI 전용. 주문/입금/정산 로직 없음.

type AdminOrderDetailButtonProps = {
  isOpen?: boolean;
  onClick: () => void;
};

export default function AdminOrderDetailButton({
  onClick,
}: AdminOrderDetailButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 w-full max-w-[64px] rounded-lg border border-blue-200 bg-blue-50 px-1 text-[11px] font-black text-blue-700 hover:bg-blue-100 active:scale-[0.98]"
    >
      상세
    </button>
  );
}
