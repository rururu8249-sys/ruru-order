import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Executes the captured production bodies, not an imitation of checkout.
// Removing the independent availability guard must allow the first rejected hold.
const before = await fs.readFile('scripts/fixtures/option-sale-rpcs-before.sql','utf8');
const patch = await fs.readFile('supabase/sql/option_manual_soldout.sql','utf8').catch(e => { if(e.code==='ENOENT') return ''; throw e; });
const db = new PGlite();
try {
  const columns = before.match(/INSERT INTO public.orders \(([\s\S]*?)\)\s+SELECT/)[1].split(',').map(x=>x.trim());
  const integers = new Set('qty product_price shipping_fee total_price adjusted_product_price adjusted_shipping_fee adjusted_total_price vat_amount customer_card_extra_rate_applied actual_card_fee_rate_applied point_original_amount point_used_amount point_balance_before point_balance_after final_amount'.split(' '));
  const booleans = new Set('is_test_order exclude_from_settlement exclude_from_payment_match exclude_from_shipping exclude_from_picking'.split(' '));
  await db.exec(`create table products(id bigint primary key, product_name text, product_note text);
    create table orders(id bigserial primary key, ${columns.map(c=>`${c} ${integers.has(c)?'integer':booleans.has(c)?'boolean':c==='product_id'?'bigint':c==='broadcast_id'?'uuid':c==='point_used_at'?'timestamptz':'text'}`).join(',')}, inventory_deducted_at timestamptz, inventory_deduction_status text, inventory_deduction_memo text, point_ledger_id uuid);
    create table customer_point_balances(customer_phone text primary key,current_points integer);
    create table cart_reservations(session_key text,customer_phone text,nickname text,customer_name text,product_id text,product_name text,detail_name text,unit_price integer,color text,size text,qty integer,created_at timestamptz,expires_at timestamptz,last_synced_at timestamptz);`);
  await db.exec(before);
  await db.exec('alter table products add column stock integer, add column is_soldout boolean; create table product_inventory_variants(product_id bigint,color text,size text,stock integer); create function ruru_try_parse_jsonb(value text) returns jsonb language sql as $$ select value::jsonb $$;');
  await db.exec(await fs.readFile('scripts/fixtures/option-sale-sync-before.sql','utf8'));
  if(patch) await db.exec(patch);
  const setNote=async(note)=>db.query('insert into products(id,product_name,product_note) values(1,$1,$2) on conflict(id) do update set product_note=excluded.product_note',['상품',JSON.stringify(note)]);
  const note=(enabled,soldout,color='베이지',size='M')=>({stock_management_enabled:enabled,stock_variants:[{color,size,stock:5,manual_soldout:soldout}]});
  const hold=async(color='베이지',size='M',name='상품')=>(await db.query("select claim_cart_hold('fixture-session',null,null,null,$1::jsonb,15) as result",[JSON.stringify([{productId:'1',productName:name,color,size,qty:1}])])).rows[0].result;
  let seq=0;
  const submit=async(color='베이지',size='M',name='상품',group=`fixture-${++seq}`)=>(await db.query('select submit_customer_order_with_points($1::jsonb,0,$2,null,null,$3) as result',[JSON.stringify([{order_group_id:group,product_id:1,product_name:name,color,size,qty:1,final_amount:10000}]),'01000000000','fixture-session'])).rows[0].result;
  for(const enabled of [false,true]) {
    await setNote(note(enabled,true));
    const result=await hold();
    assert.equal(result.allOk,false,'manual soldout must reject reservation even inventory OFF');
    assert.equal(result.results[0].soldout,true);
    assert.equal((await db.query('select count(*)::integer n from cart_reservations')).rows[0].n,0);
    await assert.rejects(submit(),/품절/);
    assert.equal((await db.query('select count(*)::integer n from orders')).rows[0].n,0,'rejection rolls inserted orders back');
  }
  for(const flag of [false,undefined,'false']) {
    await setNote(note(false,flag));
    assert.equal((await hold()).allOk,true);
    assert.equal((await submit()).ok,true);
  }
  await setNote(note(false,false));
  await hold();
  await setNote(note(false,true));
  await assert.rejects(submit(),/품절/,'previous hold cannot bypass newly soldout option');
  await setNote(note(false,true,'','M'));
  assert.equal((await hold('없음')).allOk,false);
  await assert.rejects(submit('없음'),/품절/);
  const brand={...note(false,true,'BB-60 / 베이지','M'),brand_group:{detail_options:{'BB-60':{}}}};
  await setNote(brand);
  assert.equal((await hold('BB-60 / 베이지','M','BB-60')).allOk,false);
  assert.equal((await hold('베이지','M','BB-60')).allOk,false);
  await assert.rejects(submit('베이지','M','BB-60'),/품절/);
  assert.equal((await hold('베이지','L','BB-60')).allOk,true,'different size is not blocked');
  await setNote(note(true,false));
  const success=await submit('베이지','M','상품','same-group');
  assert.equal(success.ok,true);
  assert.equal(JSON.parse((await db.query('select product_note from products')).rows[0].product_note).stock_variants[0].stock,4);
  await setNote(note(true,true));
  assert.equal((await submit('베이지','M','상품','same-group')).duplicate,true,'completed idempotent retry still returns existing order');
  await db.exec("insert into product_inventory_variants values(1,'베이지','M',6)");
  await db.exec('select ruru_sync_product_stock_note_from_variants(1)');
  const restored=JSON.parse((await db.query('select product_note from products')).rows[0].product_note);
  assert.equal(restored.stock_variants[0].manual_soldout,true,'restocking after cancellation must preserve manual soldout');
  assert.equal(restored.stock_variants[0].stock,6);
  // The live product inventory trigger was read and verified against this definition.
  const inventorySql=await fs.readFile('supabase/sql/inventory_auto_deduct_rpc.sql','utf8');
  await db.exec(inventorySql.slice(inventorySql.indexOf('create or replace function public.ruru_sync_product_inventory_variants()'),inventorySql.indexOf('insert into public.product_inventory_variants (\n  product_id,')));
  await setNote(note(false,true));
  assert.equal(JSON.parse((await db.query('select product_note from products')).rows[0].product_note).stock_variants[0].manual_soldout,true,'product inventory trigger must not strip manual state');
  if(patch) {
    const fn=(await db.query("select pg_get_functiondef('public.claim_cart_hold(text,text,text,text,jsonb,integer)'::regprocedure) def")).rows[0].def;
    assert.match(fn,/v_item_expires := v_first \+ make_interval/,'absolute expiry retained');
    await assert.rejects(db.exec(patch),/source changed/,'refuse applying patch over an unexpected function body');
  }
  console.log('PASS independent option soldout: unmanaged/managed hold and checkout, rollback, stale cart, false/default, none, legacy brand, stock decrement, idempotency and source drift guard');
} finally { await db.close(); }
