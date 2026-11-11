import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 const fixture=await fs.readFile('scripts/event-custom-gift-schema-fixture.sql','utf8');
 await db.exec(fixture.replace(/create role service_role bypassrls;/,'create role service_role;'));
 await db.exec(`create schema realtime;create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;
 create table customers(id bigint primary key,kakao_id text,youtube_nickname text,customer_name text,customer_phone text,zipcode text,address text,detail_address text,is_blocked text,created_at timestamptz default now());
 alter table event_roulette_events add column if not exists created_by text;
 create table customer_point_balances(customer_phone text primary key,current_points int default 0,total_granted_points int default 0,total_adjusted_points int default 0,youtube_nickname text,customer_name text,admin_memo text,last_granted_at timestamptz);
 create table customer_point_ledger(id uuid primary key,customer_phone text,youtube_nickname text,customer_name text,change_type text,amount int,balance_after int,reason text,admin_memo text,customer_visible boolean,created_by text,source_key text unique);
 `);
 await db.exec(await fs.readFile('supabase/migrations/20261002025838_event_custom_gift_atomic.sql','utf8'));
 await db.exec(await fs.readFile('supabase/migrations/20261002032503_admin_points_atomic.sql','utf8'));
 await db.exec((await fs.readFile('supabase/migrations/20261111151444_live_rps_game.sql','utf8')).split('-- HOSTED CLOCK')[0]);
 await db.exec((await fs.readFile('supabase/migrations/20261111151448_live_rps_rewards_clock.sql','utf8')).split('-- HOSTED CLOCK')[0]);
 const call=async(n,...args)=>(await db.query(`select ${n}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args)).rows[0].v;
 const state=async()=>(await db.query('select payload from rps_public')).rows[0].payload;
 const admin=async(a,d={})=>call('rps_admin',a,JSON.stringify(d),(await state()).revision||0);
 await db.exec("insert into customers(id,kakao_id,youtube_nickname,customer_name,customer_phone,zipcode,address) values(1,'1','A','A','01012345678','12345','TEST ADDRESS');");
 const win=async(kind)=>{await admin('create',{rewardKind:kind,gift:kind==='gift'?'선물':''});let s=await state();await call('rps_join',s.id,'1','01012345678');await db.exec('update rps_rooms set automatic=false');await admin('start',{hand:'rock'});s=await state();await call('rps_pick',s.id,'1',s.round,'paper');await db.exec("update rps_rooms set deadline=clock_timestamp()-interval '1 second'");await call('rps_tick');return s.id;};
 await win('points');let player=(await db.query('select * from rps_players')).rows[0];assert.equal(player.reward_status,'done');
 await call('rps_tick');await admin('retry');
 assert.equal((await db.query('select current_points from customer_point_balances')).rows[0].current_points,1000);
 assert.equal((await db.query('select count(*)::int n from customer_point_ledger')).rows[0].n,1);
 const key=(await db.query('select source_key from customer_point_ledger')).rows[0].source_key;assert.equal(key,'event_winner:'+player.winner_id);
 await admin('close');const room=await win('gift');player=(await db.query('select * from rps_players where room_id=$1',[room])).rows[0];
 assert.equal(player.reward_status,'done');await call('rps_gift',player.id);await admin('retry');
 const orders=(await db.query('select * from orders')).rows;assert.equal(orders.length,1);assert.equal(orders[0].final_amount,0);assert.equal(Number(orders[0].final_shipping_fee),0);assert.equal(orders[0].customer_id,1);assert.equal(orders[0].product_name,'[이벤트선물] 선물');
 await admin('close');await db.exec("update customers set address=''");const missing=await win('gift');player=(await db.query('select * from rps_players where room_id=$1',[missing])).rows[0];assert.equal(player.reward_status,'needs_info');assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,1);
 await db.exec("update customers set address='TEST UPDATED ADDRESS'");await admin('retry');assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,2);
 // Archived winners remain claimable without replacing the current public room.
 await admin('close');await db.exec("update customers set address=''");const archived=await win('gift');await admin('close');
 await admin('create',{rewardKind:'none',test:true});const current=(await state()).id;
 await db.exec("update customers set address='RESTORED'");
 const revision=(await db.query('select revision from rps_rooms where id=$1',[archived])).rows[0].revision;
 await call('rps_admin','retry',JSON.stringify({roomId:archived}),revision);
 assert.equal((await state()).id,current);assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,3);
 await admin('close');await win('points');
 player=(await db.query('select * from rps_players where room_id=$1',[(await state()).id])).rows[0];
 await assert.rejects(call('admin_register_event_custom_gift',player.winner_id));
 // Closing a game with a confirmed partial winner still settles their reward.
 await admin('close');await admin('create',{rewardKind:'points'});const partial=(await state()).id;
 await call('rps_join',partial,'1','01012345678');await db.exec(`update rps_players set winner=true,alive=false where room_id='${partial}'`);
 await admin('close');assert.equal((await db.query('select reward_status from rps_players where room_id=$1',[partial])).rows[0].reward_status,'done');
 console.log('PASS: archived retry preserves active game, legacy gift rejects point winner, partial winner paid on close');
 console.log('PASS: actual points RPC, exactly-once shared winner key, 0-price/0-shipping gift order, missing address and safe retry');
}finally{await db.close();}
