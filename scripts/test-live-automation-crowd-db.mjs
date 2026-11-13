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
for(const file of ['20261113074405_live_automation_manual_identity.sql','20261113075644_live_automation_variable_tempo.sql','20261113080120_live_automation_worker_actions.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));

await db.exec('alter table live_chat_messages add column badge text; alter table live_chat_messages add column bot_ref text unique; alter table orders add column created_at timestamptz default now(); alter table orders add column payment_method text');
await db.exec(readFileSync(new URL('../supabase/migrations/20261113082708_live_automation_conversation_runtime.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261113092853_live_automation_start_feedback.sql',import.meta.url),'utf8'));
await db.exec(`create function live_automation_dispatch() returns void language plpgsql as $$ begin if exists(select 1 from public.live_automation_campaigns where (orders_enabled and next_order_at<=now())) then return; end if; end $$;`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261113094047_live_automation_crowd_rhythm.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261113095014_live_automation_order_dynamics.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261113095647_live_automation_cart_notice.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261113101312_live_automation_interleaved_events.sql',import.meta.url),'utf8'));
assert.equal(await scalar("select to_regclass('public.live_automation_payment_events')"),'live_automation_payment_events','isolated simulated payment events must exist');
let c=await ctl('all',true,0);
assert.equal(c.max_active,100);
const profiles=Array.from({length:12},(_,seed)=>({seed}));
await scalar('select live_automation_pool_refill($1)',[Array.from({length:200},(_,i)=>({nickname:'이름'+i,category:'korean'}))]);
const step=()=>scalar('select live_automation_population_step($1,$2,$3)',[c.id,c.revision,profiles]);
let crowd=await step();assert.ok(crowd.count<=15&&crowd.count>0);
for(let i=0;i<4;i++)crowd=await step();
assert.ok(crowd.count>=42&&crowd.count<=58,'normal target must center on 50');
await scalar('select live_automation_presence_batch($1,$2,$3)',[crowd.anchor,c.revision,'/order#live']);
assert.equal(await scalar('select count(*)::int from visitor_presence'),crowd.count);
// Force the documented peak boundary; the normal clock chooses this only after cooldown.
await db.query("update live_automation_campaigns set population_plan=jsonb_build_object('phase','spike','target',100,'until',clock_timestamp()+interval '3 minutes','nextSpike',clock_timestamp()+interval '1 hour') where id=$1",[c.id]);
for(let i=0;i<5;i++)crowd=await step();
assert.equal(crowd.count,100);
await scalar('select live_automation_presence_batch($1,$2,$3)',[crowd.anchor,c.revision,'/order#live']);
assert.equal(await scalar('select count(*)::int from visitor_presence'),100);
const oldAnchor=crowd.anchor;
await db.query("update live_automation_sessions set last_ack_at=now()-interval '80 seconds' where id=$1",[oldAnchor]);
crowd=await step();
assert.equal(crowd.count,100,'missed heartbeat reconnect preserves population without duplicate counting');
assert.ok(await scalar('select stopped_at from live_automation_sessions where id=$1',[oldAnchor]));
await scalar('select live_automation_presence_batch($1,$2,$3)',[crowd.anchor,c.revision,'/order#live']);
assert.equal(await scalar('select count(*)::int from visitor_presence'),100);
await db.query("update live_automation_campaigns set tempo_plan=jsonb_build_object('mode','steady') where id=$1",[c.id]);
const burst=await scalar('select live_automation_plan_tempo($1,false)',[c.id]);
assert.equal(burst.mode,'burst');assert.ok(burst.offsets.length>=4&&burst.offsets.length<=8);
assert.ok(['quiet','steady'].includes((await scalar('select live_automation_plan_tempo($1,false)',[c.id])).mode),'burst must ease into quiet or ordinary activity');

await assert.rejects(scalar('select live_automation_presence_batch($1,$2,$3)',[crowd.anchor,c.revision-1,'/order#live']),/STALE/);
await db.query("update live_automation_campaigns set population_plan=jsonb_build_object('phase','baseline','target',50,'until',clock_timestamp()+interval '3 minutes','nextSpike',clock_timestamp()+interval '1 hour') where id=$1",[c.id]);
let down=await step();assert.ok(down.count>=92&&down.count<100,'peak falls in bounded steps');
for(let i=0;i<7;i++)crowd=await step();
assert.equal(crowd.count,50);
await scalar('select live_automation_presence_batch($1,$2,$3)',[crowd.anchor,c.revision,'/order#live']);
assert.equal(await scalar('select count(*)::int from visitor_presence'),50);
// Real common-submit wrapper creates flags before the payment event is queued.
const actor=await scalar('select live_automation_actor($1,$2,$3,$4,$5,$6)',[bc,'입금확인용',{seed:1},3,30,false]);
const plan={lines:[{productId:'10',productName:'니트',color:'',size:'',unitPrice:100,qty:1}]};
const action=await scalar('select live_automation_action($1,$2,$3,$4,$5,$6,$7)',[actor.session.id,'order',new Date().toISOString(),plan,false,null,c.revision]);
const claim=await scalar('select live_automation_claim($1,$2)',[action.id,c.revision]);
const cartBody='🛍️ 입*확인용님 장바구니 담음 · 니트 · 100원';
const notice=()=>scalar('select live_automation_announce_cart($1,$2,$3,$4,$5)',[action.id,claim.lease_token,c.revision,cartBody,'c:10|니트']);
await assert.rejects(notice(),/CART|CHAT|ACTIVITY|ACTION/,'no cart, no notice');
await scalar('select live_automation_cart($1,$2,$3)',[actor.session.id,c.revision,plan.lines]);
assert.equal(await scalar('select live_automation_cart_notice_valid($1,$2,$3,$4,$5,$6)',[action.id,actor.actor.id,actor.session.id,bc,cartBody,'c:10|니트']),false);
const cartMessage=await notice();assert.ok(cartMessage);assert.equal(await notice(),cartMessage,'retry cannot duplicate cart notice');
assert.equal(await scalar('select count(*)::int from live_chat_messages where automation_cart_action_id is not null'),1);
await assert.rejects(db.query("insert into live_chat_messages(broadcast_id,kakao_id,nickname,body,badge,bot_ref,automation_actor_id,automation_session_id,automation_cart_action_id) values($1,'bot:ruru','루루동이',$2,'bot',$3,$4,$5,$6)",[bc,cartBody,'c:10|니트',actor.actor.id,actor.session.id,action.id]),/UNAUTHORIZED|AUTH|CHAT|ACTION/);

await scalar('select live_automation_submit($1,$2,$3,$4)',[action.id,claim.lease_token,c.revision,[{product_id:10,product_name:'니트',color:'',size:'',qty:1,product_price:100,order_group_id:action.order_group_id}]]);
assert.equal(await scalar('select count(*)::int from live_automation_payment_events'),1);
await db.query("update live_automation_payment_events set status='pending',due_at=now()-interval '1 second' where order_action_id=$1",[action.id]);
const body='💗 입금확인용님 입금 확인! 감사합니다';
assert.equal(await scalar('select live_automation_payment_notice_valid($1,$2,$3,$4,$5,$6)',[action.id,actor.actor.id,actor.session.id,bc,body,'ap:'+action.id]),false,'missing server authorization must be false, never SQL NULL');
await assert.rejects(db.query("insert into live_chat_messages(broadcast_id,kakao_id,nickname,body,badge,bot_ref,automation_actor_id,automation_session_id,automation_payment_action_id) values($1,'bot:ruru','루루동이',$2,'bot',$3,$4,$5,$6)",[bc,body,'ap:'+action.id,actor.actor.id,actor.session.id,action.id]),/UNAUTHORIZED|AUTH|CHAT|ACTION/);
const before=await scalar('select jsonb_agg(to_jsonb(o)) from orders o');
assert.equal(await scalar('select live_automation_drain_payments($1,$2)',[c.id,c.revision]),1);
assert.equal(await scalar('select live_automation_drain_payments($1,$2)',[c.id,c.revision]),0,'retries cannot duplicate a payment notice');
assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(o)) from orders o'),before,'receipt notification must not alter any order/financial field');
assert.equal(await scalar('select count(*)::int from live_chat_messages where automation_payment_action_id is not null'),1);
for(let i=0;i<2;i++){
 const more=await scalar('select live_automation_action($1,$2,$3,$4,$5,$6,$7)',[actor.session.id,'order',new Date().toISOString(),plan,false,null,c.revision]);
 const token=await scalar('select live_automation_claim($1,$2)',[more.id,c.revision]);
 await scalar('select live_automation_cart($1,$2,$3)',[actor.session.id,c.revision,plan.lines]);
 await scalar('select live_automation_submit($1,$2,$3,$4)',[more.id,token.lease_token,c.revision,[{product_id:10,product_name:'니트',color:'',size:'',qty:1,product_price:100,order_group_id:more.order_group_id}]]);
 await db.query("update live_automation_payment_events set status='pending',due_at=now()-interval '1 second' where order_action_id=$1",[more.id]);
}
assert.equal(await scalar('select live_automation_drain_payments($1,$2)',[c.id,c.revision]),1);
assert.equal(await scalar("select count(*)::int from live_automation_payment_events where status='pending'"),1,'simultaneously due receipts cannot publish as a block');
assert.equal(await scalar('select live_automation_drain_payments($1,$2)',[c.id,c.revision]),1);
await db.query("insert into live_automation_actions(campaign_id,session_id,actor_id,kind,due_at,status,revision,completed_at) select $1,$2,$3,'order',now(),'succeeded',$4,clock_timestamp() from generate_series(1,117)",[c.id,actor.session.id,actor.actor.id,c.revision]);
await assert.rejects(scalar('select live_automation_order_admission($1,$2)',[c.id,null]),/HOURLY_LIMIT/);
assert.equal(await scalar('select count(*)::int from live_automation_payment_events'),3,'actions without saved orders cannot create payment events');
await db.query("update live_automation_payment_events set status='pending',due_at=now() where order_action_id=$1",[action.id]);
await ctl('all',false,c.revision);
await assert.rejects(step(),/STALE|OFF/);
await assert.rejects(notice(),/STALE|ENDED|ACTION|OFF/);
await assert.rejects(scalar('select live_automation_presence_batch($1,$2,$3)',[crowd.anchor,c.revision,'/order#live']),/STALE|ENDED/);
assert.equal(await scalar('select count(*)::int from visitor_presence'),0);
assert.equal(await scalar("select count(*)::int from live_automation_payment_events where status='pending'"),0,'OFF cancels delayed receipts');
assert.equal(await scalar("select has_function_privilege('anon','live_automation_population_step(uuid,bigint,jsonb)','execute')"),false);
await db.exec(readFileSync(new URL('../supabase/migrations/20261113104500_live_automation_repeat_orders.sql',import.meta.url),'utf8'));
assert.ok(await scalar('select next_order_after>clock_timestamp() from live_automation_actors where id=$1',[actor.actor.id]));
await assert.rejects(db.query("insert into live_automation_actions(campaign_id,session_id,actor_id,kind,due_at,revision) values($1,$2,$3,'order',now(),$4)",[c.id,actor.session.id,actor.actor.id,c.revision]),/ACTOR_ORDER_COOLDOWN/);
await db.query('update live_automation_actors set order_target=6,order_count=4 where id=$1',[actor.actor.id]);
const delay=await scalar('select extract(epoch from next_order_after-clock_timestamp())::int from live_automation_actors where id=$1',[actor.actor.id]);
assert.ok(delay>=479&&delay<=3600);
const distribution=await db.query('select public.live_automation_order_target() as n from generate_series(1,5000)');
assert.ok(distribution.rows.filter(r=>r.n===1).length>2900);assert.ok(distribution.rows.some(r=>r.n===6));
await db.exec(readFileSync(new URL('../supabase/migrations/20261113105500_live_automation_history_and_low_crowd.sql',import.meta.url),'utf8'));
c=await ctl('all',true,(await scalar('select revision from live_automation_campaigns where id=$1',[c.id])));
await db.query("update live_automation_campaigns set population_plan=jsonb_build_object('phase','low','target',15,'until',clock_timestamp()+interval '4 minutes','nextSpike',clock_timestamp()+interval '1 hour') where id=$1",[c.id]);
for(let i=0;i<12;i++)crowd=await step();assert.equal(crowd.count,15,'low population phase persists at 10–30 rather than snapping back to 50');
await db.query('delete from orders where automation_actor_id=$1',[actor.actor.id]);
const eligible=await scalar('select live_automation_eligibility($1)',[actor.actor.id]);assert.equal(eligible.manual,true);assert.ok(eligible.orders>0,'submitted snapshot survives deleted order');
await db.exec(readFileSync('supabase/migrations/20261113105455_live_automation_relaxed_order_tempo.sql','utf8'));
const slow=await scalar('select live_automation_plan_tempo($1,true)',[c.id]);
assert.equal(slow.mode,'quiet');assert.ok(Date.parse(slow.at)-Date.now()>=1199000);assert.equal(slow.offsets.length,1);
for(let i=0;i<120;i++){
 const p=await scalar('select live_automation_plan_tempo($1,false)',[c.id]);
 if(p.mode==='steady'){assert.ok(p.offsets.length>=1&&p.offsets.length<=3);assert.ok(Date.parse(p.at)-Date.now()>=479000);}
 if(p.mode==='busy')assert.ok(p.offsets.length>=2&&p.offsets.length<=3);
 if(p.mode==='burst'){assert.ok(p.offsets.length>=3&&p.offsets.length<=5);assert.equal((await scalar('select live_automation_plan_tempo($1,false)',[c.id])).mode,'quiet');}
}
console.log('PASS relaxed ordinary gaps, long quiet periods, bounded bursts and mandatory post-burst rest');
await db.exec(readFileSync('supabase/migrations/20261113110247_live_automation_room_chat_pacing.sql','utf8'));
const speaker=await scalar('select live_automation_actor($1,$2,$3,$4,$5,$6)',[bc,'대화간격하나',{seed:1},1,30,false]);
const other=await scalar('select live_automation_actor($1,$2,$3,$4,$5,$6)',[bc,'대화간격둘',{seed:2},1,30,false]);
for(const s of [speaker,other]){
 const cartAction=await scalar('select live_automation_action($1,$2,$3,$4,$5,$6,$7)',[s.session.id,'order',new Date().toISOString(),plan,false,null,c.revision]);
 await scalar('select live_automation_claim($1,$2)',[cartAction.id,c.revision]);
 await scalar('select live_automation_cart($1,$2,$3)',[s.session.id,c.revision,plan.lines]);
}
await assert.rejects(scalar('select live_automation_ai_admission($1,$2)',[speaker.actor.id,'chat']),/ROOM_CHAT_REST/);
await db.query('update live_automation_campaigns set auto_chat_after=now() where id=$1',[c.id]);
const speech=await scalar('select live_automation_action($1,$2,$3,$4,$5,$6,$7)',[speaker.session.id,'chat',new Date().toISOString(),{},false,null,c.revision]);
const speechClaim=await scalar('select live_automation_claim($1,$2)',[speech.id,c.revision]);
await scalar('select live_automation_chat($1,$2,$3,$4)',[speech.id,speechClaim.lease_token,c.revision,'안녕하세요']);
assert.ok(await scalar("select auto_chat_after>clock_timestamp()+interval '239 seconds' from live_automation_campaigns where id=$1",[c.id]));
await assert.rejects(scalar('select live_automation_ai_admission($1,$2)',[other.actor.id,'chat']),/ROOM_CHAT_REST/,'different nicknames share the same room rest');
await scalar('select live_automation_ai_admission($1,$2)',[other.actor.id,'reply']);
assert.equal(await scalar('select live_automation_payment_speech_valid($1,$2)',[speech.id,'입금완료 했어요']),false,'receipt report without isolated saved event denied');
assert.equal(await scalar("select has_function_privilege('anon','live_automation_payment_speech_valid(uuid,text)','execute')"),false);
await db.exec("update live_automation_actions set completed_at=clock_timestamp()-interval '61 minutes' where kind='order' and status='succeeded'");
const receiptOrder=(await db.query("select * from live_automation_actions where actor_id=$1 and kind='order' order by created_at desc limit 1",[speaker.actor.id])).rows[0];
await scalar('select live_automation_submit($1,$2,$3,$4)',[receiptOrder.id,receiptOrder.lease_token,c.revision,[{product_id:10,product_name:'니트',color:'',size:'',qty:1,product_price:100,order_group_id:receiptOrder.order_group_id}]]);
await db.query("update live_automation_payment_events set status='sent',kind='bank' where order_action_id=$1",[receiptOrder.id]);
await db.query("update live_automation_actions set plan=jsonb_build_object('facts',jsonb_build_object('paymentActionId',$2::text)) where id=$1",[speech.id,receiptOrder.id]);
assert.equal(await scalar('select live_automation_payment_speech_valid($1,$2)',[speech.id,'입금완료 했어요~']),true,'only current confirmed isolated receipt permits acknowledgement');
assert.equal(await scalar('select live_automation_payment_speech_valid($1,$2)',[speech.id,'결제완료 했어요']),false,'bank receipt does not prove card state');
await db.query('delete from orders where automation_action_id=$1',[receiptOrder.id]);
assert.equal(await scalar('select live_automation_payment_speech_valid($1,$2)',[speech.id,'입금완료 했어요']),false,'deleting the order revokes acknowledgement evidence');
console.log('PASS shared room AI rest across different nicknames with direct reply exception');
await db.exec(readFileSync('supabase/migrations/20261113111646_live_automation_smaller_crowd.sql','utf8'));
assert.equal(await scalar('select max_active from live_automation_campaigns where id=$1',[c.id]),50);
for(let i=0;i<30;i++)crowd=await step();assert.equal(crowd.target,16);assert.equal(crowd.count,16);
for(let i=0;i<100;i++){
 if(i%20===0)await scalar('select live_automation_pool_refill($1)',[Array.from({length:200},(_,n)=>({nickname:'새범위'+i+'번'+n,category:'korean'}))]);
 await db.query("update live_automation_campaigns set population_plan=jsonb_build_object('phase','spike','until',now()-interval '1 second','nextSpike',now()+interval '1 hour') where id=$1",[c.id]);
 crowd=await step();assert.ok(crowd.target>=2&&crowd.target<=30,'ordinary range 2–30');
}
await db.query("update live_automation_campaigns set population_plan=jsonb_build_object('phase','baseline','until',now()-interval '1 second','nextSpike',now()-interval '1 second') where id=$1",[c.id]);
crowd=await step();assert.ok(crowd.target>=42&&crowd.target<=50,'rare peak around 50');
await db.query("update live_automation_campaigns set population_plan=jsonb_build_object('phase','spike','target',100,'until',now()+interval '3 minutes') where id=$1",[c.id]);
crowd=await step();assert.equal(crowd.target,50,'old target cannot exceed revised ceiling');
console.log('PASS revised 2–30 ordinary range, 42–50 peak, gradual steps and old-plan ceiling');
await db.exec(readFileSync('supabase/migrations/20261113121100_live_automation_measured_journey_timing.sql','utf8'));
for(const [kind,n,mean] of [['cart',27,7.2197],['bank',48,69.2087],['card',21,66.4256]]){
 const measured=await scalar('select avg(live_automation_timing_seconds($1,(i+0.5)/$2::float))/60 from generate_series(0,$2-1) i',[kind,n]);
 assert.ok(Math.abs(measured-mean)<.001,'SQL must preserve measured mean including long tails');
}
assert.equal(await scalar("select has_function_privilege('anon','live_automation_timing_seconds(text,double precision)','execute')"),false);
await db.exec(`create or replace function public.live_automation_timing_seconds(p_kind text,p_draw double precision default random()) returns double precision language sql as $$ select case $1 when 'cart' then 3864.834 when 'card' then 1800 else 600 end::double precision $$;`);
const timedActor=await scalar('select live_automation_actor($1,$2,$3,$4,$5,$6)',[bc,'실측대기',{seed:2},1,5,false]);
const timedAction=await scalar('select live_automation_action($1,$2,$3,$4,$5,$6,$7)',[timedActor.session.id,'order',new Date().toISOString(),plan,false,null,c.revision]);
const timedClaim=await scalar('select live_automation_claim($1,$2)',[timedAction.id,c.revision]);
await scalar('select live_automation_cart($1,$2,$3)',[timedActor.session.id,c.revision,plan.lines]);
const staged=await scalar('select live_automation_stage_order($1,$2,$3,$4)',[timedAction.id,timedClaim.lease_token,c.revision,new Date(Date.now()+20000).toISOString()]);
assert.equal(staged.plan.cartDelaySeconds,3864.834,'server replaces old 20-second request with measured delay');
const timingActivity=await scalar('select live_automation_admin_activity()');
const timingHold=timingActivity.holds.find(h=>h.session_key===timedActor.session.cart_key);
assert.ok(timingHold && Date.parse(timingHold.created_at)<=Date.now()+1000,'extended cart does not appear created in the future');
assert.ok(Date.parse(staged.due_at)>Date.now()+60*60000,'long cart delay survives');
assert.ok(await scalar('select s.leave_at>a.due_at and h.expires_at>a.due_at from live_automation_sessions s join live_automation_actions a on a.session_id=s.id join live_automation_cart_holds h on h.session_id=s.id where a.id=$1',[timedAction.id]),'session and cart must not expire during measured wait');
await assert.rejects(scalar('select live_automation_stage_order($1,$2,$3,$4)',[timedAction.id,timedClaim.lease_token,c.revision,new Date().toISOString()]),/ACTION|CLAIM|LEASE/,'old retry cannot redraw a delay');
await db.query('update live_automation_actions set due_at=now() where id=$1',[timedAction.id]);
const submitClaim=await scalar('select live_automation_claim($1,$2)',[timedAction.id,c.revision]);
await scalar('select live_automation_submit($1,$2,$3,$4)',[timedAction.id,submitClaim.lease_token,c.revision,[{product_id:10,product_name:'니트',color:'',size:'',qty:1,product_price:100,payment_method:'무통장입금',order_group_id:timedAction.order_group_id}]]);
const waitSecs=await scalar('select extract(epoch from due_at-created_at) from live_automation_payment_events where order_action_id=$1',[timedAction.id]);
assert.ok(Math.abs(waitSecs-600)<2,'saved order queues empirically sampled payment delay');
await ctl('all',false,c.revision);
assert.equal(await scalar("select count(*)::int from live_automation_payment_events where status='pending'"),0,'OFF still cancels long delayed receipts');
console.log('PASS measured long cart wait survives TTL, retry cannot redraw, payment timing and OFF cancellation');
await db.close();console.log('PASS 50-person baseline, gradual 100-person peak/return, real batched presence, OFF and old revision fences');
