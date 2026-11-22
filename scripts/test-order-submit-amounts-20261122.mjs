// Actual client success assignments + the shared saved-amount parser.
// No React renderer, browser, payment, database or deployment is exercised.
import assert from "node:assert/strict";
import fs from "node:fs";
import { readOrderSubmitAmounts } from "../lib/orderSubmitAmounts.ts";

const client = fs.readFileSync(new URL("../app/order/page.tsx", import.meta.url), "utf8");
const start = client.indexOf("      const savedSubmitAmounts = readOrderSubmitAmounts(") >= 0
  ? client.indexOf("      const savedSubmitAmounts = readOrderSubmitAmounts(")
  : client.indexOf("      const savedPointUsedAmount = toNumber(orderSubmitPayload?.point_used_amount);");
const end = client.indexOf("      setHistoricalPaymentBankAccount(null);", start);
assert(start >= 0 && end > start, "client success assignment block must exist");
const run = new Function("context", `with (context) { ${client.slice(start, end)} }`);
let passed = 0;
function check(name, fn) { fn(); passed++; console.log("PASS " + name); }

function confirmation(payload, overrides = {}) {
  const out = { done: null, balance: 3000, reloads: 0 };
  const context = {
    orderSubmitPayload: payload, readOrderSubmitAmounts, toNumber: (value) => Number(value || 0),
    appliedTotalAmount: 10000, productAmount: 10000, appliedShippingFee: 0,
    appliedCardExtra: 0, cardRateForCustomer: 0,
    youtubeNickname: "검증손님", customerName: "검증손님", recipientName: "", recipientPhone: "",
    customerPhone: "01012345678", address: "서울 테스트로 1", detailAddress: "101호",
    formatPhone: (value) => value, paymentMethod: "무통장입금", validItems: [{ qty: 1 }], totalQty: 1,
    assignedBank: { bankAccount: { id: "secondary" } },
    pendingOrderKeyRef: { current: { groupId: "fixture" } }, subscribeWaivedAmount: 0,
    setCustomerPointBalance: (update) => { out.balance = typeof update === "function" ? update(out.balance) : update; },
    setCustomerPointReload: (update) => { out.reloads = update(out.reloads); },
    setDone: (value) => { out.done = value; },
    ...overrides,
  };
  run(context);
  return out;
}
const replay = {
  ok: true, duplicate: true, point_original_amount: 14000, point_used_amount: 2000,
  order_summary: { productAmount: 10000, shippingFee: 4000, cardExtra: 0, totalAmount: 14000, customerCardRate: 0 },
};

check("retry confirmation displays saved shipping and total after the client recalculated free shipping", () => {
  const { done } = confirmation(replay);
  assert.equal(done.shippingFee, 4000);
  assert.equal(done.totalAmount, 14000);
  assert.equal(done.productAmount, 10000);
  assert.equal(done.finalAmount, 12000);
  assert.equal(done.pointUsedAmount, 2000);
});
check("retry refreshes the point balance instead of deducting the saved use again", () => {
  const out = confirmation(replay);
  assert.equal(out.balance, 3000);
  assert.equal(out.reloads, 1);
});
check("retry card confirmation retains the saved surcharge and rate", () => {
  const { done } = confirmation({ ...replay, point_original_amount: 14420,
    order_summary: { ...replay.order_summary, cardExtra: 420, totalAmount: 14420, customerCardRate: 3 },
  }, { paymentMethod: "카드결제", cardRateForCustomer: 5 });
  assert.equal(done.cardExtra, 420);
  assert.equal(done.customerCardRate, 3);
  assert.equal(done.finalAmount, 12420);
});
check("a legitimate saved zero-total replay does not fall back to the current total", () => {
  const { done } = confirmation({ ...replay, point_original_amount: 0, point_used_amount: 0,
    order_summary: { productAmount: 0, shippingFee: 0, cardExtra: 0, totalAmount: 0, customerCardRate: 0 },
  });
  assert.equal(done.totalAmount, 0);
  assert.equal(done.finalAmount, 0);
});
check("fresh-order confirmation keeps existing amounts and one local point deduction", () => {
  const out = confirmation({ ok: true, point_original_amount: 10000, point_used_amount: 2000 });
  assert.equal(out.done.totalAmount, 10000);
  assert.equal(out.done.shippingFee, 0);
  assert.equal(out.balance, 1000);
  assert.equal(out.reloads, 0);
});
for (const summary of [undefined, {}, { ...replay.order_summary, shippingFee: -1 },
  { ...replay.order_summary, totalAmount: 99 }, { ...replay.order_summary, cardExtra: NaN }]) {
  check("an invalid saved summary cannot be shown as a successful replay", () => {
    assert.throws(() => readOrderSubmitAmounts({ ...replay, order_summary: summary }, replay.order_summary), /금액/);
  });
}
check("amount verification precedes discarding the pending order key", () => {
  const verify = client.indexOf("      const savedSubmitAmounts = readOrderSubmitAmounts(");
  const discard = client.indexOf("      pendingOrderKeyRef.current = null;", client.indexOf("const submitOrder ="));
  assert(verify >= 0 && discard > verify);
});
check("point reload is connected to the existing balance-reading effect", () => {
  assert(client.includes("const [customerPointReload, setCustomerPointReload] = useState(0);"));
  const effectStart = client.lastIndexOf("  useEffect(() => {", client.indexOf("    const loadCustomerPoints = async () => {"));
  const effectEnd = client.indexOf("  useEffect(() => {", effectStart + 1);
  assert.match(client.slice(effectStart, effectEnd), /\}, \[customerPhone, customerPointReload\]\);/);
});
console.log(`RURU_ORDER_SUBMIT_AMOUNTS_PASS=${passed}`);
console.log("LIMIT=actual client success assignments and amount parser; not a rendered browser or payment E2E");
