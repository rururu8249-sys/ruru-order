// Run: node scripts/test-order-pending-cart-20261122.mjs
// Execute the complete syncCartReservations function from the real page, with
// real cart snapshot/clear-mark helpers. Only I/O and React state boundaries
// are fixtures. This does not render React or use a live browser/database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { buildCartHoldSnapshotItem } from "../lib/cartHoldDetail.ts";
import { CART_SEQ_NEW, cartItemClearedBy } from "../lib/cartClearMarks.ts";

const page = readFileSync(new URL("../app/order/page.tsx", import.meta.url), "utf8");
function completeLocalFunction(name) {
  const start = page.indexOf(`  const ${name} = `);
  assert.ok(start >= 0, `actual page must define ${name}`);
  const match = /^  };\r?$/m.exec(page.slice(start));
  assert.ok(match, `complete ${name} definition must have a closing declaration`);
  return page.slice(start, start + match.index + match[0].length);
}
const onlyNumberDeclaration = /^const onlyNumber = .*;\r?$/m.exec(page)?.[0];
const noticeDeclaration = /^const CART_CLEARED_NOTICE = .*;\r?$/m.exec(page)?.[0];
assert.ok(onlyNumberDeclaration && noticeDeclaration);
const executable = stripTypeScriptTypes([
  onlyNumberDeclaration,
  noticeDeclaration,
  completeLocalFunction("getCartSessionKey"),
  completeLocalFunction("syncCartReservations"),
].join("\n"), { mode: "transform" });
const executeSync = new Function("context", `with (context) { ${executable}\nreturn syncCartReservations(); }`);

const SESSION = "pending-order-cart-session";
const OWNER = "123456789";
const PHONE = "01012345678";
const submittedItem = {
  product_id: "101", product_name: "검증 상품", color: "블랙", size: "M",
  qty: "1", product_price: "10000", cart_seq: 42,
};
const directItem = {
  product_name: "직접입력", color: "", size: "", qty: "1", product_price: "5000",
};
const pending = {
  groupId: "e510e8e1-d2a5-4e60-9cb9-000000000001", lookupCode: "RURU-TEST",
  cartItems: [{ productId: "101", color: "블랙", size: "M" }],
};
function rejection(overrides = {}) {
  return {
    productId: "101", color: "블랙", size: "M", requested: 1, ok: false,
    cleared: true, expired: true, silent: true, clearReason: "submitted", clearedSeq: 43, available: 0,
    ...overrides,
  };
}
function response(results = [rejection()], overrides = {}) {
  return { ok: true, allOk: false, results, cartSeq: 43, clearedSeq: null, ...overrides };
}

async function sync({ pendingOrder = pending, items = [submittedItem, directItem], claim = response(), afterFetch } = {}) {
  const state = { items: structuredClone(items), requests: [], notices: [], bankOverrides: [], errors: [], storageWrites: [], itemUpdates: 0, changedArrays: 0 };
  state.initialItems = state.items;
  const storage = new Map([["ruru_cart_session_key", SESSION], ["ruru_kakao_id", OWNER]]);
  const localStorage = {
    getItem(key) {
      if (!["ruru_cart_session_key", "ruru_kakao_id", "ruru_cart_notice_seq"].includes(key)) {
        state.errors.push(`Unexpected storage read: ${key}`);
        throw new Error(state.errors.at(-1));
      }
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      if (key !== "ruru_cart_notice_seq") {
        state.errors.push(`Unexpected storage write: ${key}`);
        throw new Error(state.errors.at(-1));
      }
      storage.set(key, value);
      state.storageWrites.push([key, value]);
    },
  };
  const pendingOrderKeyRef = { current: structuredClone(pendingOrder) };
  const context = {
    items: state.items,
    customerPhone: "010-1234-5678", youtubeNickname: "검증 닉네임", customerName: "검증 고객",
    cartSessionKeyRef: { current: "" }, pendingOrderKeyRef,
    localStorage, window: { localStorage },
    buildCartHoldSnapshotItem, CART_SEQ_NEW,
    async fetch(url, options) {
      try {
        assert.equal(url, "/api/cart-reservations");
        assert.equal(options.method, "POST");
        assert.deepEqual(options.headers, { "Content-Type": "application/json" });
        const body = JSON.parse(options.body);
        assert.equal(body.action, "sync");
        assert.equal(body.sessionKey, SESSION);
        assert.equal(body.phone, PHONE);
        assert.equal(body.kakaoId, OWNER);
        assert.equal(body.nickname, "검증 닉네임");
        assert.equal(body.customerName, "검증 고객");
        state.requests.push(body);
        if (afterFetch) afterFetch(pendingOrderKeyRef);
        return Response.json(claim);
      } catch (error) { state.errors.push(error.message); throw error; }
    },
    setItems(update) {
      try {
        const previous = state.items;
        state.itemUpdates++;
        state.items = typeof update === "function" ? update(previous) : update;
        if (state.items !== previous) state.changedArrays++;
      }
      catch (error) { state.errors.push(error.message); throw error; }
    },
    setCartBankAccountOverride(value) { state.bankOverrides.push(value); },
    // showCustomerNotice is the page's UI state boundary; no dialog is opened.
    showCustomerNotice(value) { state.notices.push(String(value)); },
  };
  await executeSync(context);
  assert.deepEqual(state.errors, [], "fixture errors must not be swallowed by the page's catch");
  assert.equal(state.requests.length, 1, "sync must send exactly one real-shaped claim request");
  assert.equal(state.bankOverrides.length, claim.revoked === true ? 2 : 1,
    "unexpected catch fallback must not make a retention test pass by accident");
  return state;
}

const cases = [
  ["pending submitted item remains available for retry after a silent submitted clear mark", async () => {
    const run = await sync();
    assert.deepEqual(run.items, [submittedItem, directItem]);
    assert.equal(run.items, run.initialItems, "protected-only clear results must retain the exact React state array");
    assert.equal(run.changedArrays, 0);
    assert.equal(run.itemUpdates, 1, "only the existing server-sequence updater should run, returning the same array");
    assert.deepEqual(run.notices, []);
    assert.deepEqual(run.requests[0].items, [{ productId: "101", productName: "검증 상품", color: "블랙", size: "M", qty: 1, unitPrice: 10000, cartSeq: 42 }]);
  }],
  ["submitted marks still remove items when no order result is pending", async () => {
    const run = await sync({ pendingOrder: null });
    assert.deepEqual(run.items, [directItem]);
    assert.deepEqual(run.notices, []);
  }],
  ["protected-only response without a new server sequence does not call setItems", async () => {
    const run = await sync({ claim: response([rejection()], { cartSeq: undefined }) });
    assert.equal(run.items, run.initialItems);
    assert.equal(run.itemUpdates, 0);
    assert.equal(run.changedArrays, 0);
  }],
  ["a pending key without a submitted item snapshot cannot protect unrelated rows", async () => {
    const run = await sync({ pendingOrder: { groupId: pending.groupId, lookupCode: pending.lookupCode } });
    assert.deepEqual(run.items, [directItem]);
  }],
  ["a different newly added option is not protected by the pending order snapshot", async () => {
    const whiteItem = { ...submittedItem, color: "화이트" };
    const run = await sync({ items: [submittedItem, whiteItem, directItem], claim: response([rejection(), rejection({ color: "화이트" })]) });
    assert.deepEqual(run.items, [submittedItem, directItem]);
  }],
  ["normalized option values match the submitted snapshot without changing request sequence", async () => {
    const noOptionItem = { ...submittedItem, color: "없음", size: "없음" };
    const run = await sync({ items: [noOptionItem], pendingOrder: { ...pending, cartItems: [{ productId: "101", color: "", size: "" }] },
      claim: response([rejection({ color: "", size: "" })]) });
    assert.deepEqual(run.items, [noOptionItem]);
    assert.equal(run.requests[0].items[0].cartSeq, 42);
  }],
  ["retention keeps the old sequence so the real server clear-mark rule still rejects re-holding", async () => {
    const first = await sync();
    const second = await sync({ items: first.items });
    assert.deepEqual(second.items, [submittedItem, directItem]);
    assert.equal(second.requests[0].items[0].cartSeq, 42);
    assert.deepEqual(cartItemClearedBy(second.requests[0].items[0], [{ seq: 43, reason: "submitted", session_key: SESSION, kakao_id: OWNER,
      customer_phone: PHONE, product_id: "101", color: "블랙", size: "M" }], { sessionKey: SESSION, kakaoId: OWNER, phone: PHONE }),
    { seq: 43, reason: "submitted" });
  }],
  ["completion while a sync request is in flight removes the submitted row normally", async () => {
    const run = await sync({ afterFetch: (ref) => { ref.current = null; } });
    assert.deepEqual(run.items, [directItem]);
  }],
  ["legacy revoked response still removes registered items during a pending order", async () => {
    const run = await sync({ claim: response([], { revoked: true }) });
    assert.deepEqual(run.items, [directItem]);
    assert.equal(run.notices.length, 1);
  }],
  ["unavailable product rejection still removes its pending item", async () => {
    const run = await sync({ claim: response([rejection({ cleared: false, expired: false, clearReason: undefined, unavailable: true, unlisted: true, productName: "검증 상품" })]) });
    assert.deepEqual(run.items, [directItem]);
    assert.equal(run.notices.length, 1);
  }],
  ["ordinary sold-out response still removes its pending item", async () => {
    const run = await sync({ claim: response([rejection({ cleared: false, expired: false, clearReason: undefined })]) });
    assert.deepEqual(run.items, [directItem]);
    assert.equal(run.notices.length, 1);
  }],
];

cases.push(["actual pre-submit assignment snapshots the rows sent by the immediately following POST", async () => {
  const submitStart = page.indexOf("const submitOrder =");
  const snapshotStart = page.indexOf("pendingOrderKeyRef.current.cartItems = orderRows", submitStart);
  const fetchStart = page.indexOf('const orderSubmitResponse = await fetch("/api/customer-orders/submit"', submitStart);
  assert.ok(submitStart >= 0 && snapshotStart > submitStart && fetchStart > snapshotStart,
    "the snapshot must be bound to actual orderRows before the submit fetch");
  const actualAssignment = stripTypeScriptTypes(page.slice(snapshotStart, fetchStart), { mode: "transform" });
  const assign = new Function("pendingOrderKeyRef", "orderRows", "buildCartHoldSnapshotItem", actualAssignment);
  const ref = { current: { groupId: pending.groupId, lookupCode: pending.lookupCode, cartItems: [{ productId: "999", color: "old", size: "old" }] } };
  assign(ref, [
    { product_id: 101, product_name: "검증 상품", color: " 없음 ", size: " M ", qty: 2, product_price: 10000 },
    { product_name: "직접입력", color: "", size: "", qty: 1, product_price: 5000 },
  ], buildCartHoldSnapshotItem);
  assert.deepEqual(ref.current, { groupId: pending.groupId, lookupCode: pending.lookupCode, cartItems: [
    { productId: "101", productName: "검증 상품", color: "", size: "M", qty: 2, unitPrice: 10000 },
  ] });
}]);

cases.push(["actual cart route serializes the matched mark reason in the rejected result", async () => {
  const route = readFileSync(new URL("../app/api/cart-reservations/route.ts", import.meta.url), "utf8");
  const start = route.indexOf("clearedResults.push({");
  const end = route.indexOf(");", start);
  assert.ok(start >= 0 && end > start, "actual cart route must build a cleared result");
  const serialize = new Function("clearedResults", "r", "hit", "notice", route.slice(start, end + 2));
  for (const reason of ["submitted", "expired", "admin_clear", "admin_clear_all"]) {
    const results = [];
    serialize(results, { productId: "101", color: "블랙", size: "M", qty: 1 }, { seq: 43, reason }, reason !== "submitted");
    assert.deepEqual(results, [{ productId: "101", color: "블랙", size: "M", requested: 1, ok: false,
      cleared: true, expired: true, silent: reason === "submitted", clearReason: reason, clearedSeq: 43, available: 0 }]);
  }
}]);

for (const reason of ["expired", "admin_clear", "admin_clear_all"]) {
  cases.push([`${reason} clear mark still removes pending items and shows the existing notice`, async () => {
    const run = await sync({ claim: response([rejection({ clearReason: reason, silent: false })], { clearedSeq: 43 }) });
    assert.deepEqual(run.items, [directItem]);
    assert.equal(run.notices.length, 1);
    assert.deepEqual(run.storageWrites, [["ruru_cart_notice_seq", "43"]]);
  }]);
}

let failed = 0;
for (const [name, test] of cases) {
  try { await test(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack ?? error}`); }
}
console.log(`RESULT ${cases.length - failed}/${cases.length} actual client cart-sync cases passed`);
console.log("LIMIT: Complete page syncCartReservations function and actual cart helpers executed with I/O/state fixtures; pre-submit snapshot and server-result serialization bindings are evaluated separately. No React rendering, live browser, database RPC, or end-to-end order flow was exercised.");
if (failed) process.exitCode = 1;
