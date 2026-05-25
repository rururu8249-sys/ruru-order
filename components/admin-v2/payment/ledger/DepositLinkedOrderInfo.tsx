import type { RawDepositRow } from "./depositLedgerTypes";

type AnyRow = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function first(row: AnyRow, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && cleanText(value) !== "") return value;
  }

  return "";
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = cleanText(value).replace(/[^0-9.-]/g, "");
  const number = Number(text);

  return Number.isFinite(number) ? number : 0;
}

function money(value: unknown) {
  const amount = toNumber(value);
  if (!amount) return "-";

  return `${amount.toLocaleString()}원`;
}

function safeOrderCode(order: AnyRow) {
  const code = cleanText(
    first(order, [
      "order_lookup_code",
      "lookup_code",
      "order_no",
      "order_number",
      "order_group_id",
      "group_id",
      "id",
    ]),
  );

  if (!code) return "주문 연결됨";
  if (UUID_RE.test(code)) return "주문 연결됨";

  return code;
}

function orderNickname(order: AnyRow) {
  return cleanText(first(order, ["youtube_nickname", "nickname", "customer_nickname", "name"])) || "-";
}

function productName(order: AnyRow) {
  const product = cleanText(first(order, ["product_name", "item_name", "name", "title"]));
  const option = [
    cleanText(first(order, ["color", "product_color"])),
    cleanText(first(order, ["size", "product_size"])),
    cleanText(first(order, ["option", "product_option", "option_name"])),
  ]
    .filter(Boolean)
    .join(" / ");

  if (!product && !option) return "주문내역 확인 필요";
  if (!option) return product;

  return `${product} (${option})`;
}

function qtyText(order: AnyRow) {
  const qty = toNumber(first(order, ["qty", "quantity", "count"]));
  if (!qty) return "";

  return ` x${qty}개`;
}

function orderAmount(order: AnyRow) {
  return first(order, [
    "payment_amount",
    "deposit_amount",
    "total_amount",
    "final_amount",
    "order_amount",
    "product_amount",
    "amount",
    "price",
  ]);
}

function orderStatus(order: AnyRow) {
  return cleanText(
    first(order, [
      "admin_order_status_v2",
      "order_manage_status",
      "payment_status",
      "deposit_status",
      "status",
    ]),
  ) || "-";
}

function linkedOrdersFromDeposit(row: RawDepositRow) {
  const value = (row as AnyRow).linked_orders || (row as AnyRow).linkedOrders;

  return Array.isArray(value) ? (value as AnyRow[]) : [];
}

export default function DepositLinkedOrderInfo({ row }: { row: RawDepositRow }) {
  const orders = linkedOrdersFromDeposit(row);
  const totalAmount = orders.reduce((sum, order) => sum + toNumber(orderAmount(order)), 0);

  if (orders.length === 0) {
    return (
      <section className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
        <div className="text-sm font-black text-slate-800">연결 주문 정보</div>
        <div className="mt-2 text-xs font-bold leading-5 text-slate-500">
          연결된 주문 상세가 현재 입금내역에 포함되어 있지 않습니다. 입금 자체 정보는 위 상세 기록을 기준으로 확인하세요.
        </div>
      </section>
    );
  }

  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-blue-100 bg-blue-50/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 px-5 py-4">
        <div>
          <div className="text-sm font-black text-slate-950">연결 주문 정보</div>
          <div className="mt-1 text-xs font-bold text-slate-500">
            이 입금과 연결된 주문내역입니다. 금액 검증용으로만 표시합니다.
          </div>
        </div>

        <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700 shadow-sm">
          {orders.length.toLocaleString()}건 · {totalAmount ? money(totalAmount) : "금액 확인 필요"}
        </div>
      </div>

      <div className="divide-y divide-blue-100 bg-white">
        {orders.map((order, index) => (
          <article key={`${safeOrderCode(order)}-${index}`} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_150px_120px] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">
                  {safeOrderCode(order)}
                </span>
                <span className="text-xs font-black text-slate-500">
                  {orderNickname(order)}
                </span>
              </div>
              <div className="mt-2 break-words text-sm font-black leading-6 text-slate-950">
                {productName(order)}
                {qtyText(order)}
              </div>
            </div>

            <div className="text-sm font-black tabular-nums text-slate-950 md:text-right">
              {money(orderAmount(order))}
            </div>

            <div className="md:text-right">
              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-600">
                {orderStatus(order)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
