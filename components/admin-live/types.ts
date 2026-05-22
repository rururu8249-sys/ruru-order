export type LiveOrderPaymentStatus =
  | "paid"
  | "unpaid"
  | "manual_match_needed"
  | "auto_paid"
  | "manual_paid"
  | "card_paid"
  | "card_unpaid";

export type LiveOrderItem = {
  id: string;
  productName: string;
  optionText: string;
  qty: number;
  amount: number;
};

export type LiveOrder = {
  id: string;
  orderNo: string;
  paymentStatus: LiveOrderPaymentStatus;
  submittedAt: string;
  paidAt: string | null;
  nickname: string;
  name: string;
  phone: string;
  paymentMethod: "무통장입금" | "카드결제";
  orderSummary: string;
  productAmount: number;
  shippingFee: number;
  memo: string;
  items: LiveOrderItem[];
};
