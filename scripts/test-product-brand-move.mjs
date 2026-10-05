import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await fs.readFile(new URL('../supabase/sql/product_brand_links.sql', import.meta.url), 'utf8').catch(() => '');
assert.ok(sql.length, 'atomic brand move migration must exist');
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.products (
      id bigint primary key, product_name text not null, price integer not null,
      stock integer not null, product_note text, updated_at timestamptz,
      image_url text, detail_image_urls jsonb, color_options jsonb, size_options jsonb,
      product_description text, status text, product_status text
    );
    insert into public.products values
      (1,'브랜드',129000,0,'{"brand_group":{"enabled":true,"detail_options":{"OLD":{}}}}',null,null,null,null,null,null,null,'판매중'),
      (2,'임시',39000,7,'{"stock_management_enabled":true}',null,'actual.jpg','["back.jpg"]','["베이지"]','["S","M"]','설명',null,'판매중');
  `);
  await db.exec(sql);
  await db.exec(`insert into products(id,product_name,price,stock) values(3,'기존 메모 상품',1000,1); update products set product_note='기존 일반 메모' where id=3`);
  const sourceBefore = (await db.query('select to_jsonb(p) as value from products p where id=2')).rows[0].value;
  const version = async id => (await db.query('select public.product_brand_version($1) as version',[id])).rows[0].version;
  const sourceVersion = await version(2), parentVersion = await version(1);
  const snapshot = (await db.query('select public.product_brand_move_snapshot($1,$2) as value',[2,1])).rows[0].value;
  assert.deepEqual(snapshot.source,sourceBefore);
  assert.equal(snapshot.sourceVersion,sourceVersion);
  assert.equal(snapshot.parentVersion,parentVersion);
  assert.deepEqual(snapshot.history,[]);
  const args = ['move',2,1,'NEW','test-request-1',sourceVersion,parentVersion];
  const move = values => db.query('select public.product_brand_move($1,$2,$3,$4,$5,$6,$7) as result',values);
  await db.exec('set role anon');
  await assert.rejects(()=>db.query('select public.product_brand_move_snapshot(2,1)'),/permission denied/i);
  await assert.rejects(()=>move(args),/permission denied/i);
  await db.exec('reset role; set role authenticated');
  await assert.rejects(()=>move(args),/permission denied/i);
  await db.exec('reset role');
  await assert.rejects(()=>move(['move',2,1,'OLD','duplicate',sourceVersion,parentVersion]),/duplicate/i);
  await assert.rejects(()=>move(['move',2,1,'NEW','stale','stale',parentVersion]),/conflict/i);
  const first = (await move(args)).rows[0].result;
  assert.equal(first.replayed,false);
  assert.equal(first.link.sourceId,'2');
  assert.equal(first.link.parentId,'1');
  const movedSnapshot=(await db.query('select public.product_brand_move_snapshot(2,1) as value')).rows[0].value;
  assert.equal(movedSnapshot.history[0].action,'move');
  assert.equal(movedSnapshot.history[0].detail_name,'NEW');
  assert.equal((await move(args)).rows[0].result.replayed,true);
  assert.equal((await db.query('select count(*)::integer as n from product_brand_move_audit')).rows[0].n,1);
  assert.deepEqual((await db.query('select to_jsonb(p) as value from products p where id=2')).rows[0].value,sourceBefore);
  await assert.rejects(async()=>move(['move',2,1,'OTHER','already',await version(2),await version(1)]),/already/i);
  const undo = (await move(['undo',2,1,null,'undo-1',await version(2),await version(1)])).rows[0].result;
  assert.equal(undo.link,null);
  assert.deepEqual((await db.query('select to_jsonb(p) as value from products p where id=2')).rows[0].value,sourceBefore);
  await assert.rejects(()=>move(['move',999,1,'MISSING','missing','x',parentVersion]),/missing/i);
  await assert.rejects(async()=>move(['move',1,2,'INVALID','brand-source',await version(1),await version(2)]),/invalid brand/i);
  await assert.rejects(()=>move([...args.slice(0,3),'DIFFERENT',...args.slice(4)]),/request reused/i);
  await db.exec(`create function test_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'forced audit failure'; end; $$;
    create trigger force_failure before insert on product_brand_move_audit for each row execute function test_audit_failure();`);
  await assert.rejects(async()=>move(['move',2,1,'NEW','rollback',await version(2),await version(1)]),/forced audit failure/i);
  assert.equal((await db.query('select count(*)::integer as n from product_brand_links')).rows[0].n,0,'failed audit rolls back link too');
  await db.exec('drop trigger force_failure on product_brand_move_audit');
  await move(['move',2,1,'NEW','guard-move',await version(2),await version(1)]);
  await assert.rejects(()=>db.exec(`update products set product_note='{"brand_group":{"enabled":true}}' where id=2`),/linked.*source/i,'linked stock owner cannot become a brand');
  await assert.rejects(()=>db.exec(`delete from products where id=2`),/foreign key/i,'linked stock owner cannot be deleted');
  await assert.rejects(()=>db.exec(`update products set product_note='{"brand_group":{"enabled":true,"detail_options":{"NEW":{}}}}' where id=1`),/linked.*detail/i,'parent editor cannot create shadow copy of linked detail');
  await move(['undo',2,1,null,'guard-undo',await version(2),await version(1)]);
  await db.exec(`update products set product_note='{"brand_group":{"enabled":true,"detail_options":{"BB(버버리)-201 상의":{}}}}' where id=1`);
  await assert.rejects(async()=>move(['move',2,1,'BB-201','code-alias',await version(2),await version(1)]),/duplicate/i,'same code with brand parentheses must collide');
  await db.exec(`update products set product_note='{"brand_group":{"enabled":true,"detail_options":{}}}' where id=1`);
  await move(['move',2,1,'BB-201','reverse-code-alias',await version(2),await version(1)]);
  await assert.rejects(()=>db.exec(`update products set product_note='{"brand_group":{"enabled":true,"detail_options":{"BB(버버리)-201 다른이름":{}}}}' where id=1`),/linked.*detail/i,'parent edits must reject normalized code collisions too');
  const editSnapshot=(await db.query('select public.product_catalog_edit_snapshot(2) as value')).rows[0].value;
  assert.equal(editSnapshot.product.stock,7);
  await db.exec(`update products set stock=5 where id=2`);
  await assert.rejects(()=>db.query('select public.product_catalog_update($1,$2,$3)',[2,editSnapshot.version,{stock:7}]),/conflict/i,'stale editors cannot restore sold inventory');
  await db.query('select public.product_catalog_update($1,$2,$3)',[2,await version(2),{product_description:'새 설명'}]);
  assert.equal((await db.query('select stock,product_description from products where id=2')).rows[0].stock,5);
  console.log('atomic brand move: PASS');
} finally { await db.close(); }
