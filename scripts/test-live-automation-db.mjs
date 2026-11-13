import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
process.on('uncaughtException',e=>{console.error(e.message,e.where||'');process.exit(1)});
const db=new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table broadcasts(id uuid primary key,status text,is_deleted boolean default false);
  create table customers(id bigint primary key,kakao_id text,youtube_nickname text);
  create table visitor_presence(id bigserial primary key,visitor_key text unique,nickname text,page_type text,path text,last_seen_at timestamptz,created_at timestamptz default now(),updated_at timestamptz,kakao_id text);
  create table live_chat_messages(id bigserial primary key,broadcast_id uuid,kakao_id text,customer_id bigint,nickname text,body text,created_at timestamptz default now(),hidden_at timestamptz,hidden_by text,avatar_url text);
  create table orders(id bigserial primary key,order_group_id text,kakao_id text,customer_id bigint,youtube_nickname text,is_test_order boolean,test_order_reason text,operator_test_phone text,exclude_from_settlement boolean,exclude_from_payment_match boolean,exclude_from_shipping boolean,exclude_from_picking boolean,order_status text,admin_status text,shipping_status text);
  create table products(id bigint primary key,product_name text,price numeric,product_note text,status text,product_status text);
  create table broadcast_products(broadcast_id uuid,product_id bigint);
  create table cart_reservations(id bigserial primary key,session_key text,product_id text,color text,size text,qty int,expires_at timestamptz);
  create table settings(key text primary key,value text);
  create function ruru_option_manual_soldout(jsonb,text,text,text) returns boolean language sql as $$ select coalesce(($1->>'soldout')::boolean,false) $$;
  create function submit_customer_order_with_bank_routing(jsonb,integer,text,text,text,text,text) returns jsonb language plpgsql as $$
  declare r jsonb; g text; begin
    if $2<>0 then raise exception 'points side effect'; end if;
    for r in select value from jsonb_array_elements($1) loop
      g:=r->>'order_group_id';
      insert into orders(order_group_id,kakao_id,youtube_nickname,is_test_order,test_order_reason,operator_test_phone,exclude_from_settlement,exclude_from_payment_match,exclude_from_shipping,exclude_from_picking)
      values(g,$7,$4,(r->>'is_test_order')::boolean,r->>'test_order_reason',r->>'operator_test_phone',(r->>'exclude_from_settlement')::boolean,(r->>'exclude_from_payment_match')::boolean,(r->>'exclude_from_shipping')::boolean,(r->>'exclude_from_picking')::boolean);
    end loop; return jsonb_build_object('ok',true,'order_group_id',g); end $$;
`);
const migration=readFileSync(new URL('../supabase/migrations/20261113071302_live_automation_sessions.sql',import.meta.url),'utf8');
await db.exec(migration);
const exists=await db.query(`select to_regclass('public.live_automation_campaigns') as name`);
assert.ok(exists.rows[0].name,'persistent automation campaigns must exist');
// Only the external scheduling adapter is replaced; SQL locks, writes and all business guards remain real.
await db.exec(`create table test_schedule(enabled boolean); insert into test_schedule values(false);
create or replace function live_automation_schedule(p_enabled boolean) returns void language plpgsql as $$ begin update test_schedule set enabled=p_enabled; end $$;`);
const bc='00000000-0000-4000-8000-000000000001';
await db.query(`insert into broadcasts values($1,'ON',false)`,[bc]);
await db.exec(`insert into customers values(4569,'990000000077','original'); insert into products values(10,'니트',100,'{}','판매중','판매중');`);
await db.query(`insert into broadcast_products values($1,10)`,[bc]);
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const ctl=async(feature,on,rev)=>scalar(`select live_automation_control($1,$2,$3,$4)`,[bc,feature,on,rev]);
let c=await ctl('orders',true,0);
assert.equal(c.orders_enabled,true);
await assert.rejects(ctl('chat',true,0),/STALE/);
c=await ctl('viewers',true,c.revision);
const a=await scalar(`select live_automation_actor($1,$2,$3,$4,$5,$6)`,[bc,'Jenny',{seed:0},3,30,true]);
await assert.rejects(scalar(`select live_automation_actor($1,$2,$3,$4,$5,$6)`,[bc,' jenny ',{seed:1},1,30,true]),/NICKNAME/);
let session=a.session;
assert.equal(await scalar(`select round(extract(epoch from (leave_at-joined_at))/60)::int from live_automation_sessions where id=$1`,[session.id]),30);
await scalar(`select live_automation_presence($1,$2,$3)`,[session.id,c.revision,'/order?liveWatch=1']);
assert.equal(await scalar('select count(*)::int from visitor_presence'),1);
assert.equal(await scalar('select youtube_nickname from customers where id=4569'),'original');
const plan={lines:[{productId:'10',productName:'니트',color:'',size:'',unitPrice:100,qty:1}]};
const add=async(manual=true)=>scalar(`select live_automation_action($1,$2,$3,$4,$5,$6,$7)`,[session.id,'order',new Date().toISOString(),plan,manual,null,c.revision]);
let action=await add();
let claimed=await scalar(`select live_automation_claim($1,$2)`,[action.id,c.revision]);
const rows=[{...plan.lines[0],product_id:10,product_name:'니트',qty:1,product_price:100,order_group_id:action.order_group_id}];
const submit=()=>scalar(`select live_automation_submit($1,$2,$3,$4)`,[action.id,claimed.lease_token,c.revision,rows]);
await scalar(`select live_automation_cart($1,$2,$3)`,[session.id,c.revision,plan.lines]);
await submit(); await submit();
assert.equal(await scalar('select count(*)::int from orders'),1,'same key never creates another form');
assert.equal(await scalar('select order_count from live_automation_actors where id=$1',[a.actor.id]),1);
assert.equal(await scalar('select bool_and(is_test_order and exclude_from_settlement and exclude_from_payment_match and exclude_from_shipping and exclude_from_picking) from orders'),true);
c=await ctl('orders',false,c.revision); c=await ctl('viewers',false,c.revision);
assert.equal(await scalar('select enabled from test_schedule'),false);
assert.equal(await scalar('select count(*)::int from visitor_presence'),0);
await assert.rejects(scalar(`select live_automation_presence($1,$2,$3)`,[session.id,c.revision,'/order?liveWatch=1']),/SESSION_ENDED/);
c=await ctl('orders',true,c.revision);
assert.equal(await scalar('select order_count from live_automation_actors where id=$1',[a.actor.id]),1,'OFF/ON preserves form count');
session=await scalar(`select live_automation_reconnect($1,$2,$3)`,[a.actor.id,30,false]);
action=await add(); claimed=await scalar(`select live_automation_claim($1,$2)`,[action.id,c.revision]);
c=await ctl('orders',false,c.revision);
await assert.rejects(submit(),/STOPPED|STALE/);
assert.equal(await scalar('select count(*)::int from orders'),1);
c=await ctl('orders',true,c.revision);
session=await scalar(`select live_automation_reconnect($1,$2,$3)`,[a.actor.id,30,false]);
for (let i=0;i<2;i++) {
  action=await add(); claimed=await scalar(`select live_automation_claim($1,$2)`,[action.id,c.revision]);
  await scalar(`select live_automation_cart($1,$2,$3)`,[session.id,c.revision,plan.lines]);
  if(i===0) {
    await db.exec(`update products set product_note='{"soldout":true}' where id=10`);
    await assert.rejects(submit(),/PRODUCT_UNAVAILABLE/);
    assert.equal(await scalar('select count(*)::int from orders'),1,'stock race must roll back order and count');
    await db.exec(`update products set product_note='{}' where id=10`);
  }
  await submit();
}
assert.equal(await scalar('select order_count from live_automation_actors where id=$1',[a.actor.id]),3);
await assert.rejects(add(),/ORDER_STOPPED/);
await db.exec('delete from orders');
await assert.rejects(add(),/ORDER_STOPPED/,'deleting order rows must not reset the per-nickname allowance');
await assert.rejects(db.exec(`insert into orders(order_group_id,kakao_id,is_test_order,test_order_reason) values('forged','990000000077',true,'자동 테스트')`),/AUTOMATION_AUTH_REQUIRED/);
await db.exec('set role anon');
await assert.rejects(scalar('select * from live_automation_actors'),/permission denied/);
await assert.rejects(ctl('orders',true,c.revision),/permission denied/);
await db.exec('reset role');
await db.close();
console.log('PASS SQL lifecycle, nickname isolation, idempotency, OFF fencing, preserved counts and private access');
