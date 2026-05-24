export type LiveOrderPaymentStatus =
  | "paid"
  | "unpaid"
  | "manual_match_needed"
  | "auto_paid"
  | "manual_paid"
  | "card_paid"
  | "card_unpaid"
  | "canceled";

export type LiveOrderItem = {
  id: string;
  productName: string;
  optionText: string;
  color?: string;
  size?: string;
  qty: number;
  unitPrice?: number;
  amount: number;
  productEditCount?: number;
  amountEditCount?: number;
};

export type LiveOrder = {
  id: string;
  groupId: string;
  rowIds: number[];
  orderNo: string;
  paymentStatus: LiveOrderPaymentStatus;
  paymentLabel: string;
  createdAt: string | null;
  submittedAt: string;
  paidAt: string | null;
  paidAtFull: string | null;
  nickname: string;
  name: string;
  phone: string;
  zipcode?: string | null;
  address?: string | null;
  detailAddress?: string | null;
  paymentMethod: "무통장입금" | "카드결제" | string;
  broadcastId: string | null;
  broadcastName: string | null;
  orderSummary: string;
  productAmount: number;
  shippingFee: number;
  totalAmount: number;
  memo: string;
  deliveryMemo?: string | null;
  items: LiveOrderItem[];
};
