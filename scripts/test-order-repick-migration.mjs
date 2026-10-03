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
    picked_at timestamptz
  );
`);
const sql = await fs.readFile(new URL('../supabase/migrations/20261004010000_order_repick_attention.sql', import.meta.url), 'utf8');
await db.exec(sql);
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

await db.close();
console.log('repick migration: before-pick, price-only, reopen, preserve, resolve, second cycle passed');
