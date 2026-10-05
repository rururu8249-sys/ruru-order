import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Catch automatic sold-out derivation overriding explicitly unmanaged products.
const sql = await fs.readFile('supabase/sql/inventory_auto_deduct_rpc.sql', 'utf8');
const functionSql = sql.slice(sql.indexOf('create or replace function public.ruru_sync_product_inventory_variants()'), sql.indexOf('insert into public.product_inventory_variants (\n  product_id,'));
const db = new PGlite();
try {
  await db.exec(`create table products(id bigint primary key, product_note text, stock integer, is_soldout boolean);
    create table product_inventory_variants(product_id bigint, color text, size text, stock integer);
    create function ruru_try_parse_jsonb(value text) returns jsonb language sql as $$ select value::jsonb $$;`);
  await db.exec(functionSql);
  for (const [id, enabled, soldout, expected] of [[1,false,false,false],[2,false,true,true],[3,true,false,true],[4,undefined,false,true]]) {
    const note=JSON.stringify({stock_management_enabled:enabled,stock_variants:[{color:'베이지',size:'M',stock:0}]});
    await db.query('insert into products values($1,$2,0,$3)',[id,note,soldout]);
    const row=(await db.query('select * from products where id=$1',[id])).rows[0];
    assert.equal(row.is_soldout,expected,`product ${id}: OFF preserves explicit state; managed zero derives sold-out`);
    await db.query('update products set product_note=$1 where id=$2',[note,id]);
    assert.equal((await db.query('select is_soldout from products where id=$1',[id])).rows[0].is_soldout,expected);
  }
  await db.query('update products set product_note=$1 where id=3',[JSON.stringify({stock_management_enabled:true,stock_variants:[{size:'M',stock:4}]})]);
  assert.deepEqual((await db.query('select stock,is_soldout from products where id=3')).rows[0],{stock:4,is_soldout:false});
  console.log('PASS unmanaged insert/update preserves explicit sold-out; managed zero/positive and legacy default derive inventory correctly');
} finally { await db.close(); }
