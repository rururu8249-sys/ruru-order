import { parseOrderBankRoutingResult } from "./orderBankAccount";
import { shippingAddressKey } from "./shippingAddressKey";

type Row = Record<string, unknown>;

export class CustomerOrderReplayError extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "CustomerOrderReplayError";
    this.status = status;
  }
}

const CONFLICT = "이미 접수된 주문과 내용이 다릅니다. 주문내역에서 접수된 상품과 배송지를 확인해 주세요.";
const READ_FAILED = "기존 주문 확인이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.";
const clean = (value: unknown) => String(value ?? "").trim();
const digits = (value: unknown) => clean(value).replace(/[^0-9]/g, "");
const words = (value: unknown) => clean(value).replace(/\s+/g, " ");

const TEXT_INTENT_FIELDS = [
  "order_lookup_code", "broadcast_id", "customer_name", "youtube_nickname",
  "product_id", "color", "size", "payment_method", "request_memo", "special_note",
  "memo", "test_order_reason", "operator_test_phone",
] as const;
const NUMBER_INTENT_FIELDS = ["qty", "product_price", "adjusted_product_price"] as const;
const FLAG_INTENT_FIELDS = [
  "is_test_order", "exclude_from_settlement", "exclude_from_payment_match",
  "exclude_from_shipping", "exclude_from_picking",
] as const;

// Read the whole group before checking ownership. Filtering by owner first
// would hide a conflicting row. Exact count also detects API row truncation.
const REPLAY_SELECT = [...new Set([
  "id", "order_group_id", "kakao_id", "customer_phone", "phone", "product_name",
  "address", "detail_address", "recipient_name", "recipient_phone",
  ...TEXT_INTENT_FIELDS, ...NUMBER_INTENT_FIELDS, ...FLAG_INTENT_FIELDS,
  "is_deleted", "order_status", "order_manage_status", "admin_status", "admin_order_status_v2",
  "customer_order_segment", "payment_bank_account_id", "payment_bank_name",
  "payment_bank_account", "payment_bank_holder", "payment_bank_assignment_source",
  "point_original_amount", "point_used_amount", "shipping_fee", "adjusted_shipping_fee",
  "vat_amount", "customer_card_extra_rate_applied",
])].join(",");

function amount(value: unknown): number {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result) || result < 0) throw new CustomerOrderReplayError(CONFLICT);
  return result;
}

function intent(row: Row): string {
  return JSON.stringify([
    ...TEXT_INTENT_FIELDS.map((field) => clean(row[field])),
    // The existing product-detail canonicalizer collapses whitespace.
    words(row.product_name),
    ...NUMBER_INTENT_FIELDS.map((field) => amount(row[field])),
    ...FLAG_INTENT_FIELDS.map((field) => row[field] === true),
    shippingAddressKey(row.address, row.detail_address),
  ]);
}

export type CustomerOrderReplayInput = {
  orderRows: Row[];
  phone: string;
  kakaoId: string;
  customerName: string;
  youtubeNickname: string;
  recipientName: string;
  recipientPhone: string;
};

/** Read-only acknowledgement of an already committed ordinary customer order.
 * A replay never calls the save RPC: the group could be deleted between the
 * read and that RPC, which would otherwise create a new order without guards.
 * Shipping, card charges and point requests can legitimately be recalculated
 * by the client on retry; the saved amounts, not those requests, are returned.
 */
export async function readCustomerOrderReplay(db: any, input: CustomerOrderReplayInput) {
  const { orderRows, phone, kakaoId } = input;
  const groupId = clean(orderRows[0]?.order_group_id);
  if (!groupId) throw new CustomerOrderReplayError("주문 그룹 식별값이 없습니다.", 400);
  if (orderRows.some((row) => clean(row.order_group_id) !== groupId)) {
    throw new CustomerOrderReplayError(CONFLICT);
  }
  if (kakaoId && !/^[0-9]+$/.test(kakaoId)) {
    throw new CustomerOrderReplayError("카카오 고객 식별값이 올바르지 않습니다.", 400);
  }
  const expectedPhone = digits(phone);
  for (const row of orderRows) {
    if ((clean(row.kakao_id) && clean(row.kakao_id) !== kakaoId) ||
        [row.customer_phone, row.phone].some((value) => clean(value) && digits(value) !== expectedPhone)) {
      throw new CustomerOrderReplayError(CONFLICT);
    }
  }

  const { data, error, count } = await db.from("orders")
    .select(REPLAY_SELECT, { count: "exact" })
    .eq("order_group_id", groupId)
    .order("id", { ascending: true })
    .limit(Math.min(orderRows.length + 1, 1000));
  if (error || !Array.isArray(data) || !Number.isSafeInteger(count)) {
    throw new CustomerOrderReplayError(READ_FAILED, 503);
  }
  if (count === 0 && data.length === 0) return null;
  if (count !== orderRows.length) throw new CustomerOrderReplayError(CONFLICT);
  if (data.length !== count) throw new CustomerOrderReplayError(READ_FAILED, 503);
  const savedRows = data as Row[];

  for (const row of savedRows) {
    const savedKakao = clean(row.kakao_id);
    // Known Kakao owners cannot be downgraded to phone-only. Older rows with
    // no Kakao ID retain the existing bank-routing phone fallback.
    if (clean(row.order_group_id) !== groupId ||
        digits(row.customer_phone || row.phone) !== expectedPhone ||
        (savedKakao && savedKakao !== kakaoId)) {
      throw new CustomerOrderReplayError(CONFLICT);
    }
    const statuses = [row.order_status, row.order_manage_status, row.admin_status, row.admin_order_status_v2]
      .map(clean).join(" ");
    if (row.is_deleted === true || /취소|환불|cancel|refund/i.test(statuses)) {
      throw new CustomerOrderReplayError("취소·삭제 또는 환불된 주문입니다. 주문내역을 확인해 주세요.");
    }
    const savedRecipientName = clean(row.recipient_name) || clean(row.customer_name);
    const savedRecipientPhone = digits(row.recipient_phone) || digits(row.customer_phone || row.phone);
    const requestedRecipientName = clean(input.recipientName) || clean(input.customerName);
    const requestedRecipientPhone = digits(input.recipientPhone) || expectedPhone;
    if (savedRecipientName !== requestedRecipientName || savedRecipientPhone !== requestedRecipientPhone) {
      throw new CustomerOrderReplayError(CONFLICT);
    }
  }

  // Preserve duplicates in the multiset; Set would incorrectly accept a
  // changed count of the same product/option. Row order itself is immaterial.
  const requested = orderRows.map((row) => ({
    ...row,
    customer_name: clean(row.customer_name) || input.customerName,
    youtube_nickname: clean(row.youtube_nickname) || input.youtubeNickname,
  })).map(intent).sort();
  if (JSON.stringify(requested) !== JSON.stringify(savedRows.map(intent).sort())) {
    throw new CustomerOrderReplayError(CONFLICT);
  }

  let bank: ReturnType<typeof parseOrderBankRoutingResult>;
  try {
    const banks = savedRows.map((row) => parseOrderBankRoutingResult({
      customer_order_segment: row.customer_order_segment,
      bank_account: {
        id: row.payment_bank_account_id, bankName: row.payment_bank_name,
        bankAccount: row.payment_bank_account, bankHolder: row.payment_bank_holder,
      },
    }));
    bank = banks[0];
    if (banks.some((value) => JSON.stringify(value) !== JSON.stringify(bank))) throw new Error("conflict");
  } catch {
    throw new CustomerOrderReplayError("접수된 주문의 입금계좌 확인이 필요합니다. 주문내역을 확인해 주세요.");
  }

  const sum = (field: string) => savedRows.reduce((total, row) => amount(total + amount(row[field])), 0);
  const originalAmount = sum("point_original_amount");
  const usedAmount = sum("point_used_amount");
  const productAmount = sum("adjusted_product_price");
  const shippingFee = sum("adjusted_shipping_fee");
  const cardExtra = sum("vat_amount");
  const customerCardRate = amount(savedRows[0].customer_card_extra_rate_applied);
  if (usedAmount > originalAmount || productAmount + shippingFee + cardExtra !== originalAmount ||
      savedRows.some((row) => amount(row.customer_card_extra_rate_applied) !== customerCardRate)) {
    throw new CustomerOrderReplayError("접수된 주문의 결제 금액 확인이 필요합니다. 주문내역을 확인해 주세요.");
  }

  return {
    ok: true, duplicate: true, inserted_count: savedRows.length,
    order_ids: savedRows.map((row) => row.id),
    point_original_amount: originalAmount, point_used_amount: usedAmount,
    point_balance_before: null, point_balance_after: null, point_ledger_id: null,
    customer_order_segment: bank.customerOrderSegment, bank_account: bank.bankAccount,
    customerOrderSegment: bank.customerOrderSegment, bankAccount: bank.bankAccount,
    order_summary: { productAmount, shippingFee, cardExtra, totalAmount: originalAmount, customerCardRate },
  };
}
