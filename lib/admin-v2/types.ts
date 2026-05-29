// lib/admin-v2/types.ts
// admin-v2 공통 타입
// 송장관리 1차 추가: 로젠 원본 업로드 엑셀 재업로드로 출고완료만 반영. DB 구조 변경 없음.

export type AdminTab = "today" | "orders" | "shipping" | "customers" | "deposits" | "settlement" | "settings";

export type OrderRow = {
  id: number;
  created_at: string | null;
  order_group_id: string | null;
  order_lookup_code: string | null;
  broadcast_id: string | null;
  broadcast_name: string | null;
  youtube_nickname: string | null;
  customer_name: string | null;
  phone: string | null;
  customer_phone: string | null;
  zipcode: string | null;
  address: string | null;
  detail_address: string | null;
  request_memo: string | null;
  memo: string | null;
  special_note: string | null;
  admin_memo: string | null;
  product_name: string | null;
  color: string | null;
  size: string | null;
  qty: number | null;
  product_price: number | null;
  shipping_fee: number | null;
  total_price: number | null;
  adjusted_product_price: number | null;
  adjusted_shipping_fee: number | null;
  adjusted_total_price: number | null;
  final_amount: number | null;
  vat_amount: number | null;
  admin_price_memo: string | null;
  customer_card_extra_rate_applied: number | null;
  actual_card_fee_rate_applied: number | null;
  refund_amount: number | null;
  payment_method: string | null;
  admin_order_status_v2: string | null;
  order_manage_status: string | null;
  tracking_number: string | null;
  tracking_company: string | null;
  shipped_at: string | null;
  customer_id: number | null;
  deposit_confirmed_at: string | null;
  inventory_deducted_at?: string | null;
  inventory_ledger_id?: string | null;
  inventory_deduction_status?: string | null;
  inventory_deduction_memo?: string | null;
  inventory_restored_at?: string | null;
  inventory_restore_ledger_id?: string | null;
  inventory_restore_status?: string | null;
  inventory_restore_memo?: string | null;
  is_deleted: boolean | null;
};

export type CustomerRow = {
  id: number;
  youtube_nickname: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  detail_address: string | null;
  customer_memo: string | null;
  customer_tags: string[] | null;
  is_blocked: string | boolean | null;
  block_reason: string | null;
  last_order_at: string | null;
  created_at: string | null;
};

export type DepositRow = {
  id: number;
  depositor_name: string;
  amount: number;
  deposited_time: string | null;
  match_order_group_id: string | null;
  match_customer_id: number | null;
  match_status: string;
  confirmed_at: string | null;
  confirmed_note: string | null;
  created_at: string | null;
};

export type MoneyEditLogRow = {
  id: number;
  order_id: number;
  order_group_id: string | null;
  order_lookup_code: string | null;
  changed_at: string | null;
  changed_by: string | null;
  change_source: string | null;
  field_name: string | null;
  before_value: string | null;
  after_value: string | null;
  before_numeric: number | null;
  after_numeric: number | null;
  reason: string | null;
};

export type StatusChangeLogRow = {
  id: number;
  order_id: number | null;
  order_group_id: string | null;
  order_lookup_code: string | null;
  changed_at: string | null;
  changed_by: string | null;
  change_source: string | null;
  before_status: string | null;
  after_status: string | null;
  before_order_manage_status: string | null;
  after_order_manage_status: string | null;
  payment_method: string | null;
  deposit_confirmed_at_before: string | null;
  deposit_confirmed_at_after: string | null;
};

export type BroadcastRow = {
  id: string;
  public_title: string | null;
  admin_subtitle: string | null;
  started_at: string | null;
  created_at: string | null;
};


export type AdminTaskRow = {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  task_type: string;
  title: string;
  body: string | null;
  source: string;
  priority: string;
  status: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_nickname: string | null;
  related_product: string | null;
  due_at: string | null;
  resolved_at: string | null;
  resolved_note: string | null;
  raw_payload: Record<string, unknown> | null;
};

export type SettingRow = { key: string; value: string };

export type OrderGroup = {
  groupId: string;
  first: OrderRow;
  rows: OrderRow[];
  totalAmount: number;
  totalQty: number;
};

export type RosenShippingPreviewStatus = "ready" | "check" | "blocked";

export type RosenShippingPreviewRow = {
  rowNumber: number;
  key: string;
  orderIds: number[];
  customerName: string;
  phone: string;
  address: string;
  itemSummary: string;
  requestMemo: string;
  status: RosenShippingPreviewStatus;
  message: string;
};
