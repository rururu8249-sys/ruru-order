// 가위바위보 시계 «게임 있을 때만» SQL 시뮬(PGlite — pg_cron 은 흉내 표 cron.job)
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs"; import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated;
create schema cron; create table cron.job(jobid serial, jobname text unique, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values(n,s,c) returning jobid::bigint $$;
create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname=n returning true $$;
create table rps_rooms(id serial primary key, status text, deadline timestamptz);
create table rps_players(room_id int, winner boolean, reward_status text);
create function rps_tick() returns void language plpgsql as $$
declare r rps_rooms%rowtype;
begin
 if not pg_try_advisory_xact_lock(84266710) then return;end if;
 select * into r from rps_rooms where status<>'closed' limit 1 for update;
 if r.id is null then return;end if;
 update rps_rooms set deadline=now() where id=r.id;
end $$;
select cron.schedule('ruru-rps-clock','1 second','select public.rps_tick()');`);
await db.exec(fs.readFileSync("supabase/sql/hotfix/rps_clock_on_demand_20261126.sql","utf8"));
const jobs = async () => (await db.query("select count(*)::int n from cron.job where jobname='ruru-rps-clock'")).rows[0].n;
assert.equal(await jobs(), 0, "방 없음 → 바로 시계 꺼짐");
await db.exec("insert into rps_rooms(status) values('lobby')");
assert.equal(await jobs(), 1, "방 생기면 시계 켜짐");
await db.exec("select rps_tick()");
assert.equal(await jobs(), 1, "방 열려 있으면 tick 이 안 끔");
await db.exec("update rps_rooms set status='closed'; insert into rps_players values(1,true,'pending')");
await db.exec("select rps_tick()");
assert.equal(await jobs(), 1, "지급 대기 있으면 안 끔");
await db.exec("update rps_players set reward_status='done'");
await db.exec("select rps_tick()");
assert.equal(await jobs(), 0, "방 닫힘+지급 끝 → tick 이 시계 끔");
await db.exec("insert into rps_rooms(status) values('lobby')");
assert.equal(await jobs(), 1, "다시 게임 만들면 켜짐");
await db.exec(fs.readFileSync("supabase/sql/hotfix/rps_clock_on_demand_20261126.sql","utf8").replace(/do \$\$[\s\S]*?end \$\$;/, ""));
assert.equal(await jobs(), 1, "열린 방 있으면 다시 실행해도 유지");
console.log("✅ rps-clock-on-demand 7가지 통과");
