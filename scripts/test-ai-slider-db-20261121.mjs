import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {chatPhaseConfig,ratePercent} from '../lib/liveAutomationRate.ts';
const db=new PGlite();
const bc='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002',campaign='00000000-0000-4000-8000-000000000003';
await db.exec(`create role anon;create role authenticated;create role service_role;
create table settings(key text primary key,value text);
create table broadcasts(id uuid primary key,status text,paused_at timestamptz,started_at timestamptz);
create table live_automation_campaigns(id uuid primary key,broadcast_id uuid,auto_chat_after timestamptz);
create table live_automation_actors(id uuid primary key,campaign_id uuid,proactive_quiet_until timestamptz);
create table live_automation_actions(id uuid primary key,campaign_id uuid,actor_id uuid,session_id uuid,kind text,status text,result jsonb,order_group_id text);
create table live_chat_messages(id serial primary key,broadcast_id uuid,automation_actor_id uuid,automation_action_id uuid,created_at timestamptz default clock_timestamp(),badge text,hidden_at timestamptz,body text,
automation_cart_action_id uuid,automation_payment_action_id uuid,automation_session_id uuid,automation_manual_request_id uuid,kakao_id text,bot_ref text);
create function live_automation_assert_ai(uuid) returns void language plpgsql as $$begin if not exists(select 1 from live_automation_actors where id=$1) then raise exception 'INVALID_ACTOR';end if;end$$;
create function live_automation_chat_pace() returns text language sql as $$select 'high'::text$$;
create function live_automation_cart_notice_valid(uuid,uuid,uuid,uuid,text,text) returns boolean language sql as $$select false$$;
create function live_automation_payment_notice_valid(uuid,uuid,uuid,uuid,text,text) returns boolean language sql as $$select false$$;
`);
for(const row of JSON.parse(readFileSync(new URL('./fixtures/chat-pacing-production-20261121.json',import.meta.url))))await db.exec(row.definition);
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
await db.query("insert into broadcasts values($1,'ON',null,now()-interval '1 day')",[bc]);
await db.query('insert into live_automation_campaigns values($1,$2,null)',[campaign,bc]);
await db.query('insert into live_automation_actors values($1,$2,null)',[actor,campaign]);
await db.query("insert into settings values('live_automation_chat_rate_pct','80'),('live_automation_chat_pace','high'),('live_viewers_now',$1)",[JSON.stringify({bc,v:10,t:new Date().toISOString()})]);
await db.query("insert into live_automation_actions values($1,$2,$3,null,'chat','succeeded','{}',null)",[actor,campaign,actor]);
await db.query("insert into live_chat_messages(broadcast_id,automation_actor_id,automation_action_id,created_at) select $1,$2,$2,now()-make_interval(mins=>5+n*5) from generate_series(0,5)n",[bc,actor]);
await assert.rejects(scalar('select live_automation_ai_admission($1,\'chat\')',[actor]),/CHAT_QUIET_WINDOW/,'REPRO: production blocks seventh despite five minutes of rest');
await db.exec(readFileSync(new URL('../supabase/migrations/20261121064209_slider_chat_pacing.sql',import.meta.url),'utf8'));
await scalar('select live_automation_ai_admission($1,\'chat\')',[actor]);
const setRate=async value=>db.query("update settings set value=$1 where key='live_automation_chat_rate_pct'",[String(value)]);
const policy=()=>scalar('select live_automation_chat_policy($1)',[bc]);
for(const mode of ['live','paused','replay']) {
 await db.query("update broadcasts set paused_at=case when $1='paused' then now() else null end",[mode]);
 await db.query("update settings set value=$1 where key='live_viewers_now'",[JSON.stringify({bc,v:mode==='replay'?null:10,t:new Date().toISOString()})]);
 for(let rate=0;rate<=100;rate++) {
  await setRate(rate);const actual=await policy(),expected=chatPhaseConfig(rate,mode);
  assert.equal(actual.mode,mode);assert.equal(actual.percent,rate);
  assert.equal(actual.humanQuietMs,expected.humanQuietMs);
  assert.equal(actual.gapMin,expected.gapMin,`${mode}/${rate} minimum parity`);
  assert.equal(actual.gapMax,expected.gapMax,`${mode}/${rate} maximum parity`);
  assert.ok(Math.abs(actual.chance-expected.chance)<1e-12);
 }
}
for(const value of ['bad','-1','101','"48"','',null]) {
 await db.query("update settings set value=$1 where key='live_automation_chat_rate_pct'",[value]);
 assert.equal((await policy()).percent,ratePercent(value,'high'));
}
await setRate(0);await assert.rejects(scalar("select live_automation_ai_admission($1,'reply')",[actor]),/CHAT_RATE_ZERO/);
await setRate(80);
// A previously long persisted rest is bounded by the current slider, not left for 20 minutes.
await db.exec("update live_automation_campaigns set auto_chat_after=now()+interval '20 minutes';update live_automation_actors set proactive_quiet_until=now()+interval '20 minutes'");
await scalar("select live_automation_ai_admission($1,'chat')",[actor]);
await setRate(1);await assert.rejects(scalar("select live_automation_ai_admission($1,'chat')",[actor]),/ROOM_CHAT_REST/);
await setRate(80);
await db.query("insert into live_chat_messages(broadcast_id,body) values($1,'실제 고객 질문')",[bc]);
await assert.rejects(scalar("select live_automation_ai_admission($1,'chat')",[actor]),/HUMAN_CONVERSATION_ACTIVE/);
await scalar("select live_automation_ai_admission($1,'reply')",[actor]);
await db.exec('delete from live_chat_messages where automation_actor_id is null');
await db.exec('update live_automation_campaigns set auto_chat_after=null;update live_automation_actors set proactive_quiet_until=null');
await db.query("insert into live_chat_messages(broadcast_id,automation_actor_id,automation_action_id) values($1,$2,$2)",[bc,actor]);
await assert.rejects(scalar("select live_automation_ai_admission($1,'chat')",[actor]),/CHAT_QUIET_WINDOW/);
// Exercise actual trigger writes, not only the helper result.
await db.exec('delete from live_chat_messages');
await db.exec("create trigger sparse before insert on live_chat_messages for each row execute function live_automation_sparse_chat_guard();create trigger rest after insert on live_chat_messages for each row execute function live_automation_room_chat_rest();update live_automation_actions set status='claimed'");
await db.query("insert into live_chat_messages(broadcast_id,automation_actor_id,automation_action_id) values($1,$2,$2)",[bc,actor]);
const delay=await scalar('select extract(epoch from(auto_chat_after-now())) from live_automation_campaigns');assert.ok(delay>=119&&delay<=122);
const actorDelay=await scalar('select extract(epoch from(proactive_quiet_until-now())) from live_automation_actors');assert.ok(actorDelay>=239&&actorDelay<=242);
assert.equal(await scalar("select has_function_privilege('anon','live_automation_chat_policy(uuid)','EXECUTE')"),false);
await db.close();console.log('PASS production six/hour reproduction; 303 phase/slider parity cases; zero, human, actor, room, triggers and privileges');
