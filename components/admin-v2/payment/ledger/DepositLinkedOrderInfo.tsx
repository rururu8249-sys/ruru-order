import type { RawDepositRow } from "./depositLedgerTypes";

type AnyRow = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function depositAmount(row: AnyRow) {
  return first(row, [
    "amount",
    "deposit_amount",
    "payment_amount",
    "in_amount",
    "income",
    "bkinput",
    "money",
    "price",
  ]);
}

function amountLabel(value: unknown, fallbackDepositAmount: unknown) {
  const orderMoney = toNumber(value);
  if (orderMoney > 0) return money(orderMoney);

  const depositMoney = toNumber(fallbackDepositAmount);
  if (depositMoney > 0) return `입금액 기준 ${money(depositMoney)}`;

  return "금액 정보 없음";
}

function summaryAmountLabel(orderCount: number, totalOrderAmount: number, fallbackDepositAmount: unknown) {
  if (totalOrderAmount > 0) {
    return `${orderCount.toLocaleString()}건 연결됨 · 주문합계 ${money(totalOrderAmount)}`;
  }

  const depositMoney = toNumber(fallbackDepositAmount);
  if (depositMoney > 0) {
    return `${orderCount.toLocaleString()}건 연결됨 · 입금액 기준 ${money(depositMoney)}`;
  }

  return `${orderCount.toLocaleString()}건 연결됨`;
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
  const currentDepositAmount = depositAmount(row as AnyRow);
  const totalOrderAmount = orders.reduce((sum, order) => sum + toNumber(orderAmount(order)), 0);

  if (orders.length === 0) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-sm font-black text-slate-800">연결 주문 정보</div>
        <div className="mt-1 text-xs font-bold leading-5 text-slate-500">
          연결된 주문 상세가 현재 입금내역에 포함되어 있지 않습니다.
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-blue-100 bg-blue-50/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 px-4 py-3">
        <div>
          <div className="text-sm font-black text-slate-950">연결 주문 정보</div>
          <div className="mt-1 text-xs font-bold text-slate-500">이 입금과 연결된 주문내역입니다.</div>
        </div>

        <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700 shadow-sm">
          {summaryAmountLabel(orders.length, totalOrderAmount, currentDepositAmount)}
        </div>
      </div>

      <div className="divide-y divide-blue-100 bg-white">
        {orders.map((order, index) => (
          <article
            key={`${safeOrderCode(order)}-${index}`}
            className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_170px_120px] md:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">
                  {safeOrderCode(order)}
                </span>
                <span className="text-xs font-black text-slate-500">{orderNickname(order)}</span>
              </div>
              <div className="mt-2 break-words text-sm font-black leading-5 text-slate-950">
                {productName(order)}
                {qtyText(order)}
              </div>
            </div>

            <div className="text-sm font-black tabular-nums text-slate-950 md:text-right">
              {amountLabel(orderAmount(order), currentDepositAmount)}
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
