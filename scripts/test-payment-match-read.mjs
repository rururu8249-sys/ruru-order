import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { readPaymentMatchRows, PAYMENT_MATCH_ORDER_FIELDS, PAYMENT_MATCH_DEPOSIT_FIELDS } from "../lib/admin-v2/paymentMatchRead.ts";
import { filterPaymentMatchEligibleOrders } from "../lib/admin-v2/paymentMatchTestOrderGuard.ts";

const source = fs.readFileSync(new URL("../app/api/admin-v2/auto-payment-match/run/route.ts", import.meta.url), "utf8");
// Guard against later matching changes silently omitting required fields.
for (const [object, fields] of [["order", PAYMENT_MATCH_ORDER_FIELDS], ["deposit", PAYMENT_MATCH_DEPOSIT_FIELDS]]) {
  for (const match of source.matchAll(new RegExp(`\\b${object}\\.([A-Za-z_][A-Za-z_0-9]*)`, "g"))) {
    assert(fields.includes(match[1]), `missing ${object}.${match[1]}`);
  }
}

function database(tables, options = {}) {
  const writes = [], reads = [];
  let failed = false;
  return { writes, reads, from(table) {
    let select = "*", start = 0, end = Infinity, limit = Infinity, excluded, update;
    const query = {
      select(value) { select = value; return this; },
      range(a, b) { start = a; end = b; return this; },
      limit(value) { limit = value; return this; },
      neq(key, value) { excluded = [key, value]; return this; },
      update(value) { update = value; return this; },
      in(key, values) { writes.push({ table, update, key, values }); return this; },
      eq(key, value) { writes.push({ table, update, key, value }); return this; },
      then(resolve, reject) {
        if (update) return Promise.resolve({ error: options.writeError ?? null }).then(resolve, reject);
        reads.push({ table, select, start, limit });
        if (options.readError) return Promise.resolve({ data: null, error: { code: "08006", message: "unavailable" } }).then(resolve, reject);
        if (options.schemaChange && select !== "*" && !failed && start >= 1000) {
          failed = true;
          return Promise.resolve({ data: null, error: { code: "42703", message: "schema changed" } }).then(resolve, reject);
        }
        let rows = tables[table] ?? [];
        if (excluded) rows = rows.filter(row => row[excluded[0]] !== excluded[1]);
        rows = rows.slice(start, Math.min(end + 1, start + limit));
        if (select !== "*") rows = rows.map(row => Object.fromEntries(select.split(",").map(key => [key, row[key]])));
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return query;
  }};
}

async function originalRead(db, table, filter) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    let q = db.from(table).select("*").range(start, start + 999);
    if (filter) q = filter(q);
    const result = await q;
    if (result.error) return { data: null, error: result.error };
    rows.push(...result.data);
    if (result.data.length < 1000) return { data: rows, error: null };
  }
}

function post(db, reader) {
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    exports,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ["2026-10-02T00:00:00Z"])); } },
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test" } },
    require(name) {
      if (name === "next/server") return { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } };
      if (name === "@supabase/supabase-js") return { createClient: () => db };
      if (name.endsWith("paymentMatchTestOrderGuard")) return { filterPaymentMatchEligibleOrders };
      if (name.endsWith("paymentMatchRead")) return { readPaymentMatchRows: reader };
      throw new Error(name);
    },
  });
  return exports.POST;
}

function normalizeRows(rows, fields) {
  return rows.map(row => ({ ...Object.fromEntries(fields.map(key => [key, null])), ...row }));
}
const base = { id: 1, order_group_id: "a", youtube_nickname: "guest", customer_name: "name", final_amount: 10000, total_price: 10000, payment_method: "무통장입금" };
const deposit = { id: 1, depositor_name: "guest", amount: 10000, match_status: "미확인" };
const cases = [
  [[], []], [[base], [deposit]], [[base], []],
  [[base, { ...base, id: 2, order_group_id: "b" }], [deposit]],
  [[base], [deposit, { ...deposit, id: 2 }]],
  [[{ ...base, final_amount: 0, point_used_amount: 10000 }], []],
  [[{ ...base, point_used_amount: 2000 }], [{ ...deposit, amount: 8000 }]],
  ...["취소", "환불", "출고완료", "카드결제완료", "입금확인"].map(status => [[{ ...base, order_manage_status: status }], [deposit]]),
  ...["is_test_order", "exclude_from_payment_match", "deposit_confirmed_at", "is_deleted"].map(key => [[{ ...base, [key]: key === "deposit_confirmed_at" ? "2026-10-02" : true }], [deposit]]),
  [[base], [{ ...deposit, confirmed_at: "2026-10-02" }]],
  [[base], [{ ...deposit, match_order_group_id: "already" }]],
  [[{ ...base, youtube_nickname: "", nickname: "guest", final_amount: null, total_price: null, amount: 10000 }], [deposit]],
  [[{ ...base, payment_method: "카드" }], [deposit]],
];
// Deterministic multi-item / mixed-state datasets, not random live mutations.
for (let seed = 0; seed < 60; seed++) {
  cases.push([Array.from({ length: 18 }, (_, i) => ({ ...base, id: i + 1, order_group_id: `g${Math.floor(i / 2)}`, youtube_nickname: `n${(i + seed) % 7}`, final_amount: ((i + seed) % 4) * 1000, point_used_amount: seed % 3 ? 0 : 1000, order_manage_status: (i + seed) % 5 === 0 ? "취소" : null })), Array.from({ length: 9 }, (_, i) => ({ ...deposit, id: i + 1, depositor_name: `n${i % 7}`, amount: ((i + seed) % 5) * 1000 }))]);
}
for (const [orders, deposits] of cases) {
  const tables = { orders: normalizeRows(orders.map(row => ({ ...row, product_note: "large unused data".repeat(1000) })), PAYMENT_MATCH_ORDER_FIELDS), deposits: normalizeRows(deposits, PAYMENT_MATCH_DEPOSIT_FIELDS) };
  for (const confirm of [false, true]) for (const writeError of [null, { message: "write failed" }]) {
    const before = database(tables, { writeError }), after = database(tables, { writeError });
    const request = { json: async () => confirm ? { confirm: "RUN_AUTO_MATCH" } : {} };
    const legacy = await post(before, originalRead)(request), optimized = await post(after, readPaymentMatchRows)(request);
    assert.equal(JSON.stringify(optimized), JSON.stringify(legacy));
    assert.equal(JSON.stringify(after.writes), JSON.stringify(before.writes));
  }
}
const many = normalizeRows(Array.from({ length: 2001 }, (_, i) => ({ ...base, id: i + 1, product_note: "unused" })), PAYMENT_MATCH_ORDER_FIELDS);
for (const options of [{}, { schemaChange: true }, { readError: true }]) {
  const result = await readPaymentMatchRows(database({ orders: many }, options), "orders", q => q.neq("is_deleted", true));
  if (options.readError) assert.equal(result.data, null);
  else { assert.equal(result.data.length, 2001); assert.equal(new Set(result.data.map(row => row.id)).size, 2001); }
}
// Legacy schemas without optional columns are supported without missing-column errors.
const minimal = await readPaymentMatchRows(database({ orders: [base] }), "orders", null);
assert.deepEqual(minimal.data, [base]);
console.log(`PASS: ${cases.length * 4} legacy/optimized response + write comparisons, pagination, schema fallback, read failures, legacy schemas`);
