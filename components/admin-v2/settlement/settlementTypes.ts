export type AnyRow = Record<string, any>;

export type PaymentFilter = "전체" | "무통장입금" | "카드결제" | "기타";

export type SettlementManualEntryType = "income" | "expense";

export type SettlementManualEntry = {
  id?: string;
  entry_type: SettlementManualEntryType;
  title: string;
  amount: number;
  memo?: string | null;
  entry_date: string;
  broadcast_key?: string | null;
  broadcast_label?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

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
  manualIncomeAmount: number;
  actualCardFee: number;
  warehouseOtherExpense: number;
  totalExpense: number;
  netAmount: number;
  refundAmount: number;
  canceledAmount: number;
  orderCount: number;
  paidCount: number;
  bankCount: number;
  cardCount: number;
  otherCount: number;
  manualIncomeCount: number;
  manualExpenseCount: number;
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
  manualIncomeAmount: number;
  actualCardFee: number;
  warehouseOtherExpense: number;
  totalExpense: number;
  netAmount: number;
  unpaidAmount: number;
};
