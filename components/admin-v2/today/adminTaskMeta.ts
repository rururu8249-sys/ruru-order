// components/admin-v2/today/adminTaskMeta.ts
// 목적: 오늘할일 지속 업무의 타입/라벨/색상/필터 기준 분리
// 주의: UI 표시 전용. 주문/입금/배송/정산 로직 없음.

export type AdminTaskFilter =
  | "all"
  | "product"
  | "payment"
  | "shipping"
  | "address"
  | "exchange"
  | "refund"
  | "return"
  | "complaint"
  | "general";

export const ADMIN_TASK_FILTERS: Array<{
  value: AdminTaskFilter;
  label: string;
}> = [
  { value: "all", label: "전체" },
  { value: "product", label: "상품/추가구매" },
  { value: "payment", label: "입금/결제" },
  { value: "shipping", label: "배송/송장" },
  { value: "address", label: "주소확인" },
  { value: "exchange", label: "교환" },
  { value: "refund", label: "환불/취소" },
  { value: "return", label: "반품" },
  { value: "complaint", label: "불만/주의" },
  { value: "general", label: "일반" },
];

export const ADMIN_TASK_TYPE_LABEL: Record<string, string> = {
  product: "상품/추가구매",
  payment: "입금/결제",
  shipping: "배송/송장",
  address: "주소확인",
  exchange: "교환",
  refund: "환불/취소",
  return: "반품",
  complaint: "불만/주의",
  general: "일반",
};

export const ADMIN_TASK_TONE_CLASS: Record<string, string> = {
  product: "bg-pink-50 text-pink-700 border-pink-100",
  payment: "bg-emerald-50 text-emerald-700 border-emerald-100",
  shipping: "bg-blue-50 text-blue-700 border-blue-100",
  address: "bg-violet-50 text-violet-700 border-violet-100",
  exchange: "bg-orange-50 text-orange-700 border-orange-100",
  refund: "bg-red-50 text-red-700 border-red-100",
  return: "bg-rose-50 text-rose-700 border-rose-100",
  complaint: "bg-red-50 text-red-700 border-red-100",
  general: "bg-neutral-100 text-neutral-700 border-neutral-200",
};

export function getAdminTaskTypeLabel(taskType: string | null | undefined) {
  const key = taskType || "general";
  return ADMIN_TASK_TYPE_LABEL[key] || key;
}

export function getAdminTaskToneClass(taskType: string | null | undefined) {
  const key = taskType || "general";
  return ADMIN_TASK_TONE_CLASS[key] || ADMIN_TASK_TONE_CLASS.general;
}
