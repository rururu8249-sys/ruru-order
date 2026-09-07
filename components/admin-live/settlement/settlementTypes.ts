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

export type SettlementBroadcastEndReport = {
  id: string;
  broadcast_id: string;
  broadcast_title?: string | null;
  broadcast_date?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_minutes?: number | null;

  order_count?: number | null;
  active_order_count?: number | null;
  canceled_count?: number | null;

  paid_count?: number | null;
  paid_amount?: number | null;

  bank_paid_count?: number | null;
  bank_paid_amount?: number | null;

  card_paid_count?: number | null;
  card_paid_amount?: number | null;

  unpaid_count?: number | null;
  unpaid_amount?: number | null;

  buyer_count?: number | null;
  existing_member_count?: number | null;
  new_member_count?: number | null;

  visitor_count?: number | null;
  visitor_note?: string | null;
  report_note?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
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
