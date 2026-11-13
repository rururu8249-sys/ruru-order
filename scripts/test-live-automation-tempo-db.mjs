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

await db.exec("alter table orders add column created_at timestamptz default now()");
await db.exec(readFileSync(new URL('../supabase/migrations/20261113074405_live_automation_manual_identity.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261113075644_live_automation_variable_tempo.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261113092853_live_automation_start_feedback.sql',import.meta.url),'utf8'));
// Start/restart must be responsive even when ordinary randomized tempo would choose a quiet spell.
const previousCampaign=c;
await db.exec("begin; select setseed(-0.9)");
c=await ctl('all',false,c.revision);
c=await ctl('all',true,c.revision);
let startupDelay=Date.parse(c.next_order_at)-Date.now();
assert.ok(startupDelay>=30000&&startupDelay<=90000,`first order must be within 30–90 seconds, got ${startupDelay}`);
assert.equal(c.tempo_plan.offsets.length,1,'startup creates only one initial form');
await db.exec('rollback');c=previousCampaign;
const seven=await scalar('select live_automation_actor($1,$2,$3,$4,$5,$6)',[bc,'Seven',{seed:1},1,7,false]);
assert.equal(Math.round((Date.parse(seven.session.leave_at)-Date.parse(seven.session.joined_at))/60000),7,'dwell is not restricted to five old values');
const generated=await scalar('select live_automation_plan_tempo($1,$2)',[c.id,false]);
assert.ok(['startup','quiet','steady','burst'].includes(generated.mode));
assert.equal((await scalar('select live_automation_plan_tempo($1,$2)',[c.id,true])).mode,'quiet');
const plan={lines:[{productId:'10',productName:'니트',color:'',size:'',unitPrice:100,qty:1}]};
const submitNext=async(manual=false)=>{
 const action=await scalar('select live_automation_action($1,$2,$3,$4,$5,$6,$7)',[session.id,'order',new Date().toISOString(),plan,manual,null,c.revision]);
 const claim=await scalar('select live_automation_claim($1,$2)',[action.id,c.revision]);
 await scalar('select live_automation_cart($1,$2,$3)',[session.id,c.revision,plan.lines]);
 const rows=[{product_id:10,product_name:'니트',color:'',size:'',qty:1,product_price:100,order_group_id:action.order_group_id}];
 return scalar('select live_automation_submit($1,$2,$3,$4)',[action.id,claim.lease_token,c.revision,rows]);
};
await submitNext();await submitNext();
assert.equal(await scalar('select count(*)::int from orders'),2,'consecutive automatic forms no longer wait five minutes');
await db.query("insert into live_automation_actions(campaign_id,session_id,actor_id,kind,due_at,status,revision,completed_at) select $1,$2,$3,'order',now(),'succeeded',$4,clock_timestamp() from generate_series(1,17)",[c.id,session.id,a.actor.id,c.revision]);
const reserved=await scalar("insert into live_automation_actions(campaign_id,session_id,actor_id,kind,due_at,status,revision,asked_at) values($1,$2,$3,'order',now(),'pending',$4,clock_timestamp()) returning id",[c.id,session.id,a.actor.id,c.revision]);
await assert.rejects(scalar('select live_automation_order_admission($1,$2)',[c.id,null]),/HOURLY_LIMIT/,'a published question reserves the last hourly order slot');
await scalar('select live_automation_order_admission($1,$2)',[c.id,reserved]);
await db.query("update live_automation_actions set status='succeeded',completed_at=now() where id=$1",[reserved]);
await assert.rejects(scalar('select live_automation_order_admission($1,$2)',[c.id,null]),/HOURLY_LIMIT/);
await submitNext(true);
assert.equal(await scalar('select count(*)::int from orders'),3,'explicit manual action stays separate from auto hourly admission');
await db.query("update live_automation_actions set completed_at=clock_timestamp()-interval '61 minutes' where campaign_id=$1",[c.id]);
await scalar('select live_automation_order_admission($1,$2)',[c.id,null]);
await db.close();
console.log('PASS database variable dwell, persisted tempos, immediate multi-order saves and rolling-hour admission with manual exception');
