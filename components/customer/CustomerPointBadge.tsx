// components/customer/CustomerPointBadge.tsx
// 목적: 고객 화면 공통 포인트 표시 UI
// 주의: 오늘은 포인트 실제 지급/차감/DB 로직 없음. 0원 표시 자리만 제공.

type CustomerPointBadgeProps = {
  className?: string;
};

export default function CustomerPointBadge({ className = "" }: CustomerPointBadgeProps) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-2 text-[13px] font-black tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100 ${className}`}
    >
      <span>💰</span>
      <span>포인트 0원</span>
    </div>
  );
}
