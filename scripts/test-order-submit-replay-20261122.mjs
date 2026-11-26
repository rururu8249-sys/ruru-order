// Run: node scripts/test-order-submit-replay-20261122.mjs
// Requires Node 24; no installed npm dependencies and no live database needed.
// These tests invoke the ACTUAL exported POST and ACTUAL local helpers. They
// cover handler behavior with database/framework boundaries controlled below.
import assert from "node:assert/strict";
import { unregisterOrderSubmitTestLoader } from "./_order-submit-test-loader-20261122.mjs";

const { POST } = await import("../app/api/customer-orders/submit/route.ts");
const boundarySymbol = Symbol.for("ruru.order-submit.runtime-test.20261122");
const originalBoundary = globalThis[boundarySymbol];
const originalFetch = globalThis.fetch;
const originalEnvironment = Object.fromEntries([
  "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LIVE_AUTOMATION_SIGNING_KEY",
].map((key) => [key, process.env[key]]));
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://order-submit-test.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key-no-live-access-20261122";
process.env.LIVE_AUTOMATION_SIGNING_KEY = "test-only-automation-signing-key-20261122";
// An accidentally added remote side effect must fail this suite, including if
// production catches the exception. No network request leaves the test.
let unexpectedFetches = [];
globalThis.fetch = async (...args) => {
  unexpectedFetches.push(String(args[0]));
  throw new Error("Network access is forbidden in this handler test");
};

const GROUP = "b807f6a0-9a2a-4d5c-8e11-000000000001";
const PHONE = "01012345678";
const OWNER = "123456789";
const SESSION = "checkout-retry-fixture-session";
const BANK = {
  id: "secondary", bankName: "테스트은행", bankAccount: "111-222-333333", bankHolder: "테스트판매자",
};
const BANK_FIELDS = {
  customer_order_segment: "first_order",
  payment_bank_account_id: "secondary",
  payment_bank_name: "테스트은행",
  payment_bank_account: "111-222-333333",
  payment_bank_holder: "테스트판매자",
  payment_bank_assigned_at: "2026-11-22T00:00:00Z",
};
const SAVED_RPC_RESULT = {
  ok: true, inserted_count: 1, order_ids: [71],
  point_original_amount: 14000, point_used_amount: 0,
  point_balance_before: null, point_balance_after: null, point_ledger_id: null,
  customer_order_segment: "first_order", bank_account: BANK,
};
const VALID_HOLD = {
  session_key: SESSION, product_id: 101, color: "블랙", size: "M", expires_at: "2099-01-01T00:00:00Z",
};

function line(overrides = {}) {
  return {
    order_group_id: GROUP, product_id: 101, product_name: "회귀검증 상품", color: "블랙", size: "M", qty: 1,
    product_price: 10000, adjusted_product_price: 10000,
    shipping_fee: 4000, adjusted_shipping_fee: 4000,
    total_price: 14000, adjusted_total_price: 14000, final_amount: 14000,
    payment_method: "계좌이체", customer_phone: PHONE, kakao_id: OWNER,
    customer_name: "검증손님", youtube_nickname: "검증닉네임",
    address: "서울시 테스트로 1", detail_address: "101호", zipcode: "01234",
    broadcast_id: "a807f6a0-9a2a-4d5c-8e11-000000000014", vat_amount: 0, ruru_subscribe_waiver_requested: false,
    ...overrides,
  };
}

function saved(overrides = {}) {
  return {
    ...line(), id: 71, ...BANK_FIELDS,
    point_original_amount: 14000, point_used_amount: 0,
    order_status: "주문완료", order_manage_status: "미입금", is_test_order: false,
    ...overrides,
  };
}

function payload(overrides = {}) {
  return {
    orderRows: [line()], customer_phone: PHONE, kakao_id: OWNER,
    cart_session_key: SESSION, point_use_amount: 0,
    customer_name: "검증손님", youtube_nickname: "검증닉네임",
    ...overrides,
  };
}

const compact = (value) => String(value).replace(/\s/g, "");
const result = (data, error = null) => ({ data: structuredClone(data), error });
const op = (query, name) => query.steps.find((step) => step.name === name)?.args;
const columns = (query) => compact(op(query, "select")?.[0] ?? "");
const hasSteps = (query, names) => query.steps.map((step) => step.name).join(",") === names.join(",");
const eq = (query, key) => query.steps.find((step) => step.name === "eq" && step.args[0] === key)?.args[1];
// Only real order columns used by the replay read are recognized. Returning a
// projection (instead of every fixture property) catches an omitted select.
const ORDER_COLUMNS = new Set([
  "id", "order_group_id", "order_lookup_code", "kakao_id", "customer_phone", "phone",
  "product_id", "product_name", "color", "size", "qty", "product_price", "adjusted_product_price",
  "shipping_fee", "adjusted_shipping_fee", "total_price", "adjusted_total_price", "final_amount", "vat_amount",
  "point_original_amount", "point_used_amount", "point_ledger_id", "point_balance_before", "point_balance_after",
  "customer_order_segment", "payment_bank_account_id", "payment_bank_name", "payment_bank_account", "payment_bank_holder", "payment_bank_assigned_at", "payment_bank_assignment_source",
  "customer_name", "youtube_nickname", "recipient_name", "recipient_phone", "address", "detail_address", "zipcode",
  "payment_method", "customer_card_extra_rate_applied", "actual_card_fee_rate_applied", "actual_card_fee_amount",
  "broadcast_id", "broadcast_name", "broadcast_public_title", "broadcast_admin_subtitle", "request_memo", "memo", "special_note",
  "order_status", "order_manage_status", "admin_status", "admin_order_status_v2", "shipping_status", "is_deleted", "deleted_at",
  "is_test_order", "test_order_reason", "operator_test_phone", "exclude_from_settlement", "exclude_from_payment_match", "exclude_from_shipping", "exclude_from_picking",
]);

class Query {
  constructor(db, table) { this.db = db; this.table = table; this.steps = []; }
  step(name, args) { this.steps.push({ name, args }); return this; }
  select(...args) { return this.step("select", args); }
  eq(...args) { return this.step("eq", args); }
  in(...args) { return this.step("in", args); }
  gt(...args) { return this.step("gt", args); }
  order(...args) { return this.step("order", args); }
  range(...args) { return this.step("range", args); }
  limit(...args) { return this.step("limit", args); }
  or(...args) { return this.step("or", args); }
  maybeSingle(...args) { return this.step("maybeSingle", args); }
  update(...args) { return this.mutate("update", args); }
  insert(...args) { return this.mutate("insert", args); }
  upsert(...args) { return this.mutate("upsert", args); }
  delete(...args) { return this.mutate("delete", args); }
  mutate(name, args) {
    this.db.mutations.push({ table: this.table, name, args });
    return this.step(name, args);
  }
  then(onFulfilled, onRejected) {
    return Promise.resolve().then(() => this.db.read(this)).then(onFulfilled, onRejected);
  }
}

class FixtureDatabase {
  constructor(options = {}) {
    this.options = { savedRows: [], holds: [], purchaseLimit: null, priorPurchases: [], ...options };
    this.reads = []; this.rpcCalls = []; this.mutations = []; this.unexpected = [];
    this.replayReadCount = 0;
  }
  from(table) { return new Query(this, table); }
  async rpc(name, args) {
    this.rpcCalls.push({ name, args });
    if (this.options.submitResult && name === "submit_customer_order_with_bank_routing") {
      try {
        assert.deepEqual(Object.keys(args).sort(), ["p_order_rows", "p_point_use_amount", "p_customer_phone", "p_youtube_nickname", "p_customer_name", "p_session_key", "p_kakao_id"].sort());
        assert.equal(args.p_customer_phone, PHONE);
        assert.equal(args.p_kakao_id, OWNER);
        assert.equal(args.p_session_key, SESSION);
        assert.deepEqual(args.p_order_rows, [line()]);
        assert.equal(args.p_point_use_amount, 0);
        assert.equal(args.p_youtube_nickname, "검증닉네임");
        assert.equal(args.p_customer_name, "검증손님");
        return result(this.options.submitResult);
      } catch (error) {
        this.unexpected.push(error.message);
        throw error;
      }
    }
    throw new Error(`Unexpected RPC: ${name}`);
  }
  unknown(query) {
    const message = `Unexpected fixture query: ${JSON.stringify({ table: query.table, steps: query.steps })}`;
    this.unexpected.push(message);
    throw new Error(message);
  }
  read(query) {
    this.reads.push({ table: query.table, steps: structuredClone(query.steps) });
    try { return this.dispatch(query); }
    catch (error) {
      if (!this.unexpected.includes(error.message)) this.unexpected.push(error.message);
      throw error;
    }
  }
  dispatch(query) {
    if (this.options.allowFreshPostprocessing === true) {
      if (query.table === "orders" && hasSteps(query, ["update", "eq"]) && eq(query, "order_group_id") === GROUP) {
        assert.deepEqual(op(query, "update"), [{ recipient_name: "받는분", recipient_phone: "01087654321" }]);
        return result(null);
      }
      if (query.table === "cart_reservations" && hasSteps(query, ["delete", "in", "eq", "eq", "eq"])) {
        assert.deepEqual(op(query, "in"), ["customer_phone", [PHONE, "010-1234-5678"]]);
        assert.equal(eq(query, "product_id"), "101");
        assert.equal(eq(query, "color"), "블랙");
        assert.equal(eq(query, "size"), "M");
        return result(null);
      }
      if (query.table === "cart_clear_marks" && hasSteps(query, ["insert"])) {
        assert.deepEqual(op(query, "insert"), [[{
          reason: "submitted", session_key: SESSION, kakao_id: OWNER, customer_phone: PHONE, product_id: "101", color: "블랙", size: "M",
        }]]);
        return result(null);
      }
    }
    if (query.table === "subscribe_verifications" && hasSteps(query, ["select", "eq", "in", "order", "limit"]) && columns(query) === "status,canceled_at") {
      assert.equal(eq(query, "kakao_id"), OWNER);
      assert.deepEqual(op(query, "in"), ["status", ["verified", "canceled"]]);
      assert.deepEqual(op(query, "order"), ["created_at", { ascending: false }]);
      assert.deepEqual(op(query, "limit"), [100]);
      if (this.options.promoConsumed === true) return result([{ status: "verified", canceled_at: null }]);
    }
    if (query.table === "subscribe_free_ship_redemptions" && hasSteps(query, ["select", "eq", "maybeSingle"]) && columns(query) === "kakao_id") {
      assert.equal(eq(query, "kakao_id"), OWNER);
      if (this.options.promoConsumed === true) return result({ kakao_id: OWNER });
    }
    if (query.table === "settings") {
      // [2026-11-26] 구독 무배 혜택 방식(mode): 이 시험은 «한 계정 1번(once)» 규칙을 확인한다.
      if (hasSteps(query, ["select", "eq", "maybeSingle"]) && columns(query) === "key,value" && eq(query, "key") === "subscribe_free_ship_v1") {
        return result({ key: "subscribe_free_ship_v1", value: JSON.stringify({ enabled: true, mode: "once" }) });
      }
      if (hasSteps(query, ["select", "eq", "maybeSingle"]) && columns(query) === "value") {
        const settings = { default_shipping_fee: 4000, vendor_shipping_fee: 4000, overseas_shipping_fee: 0, remote_area_shipping_fee: 6000, ...this.options.settings };
        const key = eq(query, "key");
        if (Object.hasOwn(settings, key)) return result({ value: String(settings[key]) });
      }
      if (hasSteps(query, ["select", "in"]) && columns(query) === "key,value" &&
          JSON.stringify(op(query, "in")) === JSON.stringify(["key", ["order_purchase_consent_mode", "order_purchase_consent_title", "order_purchase_consent_text", "order_purchase_consent_checkbox"]])) {
        return result([{ key: "order_purchase_consent_mode", value: "off" }]);
      }
    }
    if (query.table === "products" && hasSteps(query, ["select", "in"])) {
      assert.deepEqual(op(query, "in"), ["id", [101]], "catalog/purchase-limit lookup must target the requested product");
      if (this.options.catalogError && columns(query) === "id,product_name,price,product_note,shipping_type,combine_shipping,badge_type,badge_types") {
        return result(null, { message: "fixture catalog read failure" });
      }
      const product = { id: 101, product_name: "회귀검증 상품", price: 10000, product_note: this.options.purchaseLimit == null ? {} : { purchase_limit_enabled: true, purchase_limit_qty: this.options.purchaseLimit }, shipping_type: "normal", combine_shipping: true, badge_type: null, badge_types: [] };
      if (columns(query) === "id,product_name,price,product_note,shipping_type,combine_shipping,badge_type,badge_types" ||
          columns(query) === "id,product_name,product_note") return result([product]);
    }
    if (query.table === "product_brand_links" && hasSteps(query, ["select", "in", "order", "range"]) && columns(query) === "source_id,detail_name") {
      assert.deepEqual(op(query, "in"), ["source_id", [101]]);
      assert.deepEqual(op(query, "order"), ["source_id", { ascending: true }]);
      assert.deepEqual(op(query, "range"), [0, 999]);
      return result([]);
    }
    if (query.table === "orders") {
      if (hasSteps(query, ["select", "eq", "order", "limit"]) && eq(query, "order_group_id") === GROUP) {
        const readIndex = this.replayReadCount++;
        assert.deepEqual(op(query, "select")[1], { count: "exact" });
        assert.deepEqual(op(query, "order"), ["id", { ascending: true }]);
        const limit = op(query, "limit")[0];
        assert.ok(Number.isInteger(limit) && limit > 0 && limit <= 1000);
        const selected = columns(query).split(",");
        for (const column of selected) assert.ok(ORDER_COLUMNS.has(column), `Unrecognized order column: ${column}`);
        for (const required of ["id", "order_group_id", "kakao_id", "customer_phone", "product_id", "qty", "product_price", "payment_bank_account_id", "point_original_amount", "point_used_amount"]) {
          assert.ok(selected.includes(required), `Replay query must retrieve ${required}`);
        }
        if (this.options.replayReadError || this.options.replayReadErrorAt === readIndex) return { data: null, count: null, error: { message: "fixture database read failure" } };
        if (this.options.replaySnapshots) assert.ok(readIndex < this.options.replaySnapshots.length, "unexpected extra replay read");
        const rows = [...(this.options.replaySnapshots?.[readIndex] ?? this.options.savedRows)].sort((a, b) => Number(a.id) - Number(b.id));
        return {
          ...result(rows.slice(0, this.options.truncateReplayRows ?? limit).map((row) => Object.fromEntries(selected.map((column) => [column, row[column] ?? null])))),
          count: this.options.savedCountOverride ?? rows.length,
        };
      }
      if (hasSteps(query, ["select", "eq", "limit"]) && columns(query) === "id,kakao_id,customer_phone" && eq(query, "order_group_id") === GROUP) {
        assert.deepEqual(op(query, "limit"), [1]);
        return result(this.options.savedRows.slice(0, 1).map(({ id, kakao_id, customer_phone }) => ({ id, kakao_id, customer_phone })));
      }
      if (hasSteps(query, ["select", "eq", "or"]) && columns(query) === "qty,order_status,order_manage_status,is_test_order" && eq(query, "product_id") === 101) {
        assert.match(op(query, "or")[0], /^kakao_id\.eq\.123456789,and\(kakao_id\.is\.null,customer_phone\.in\.\(01012345678,/);
        return result(this.options.priorPurchases);
      }
    }
    if (query.table === "cart_reservations" && hasSteps(query, ["select", "eq", "gt", "limit"]) && columns(query) === "product_id,color,size") {
      assert.equal(eq(query, "session_key"), SESSION);
      assert.deepEqual(op(query, "limit"), [200]);
      const [field, cutoff] = op(query, "gt");
      assert.equal(field, "expires_at");
      assert.ok(Number.isFinite(Date.parse(cutoff)), "cart hold expiry must be queried against an actual time");
      return result(this.options.holds.filter((hold) => hold.session_key === SESSION && hold.expires_at > cutoff)
        .map(({ product_id, color, size }) => ({ product_id, color, size })));
    }
    return this.unknown(query);
  }
}

async function invoke(options = {}, body = payload(), headers = {}) {
  const db = new FixtureDatabase(options);
  const boundary = {
    after: [],
    createClient(url, key, config) {
      assert.equal(url, "https://order-submit-test.invalid");
      assert.equal(key, "test-only-service-key-no-live-access-20261122");
      assert.deepEqual(config, { auth: { persistSession: false, autoRefreshToken: false } });
      return db;
    },
  };
  globalThis[boundarySymbol] = boundary;
  unexpectedFetches = [];
  const request = new Request("https://checkout-test.invalid/api/customer-orders/submit", {
    method: "POST", headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const response = await POST(request);
  const responseBody = await response.json();
  // These checks prevent a production catch from making an incomplete fake
  // look like the intended validation failure.
  assert.deepEqual(db.unexpected, [], "fixture must recognize every actual database query");
  assert.deepEqual(unexpectedFetches, [], "handler must not call a remote service in this test");
  return { status: response.status, body: responseBody, db, after: boundary.after };
}

function assertNoSideEffects(run, priorSubmitRpcCount = 0) {
  assert.equal(run.db.rpcCalls.length, priorSubmitRpcCount, "replay/rejection must not submit an additional money, point, inventory, or automation RPC");
  if (priorSubmitRpcCount) assert.deepEqual(run.db.rpcCalls.map((call) => call.name), ["submit_customer_order_with_bank_routing"]);
  assert.deepEqual(run.db.mutations, [], "replay/rejection must not update recipient data, holds, clear marks, or orders");
  assert.equal(run.after.length, 0, "replay/rejection must not register duplicate announcement callbacks");
}

function assertSavedReply(run, expected = {}, priorSubmitRpcCount = 0) {
  assertNoSideEffects(run, priorSubmitRpcCount);
  assert.equal(run.status, 200, `saved order should replay successfully: ${JSON.stringify(run.body)}`);
  assert.deepEqual(run.body, {
    ok: true, duplicate: true, inserted_count: 1, order_ids: [71],
    point_original_amount: 14000, point_used_amount: 0,
    point_balance_before: null, point_balance_after: null, point_ledger_id: null,
    customer_order_segment: "first_order", bank_account: BANK,
    customerOrderSegment: "first_order", bankAccount: BANK,
    order_summary: { productAmount: 10000, shippingFee: 4000, cardExtra: 0, totalAmount: 14000, customerCardRate: 0 },
    ...expected,
  });
}

const cases = [
  ["saved registered order succeeds after its original submission consumed the cart hold", async () => {
    const run = await invoke({ savedRows: [saved()], holds: [] });
    assertSavedReply(run);
  }],
  ["saved registered order is not counted a second time against the purchase limit", async () => {
    const prior = saved();
    const run = await invoke({ savedRows: [prior], purchaseLimit: 1, priorPurchases: [prior] });
    assertSavedReply(run);
  }],
  ["fresh registered order still fails when its cart hold has expired", async () => {
    const run = await invoke({ holds: [{ session_key: SESSION, product_id: 101, color: "블랙", size: "M", expires_at: "2020-01-01T00:00:00Z" }] });
    assertNoSideEffects(run);
    assert.equal(run.status, 400);
    assert.equal(run.body.ok, false);
    assert.match(run.body.message, /장바구니.*비워진|담은 지 시간이/);
  }],
  ["fresh registered order still fails when prior purchases exhausted its purchase limit", async () => {
    const run = await invoke({ purchaseLimit: 1, priorPurchases: [saved({ order_group_id: "different-prior-group" })] });
    assertNoSideEffects(run);
    assert.equal(run.status, 400);
    assert.equal(run.body.ok, false);
    assert.match(run.body.message, /1인당 1개.*이미 1개/);
  }],
  ["fresh registered order fails safely when the authoritative catalog read errors", async () => {
    const run = await invoke({ savedRows: [], catalogError: true });
    assertNoSideEffects(run);
    assert.equal(run.db.replayReadCount, 1);
    assert.equal(run.status, 400);
    assert.equal(run.body.ok, false);
    assert.match(run.body.message, /상품 정보를 확인할 수 없어요/);
  }],
  ["saved response uses original bank and actual points when the point request was capped", async () => {
    const run = await invoke({ savedRows: [saved({ point_used_amount: 2000, final_amount: 12000 })] }, payload({
      point_use_amount: 5000,
      orderRows: [line({ payment_bank_account_id: "primary", payment_bank_name: "위조은행", payment_bank_account: "999999999", payment_bank_holder: "위조예금주" })],
    }));
    assertSavedReply(run, { point_used_amount: 2000 });
  }],
  ["saved response keeps charged shipping when the retried screen recomputed zero shipping", async () => {
    const run = await invoke({ savedRows: [saved()] }, payload({ orderRows: [line({ shipping_fee: 0, adjusted_shipping_fee: 0, total_price: 10000, adjusted_total_price: 10000, final_amount: 10000 })] }));
    assertSavedReply(run);
  }],
  ["saved promotion order replays even after the original submission consumed its one-time benefit", async () => {
    const promoLine = line({ ruru_subscribe_waiver_requested: true, shipping_fee: 0, adjusted_shipping_fee: 0, total_price: 10000, adjusted_total_price: 10000, final_amount: 10000 });
    const run = await invoke({ savedRows: [saved({ ...promoLine, point_original_amount: 10000 })], promoConsumed: true,
      settings: { default_shipping_fee: 0, vendor_shipping_fee: 0 } }, payload({ orderRows: [promoLine] }));
    assertSavedReply(run, { point_original_amount: 10000,
      order_summary: { productAmount: 10000, shippingFee: 0, cardExtra: 0, totalAmount: 10000, customerCardRate: 0 } });
  }],
  ["fresh order still cannot reuse an already consumed one-time promotion", async () => {
    const run = await invoke({ promoConsumed: true }, payload({ orderRows: [line({ ruru_subscribe_waiver_requested: true })] }));
    assertNoSideEffects(run);
    assert.equal(run.status, 400);
    assert.equal(run.body.ok, false);
    assert.match(run.body.message, /1회만/);
  }],
  ["saved card surcharge and card rate win over recomputed retry display values", async () => {
    const run = await invoke({ savedRows: [saved({ payment_method: "카드결제", vat_amount: 420, customer_card_extra_rate_applied: 3,
      total_price: 14420, adjusted_total_price: 14420, point_original_amount: 14420, final_amount: 14420 })] }, payload({ orderRows: [line({ payment_method: "카드결제" })] }));
    assertSavedReply(run, { point_original_amount: 14420,
      order_summary: { productAmount: 10000, shippingFee: 4000, cardExtra: 420, totalAmount: 14420, customerCardRate: 3 } });
  }],
  ["replay reads all rows and sorts saved order IDs while summing saved amounts", async () => {
    const run = await invoke({ savedRows: [
      saved({ id: 82, color: "화이트", shipping_fee: 0, adjusted_shipping_fee: 0, total_price: 10000, adjusted_total_price: 10000, point_original_amount: 10000, point_used_amount: 1000, final_amount: 9000 }),
      saved({ id: 71, point_used_amount: 2000, final_amount: 12000 }),
    ] }, payload({ point_use_amount: 5000, orderRows: [line(), line({ color: "화이트", shipping_fee: 0, adjusted_shipping_fee: 0, total_price: 10000, adjusted_total_price: 10000, final_amount: 10000 })] }));
    assertSavedReply(run, { inserted_count: 2, order_ids: [71, 82], point_original_amount: 24000, point_used_amount: 3000,
      order_summary: { productAmount: 20000, shippingFee: 4000, cardExtra: 0, totalAmount: 24000, customerCardRate: 0 } });
  }],
  ["a later saved row belonging to someone else prevents any replay disclosure", async () => {
    const run = await invoke({ savedRows: [saved(), saved({ id: 82, kakao_id: "987654321", color: "화이트" })] }, payload({ orderRows: [line(), line({ color: "화이트" })] }));
    assertNoSideEffects(run);
    assert.equal(run.status, 409);
    assert.equal(run.body.bankAccount, undefined);
    assert.equal(run.body.order_ids, undefined);
  }],
  ["saved order with matching phone but a different Kakao owner is rejected", async () => {
    const run = await invoke({ savedRows: [saved({ kakao_id: "987654321" })] });
    assertNoSideEffects(run);
    assert.equal(run.status, 409);
    assert.equal(run.body.bankAccount, undefined);
  }],
  ["every requested row must use the same group", async () => {
    const run = await invoke({ savedRows: [saved()] }, payload({ orderRows: [line(), line({ order_group_id: "c807f6a0-9a2a-4d5c-8e11-000000000002" })] }));
    assertNoSideEffects(run);
    assert.equal(run.status, 409);
  }],
  ["every requested row must belong to the stated owner", async () => {
    const run = await invoke({ savedRows: [saved(), saved({ id: 82, color: "화이트" })] }, payload({ orderRows: [line(), line({ color: "화이트", kakao_id: "987654321" })] }));
    assertNoSideEffects(run);
    assert.equal(run.status, 409);
  }],
  ["database read failure blocks replay without a fallback submission", async () => {
    const run = await invoke({ savedRows: [saved()], replayReadError: true });
    assertNoSideEffects(run);
    assert.equal(run.status, 503);
    assert.equal(run.body.ok, false);
    assert.equal(run.body.bankAccount, undefined);
  }],
  ["an incomplete database result cannot masquerade as a complete saved order", async () => {
    const run = await invoke({ savedRows: [saved()], savedCountOverride: 2 });
    assertNoSideEffects(run);
    assert.ok(run.status >= 400);
    assert.equal(run.body.bankAccount, undefined);
  }],
  ["conflicting saved bank snapshots reject the entire replay", async () => {
    const run = await invoke({ savedRows: [saved(), saved({ id: 82, color: "화이트", payment_bank_account_id: "primary", payment_bank_account: "555-666-777777" })] }, payload({ orderRows: [line(), line({ color: "화이트" })] }));
    assertNoSideEffects(run);
    assert.equal(run.status, 409);
    assert.equal(run.body.bankAccount, undefined);
  }],
  ["incomplete saved bank snapshot cannot be replaced by current bank settings", async () => {
    const run = await invoke({ savedRows: [saved({ payment_bank_holder: null })] });
    assertNoSideEffects(run);
    assert.equal(run.status, 409);
    assert.equal(run.body.bankAccount, undefined);
  }],
  ["malformed JSON is rejected before any database action", async () => {
    const run = await invoke({}, "{");
    assertNoSideEffects(run);
    assert.equal(run.status, 400);
    assert.equal(run.body.ok, false);
    assert.deepEqual(run.db.reads, []);
  }],
  ["reserved automation identity cannot reach replay without a capability", async () => {
    const automationLine = line({ kakao_id: "990000000077", customer_phone: "0200000077" });
    const run = await invoke({ savedRows: [saved({ ...automationLine })] }, payload({ kakao_id: "990000000077", customer_phone: "0200000077", orderRows: [automationLine] }));
    assertNoSideEffects(run);
    assert.equal(run.status, 403);
    assert.equal(run.body.message, "AUTOMATION_AUTH_REQUIRED");
    assert.deepEqual(run.db.reads, [], "automation authentication must precede replay reads");
  }],
  ["a forged automation capability cannot reach an otherwise matching saved order", async () => {
    const run = await invoke({ savedRows: [saved()] }, payload(), { "x-live-automation": "forged.invalid" });
    assertNoSideEffects(run);
    assert.equal(run.status, 403);
    assert.equal(run.body.message, "AUTOMATION_AUTH_REQUIRED");
    assert.deepEqual(run.db.reads, []);
  }],
  ["RPC duplicate from a concurrent submit rereads saved rows and skips all duplicate postprocessing", async () => {
    const run = await invoke({ holds: [VALID_HOLD], replaySnapshots: [[], [saved()]], submitResult: { ...SAVED_RPC_RESULT, duplicate: true } });
    assertSavedReply(run, {}, 1);
    assert.equal(run.db.replayReadCount, 2);
  }],
  ["RPC duplicate with changed saved contents cannot disclose or mutate the other result", async () => {
    const run = await invoke({ holds: [VALID_HOLD], replaySnapshots: [[], [saved({ color: "화이트" })]], submitResult: { ...SAVED_RPC_RESULT, duplicate: true } });
    assertNoSideEffects(run, 1);
    assert.equal(run.status, 409);
    assert.equal(run.body.bankAccount, undefined);
  }],
  ["RPC duplicate whose saved group vanished is not submitted a second time", async () => {
    const run = await invoke({ holds: [VALID_HOLD], replaySnapshots: [[], []], submitResult: { ...SAVED_RPC_RESULT, duplicate: true } });
    assertNoSideEffects(run, 1);
    assert.equal(run.status, 503);
    assert.equal(run.body.bankAccount, undefined);
  }],
  ["valid fresh order still saves once and runs existing recipient/cart/announcement scheduling", async () => {
    const run = await invoke({ holds: [VALID_HOLD], purchaseLimit: 1, submitResult: SAVED_RPC_RESULT, allowFreshPostprocessing: true },
      payload({ recipient_name: "받는분", recipient_phone: "01087654321" }));
    assert.equal(run.status, 200);
    assert.deepEqual(run.body, { ...SAVED_RPC_RESULT, customerOrderSegment: "first_order", bankAccount: BANK });
    assert.equal(run.db.rpcCalls.length, 1);
    assert.equal(run.db.replayReadCount, 1);
    assert.deepEqual(run.db.mutations.map(({ table, name }) => ({ table, name })), [
      { table: "orders", name: "update" }, { table: "cart_reservations", name: "delete" }, { table: "cart_clear_marks", name: "insert" },
    ]);
    assert.equal(run.after.length, 2, "fresh order must schedule the existing site and YouTube announcements once each");
  }],
];

// Each case catches reusing a saved idempotency key for a genuinely different
// order. Financial display fields intentionally have separate acceptance cases.
for (const [label, change] of [
  ["quantity", { qty: 2, adjusted_product_price: 20000 }],
  ["color", { color: "그레이" }],
  ["size", { size: "L" }],
  ["unit price", { product_price: 20000, adjusted_product_price: 20000 }],
  ["address", { address: "서울시 다른로 22" }],
  ["payment method", { payment_method: "카드결제" }],
  ["product name", { product_name: "다른 세부상품" }],
]) {
  cases.push([`changed ${label} cannot reuse a saved order group`, async () => {
    const run = await invoke({ savedRows: [saved()] }, payload({ orderRows: [line(change)] }));
    assertNoSideEffects(run);
    assert.equal(run.status, 409);
    assert.equal(run.body.ok, false);
    assert.equal(run.body.bankAccount, undefined);
  }]);
}

for (const change of [{ is_deleted: true }, { order_status: "주문취소" }, { order_manage_status: "환불완료" }]) {
  cases.push([`inactive saved order is rejected (${JSON.stringify(change)})`, async () => {
    const run = await invoke({ savedRows: [saved(change)] });
    assertNoSideEffects(run);
    assert.equal(run.status, 409);
    assert.equal(run.body.bankAccount, undefined);
  }]);
}

let failed = 0;
try {
  for (const [name, test] of cases) {
    try {
      await test();
      console.log(`PASS ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${name}\n${error.stack ?? error}`);
    }
  }
} finally {
  globalThis.fetch = originalFetch;
  if (originalBoundary === undefined) delete globalThis[boundarySymbol];
  else globalThis[boundarySymbol] = originalBoundary;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  unregisterOrderSubmitTestLoader();
}
console.log(`RESULT ${cases.length - failed}/${cases.length} actual POST runtime cases passed`);
console.log("LIMIT: Actual route and local helper code executed; Next/Supabase/database boundaries are fixtures. This is not a real database E2E, deployment, browser, or concurrent-transaction test. after callbacks are recorded and never executed.");
if (failed) process.exitCode = 1;
