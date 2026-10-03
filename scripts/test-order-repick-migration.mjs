import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
  create table orders (
    id bigint primary key,
    product_name text,
    color text,
    size text,
    qty integer,
    product_price numeric,
    picked_at timestamptz,
    repick_required_at timestamptz,
    repick_before jsonb,
    repick_resolved_at timestamptz,
    item_change_history jsonb
  );
`);
const sql = await fs.readFile(new URL('../supabase/migrations/20261004010000_order_repick_attention.sql', import.meta.url), 'utf8');
await db.exec(sql);
const functionConfig = (await db.query(`select proconfig from pg_proc where proname = 'orders_manage_repick_attention'`)).rows[0]?.proconfig || [];
assert.ok(functionConfig.some(value => String(value).startsWith('search_path=')), 'trigger function pins search_path');
await db.exec(`insert into orders values (1, '재킷', '검정', 'M', 1, 10000, null)`);

await db.exec(`update orders set size = 'L' where id = 1`);
let row = (await db.query(`select * from orders where id = 1`)).rows[0];
assert.equal(row.repick_required_at, null, 'before-pick edits are ordinary edits');

await db.exec(`update orders set picked_at = '2026-10-04T01:00:00Z' where id = 1`);
await db.exec(`update orders set product_price = 12000 where id = 1`);
row = (await db.query(`select * from orders where id = 1`)).rows[0];
assert.ok(row.picked_at, 'price-only edits keep completion');
assert.equal(row.repick_required_at, null);

await db.exec(`update orders set color = '아이보리' where id = 1`);
row = (await db.query(`select * from orders where id = 1`)).rows[0];
assert.equal(row.picked_at, null, 'post-pick physical edits reopen picking');
assert.ok(row.repick_required_at);
assert.deepEqual(row.repick_before, { product_name: '재킷', color: '검정', size: 'L', qty: 1 });
const firstRequiredAt = String(row.repick_required_at);

await db.exec(`update orders set size = 'XL', qty = 2 where id = 1`);
row = (await db.query(`select * from orders where id = 1`)).rows[0];
assert.equal(String(row.repick_required_at), firstRequiredAt, 'repeated edits preserve the first open exception');
assert.deepEqual(row.repick_before, { product_name: '재킷', color: '검정', size: 'L', qty: 1 });

await db.exec(`update orders set picked_at = '2026-10-04T02:00:00Z' where id = 1`);
row = (await db.query(`select * from orders where id = 1`)).rows[0];
assert.equal(new Date(row.repick_resolved_at).toISOString(), '2026-10-04T02:00:00.000Z');

await db.exec(`update orders set product_name = '새 재킷' where id = 1`);
row = (await db.query(`select * from orders where id = 1`)).rows[0];
assert.equal(row.picked_at, null);
assert.equal(row.repick_resolved_at, null, 'a later post-pick edit opens a new cycle');
assert.deepEqual(row.repick_before, { product_name: '재킷', color: '아이보리', size: 'XL', qty: 2 });

await db.exec(`
  insert into orders (
    id, product_name, color, size, qty, product_price, picked_at, item_change_history
  ) values (
    2, 'BB-58', '없음', 'XL', 1, 195000, '2026-10-02T16:33:44.825Z',
    '[{"changed_at":"2026-10-03T14:35:49.010Z","product_changed":true,"before":{"product_name":"BB-58","color":"없음","size":"XXL","qty":1},"after":{"product_name":"BB-58","color":"없음","size":"XL","qty":1}}]'::jsonb
  );
`);
const backfillSql = await fs.readFile(new URL('../supabase/migrations/20261004033000_backfill_preexisting_repick_attention.sql', import.meta.url), 'utf8');
await db.exec(backfillSql);
const backfilled = (await db.query(`select * from orders where id = 2`)).rows[0];
assert.equal(backfilled.picked_at, null, 'pre-trigger physical edits are reopened from history');
assert.equal(new Date(backfilled.repick_required_at).toISOString(), '2026-10-03T14:35:49.010Z');
assert.deepEqual(backfilled.repick_before, { product_name: 'BB-58', color: '없음', size: 'XXL', qty: 1 });

await db.close();
console.log('repick migration: before-pick, price-only, reopen, preserve, resolve, second cycle, historical backfill passed');
