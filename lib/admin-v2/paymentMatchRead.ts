// Transfer optimization only: retain every row and every field read by matching.
// Discover actual columns from one row, so legacy aliases / missing columns are
// handled without assuming a production schema. No financial data is cached.
export const PAYMENT_MATCH_ORDER_FIELDS = [
  "id", "order_group_id", "group_id", "youtube_nickname", "nickname", "customer_nickname",
  "customer_name", "name", "buyer_name", "final_amount", "adjusted_total_price", "total_price",
  "payment_amount", "deposit_amount", "order_amount", "amount", "point_used_amount",
  "pointUsedAmount", "used_point_amount", "admin_order_status_v2", "order_manage_status",
  "deposit_status", "payment_status", "order_status", "status", "payment_method",
  "deposit_confirmed_at", "exclude_from_payment_match", "is_test_order",
] as const;

export const PAYMENT_MATCH_DEPOSIT_FIELDS = [
  "id", "deposit_id", "bankda_id", "transaction_id", "depositor_name", "deposit_name",
  "sender_name", "bkjukyo", "amount", "deposit_amount", "input_amount", "bkinput",
  "match_status", "status", "payment_status", "confirmed_at", "match_order_group_id",
  "match_customer_id",
] as const;

export function paymentMatchProjection(row: Record<string, unknown> | undefined, fields: readonly string[]) {
  if (!row) return "*";
  const columns = fields.filter((field) => Object.prototype.hasOwnProperty.call(row, field));
  return columns.includes("id") ? columns.join(",") : "*";
}

export async function readPaymentMatchRows(
  db: any,
  table: "orders" | "deposits",
  applyFilter: ((query: any) => any) | null,
) {
  const fields = table === "orders" ? PAYMENT_MATCH_ORDER_FIELDS : PAYMENT_MATCH_DEPOSIT_FIELDS;
  const probe = await db.from(table).select("*").limit(1);
  let selection = probe.error ? "*" : paymentMatchProjection(probe.data?.[0], fields);
  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];
  while (true) {
    let query = db.from(table).select(selection).range(from, from + pageSize - 1);
    if (applyFilter) query = applyFilter(query);
    const { data, error } = await query;
    // A concurrent schema change must not break payment processing. Restart
    // using the original read, never return a partial set of matching candidates.
    if (error && selection !== "*" && ["42703", "PGRST204"].includes(String(error.code))) {
      selection = "*";
      from = 0;
      all.length = 0;
      continue;
    }
    if (error) return { data: null, error };
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}
