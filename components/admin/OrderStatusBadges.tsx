// components/admin/OrderStatusBadges.tsx
// 주문관리 뱃지 전용 컴포넌트
// 새 파일 생성용
// 위치: components/admin/OrderStatusBadges.tsx

"use client";

type BadgeProps = {
  label: string;
  tone?: "gray" | "blue" | "green" | "yellow" | "red" | "orange" | "black";
};

const toneClass = {
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  green: "bg-green-100 text-green-700 border-green-200",
  yellow: "bg-yellow-100 text-yellow-700 border-yellow-200",
  red: "bg-red-100 text-red-700 border-red-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  black: "bg-black text-white border-black",
};

export function AdminBadge({
  label,
  tone = "gray",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center px-3 py-1 rounded-full border text-xs font-extrabold whitespace-nowrap ${toneClass[tone]}`}
    >
      {label}
    </span>
  );
}

export function OrderStatusBadge({
  status,
}: {
  status: string;
}) {
  if (status === "주문확인완료") {
    return <AdminBadge label="주문확인완료" tone="blue" />;
  }

  if (status === "출고대기") {
    return <AdminBadge label="출고대기" tone="yellow" />;
  }

  if (status === "출고완료") {
    return <AdminBadge label="출고완료" tone="green" />;
  }

  if (status === "부분환불") {
    return <AdminBadge label="부분환불" tone="orange" />;
  }

  if (status === "환불") {
    return <AdminBadge label="환불" tone="red" />;
  }

  if (status === "주문서취소") {
    return <AdminBadge label="주문서취소" tone="red" />;
  }

  return <AdminBadge label={status || "주문확인전"} tone="gray" />;
}

export function PaymentBadge({
  payment,
}: {
  payment: string;
}) {
  if (payment === "카드결제") {
    return <AdminBadge label="카드결제" tone="blue" />;
  }

  if (payment === "무통장입금") {
    return <AdminBadge label="무통장입금" tone="gray" />;
  }

  return <AdminBadge label={payment || "기타결제"} tone="yellow" />;
}

export function BroadcastBadge({
  title,
}: {
  title?: string | null;
}) {
  if (!title) {
    return <AdminBadge label="방송 미지정" tone="gray" />;
  }

  return <AdminBadge label={title} tone="black" />;
}
