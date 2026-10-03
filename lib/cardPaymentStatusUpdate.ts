export type CardPaymentAdminStatus = "카드결제완료" | "주문확인전";

export function cardPaymentStatusPatch(status: CardPaymentAdminStatus, completedAt = new Date().toISOString()) {
  const completed = status === "카드결제완료";
  return {
    admin_order_status_v2: status,
    order_manage_status: status,
    deposit_confirmed_at: completed ? completedAt : null,
  };
}
