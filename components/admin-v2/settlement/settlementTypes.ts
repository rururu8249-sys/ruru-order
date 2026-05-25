export type AnyRow = Record<string, any>;

export type PaymentFilter = "전체" | "무통장입금" | "카드결제" | "기타";

export type SettlementSettingsSummary = {
  customerCardRate?: number;
  actualCardRate?: number;
  cardPaymentMinAmount?: number;
  defaultShippingFee?: number;
};

export type SettlementBroadcastOption = {
  key: string;
  dateKey: string;
  label: string;
  subLabel: string;
  count: number;
};

export type SettlementStats = {
  totalOrderAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  bankAmount: number;
  cardAmount: number;
  otherAmount: number;
  actualCardFee: number;
  customerCardExtra: number;
  cardFeeMargin: number;
  netAmount: number;
  refundAmount: number;
  canceledAmount: number;
  orderCount: number;
  paidCount: number;
  bankCount: number;
  cardCount: number;
  otherCount: number;
};

export type SettlementBroadcastRow = {
  key: string;
  label: string;
  dateKey: string;
  count: number;
  totalOrderAmount: number;
  paidAmount: number;
  bankAmount: number;
  cardAmount: number;
  actualCardFee: number;
  customerCardExtra: number;
  netAmount: number;
  unpaidAmount: number;
};
