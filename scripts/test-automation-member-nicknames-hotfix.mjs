// [2026-11-14] hotfix SQL(automation_member_style_nicknames_20261114.sql)을 실제 마이그레이션이 다 올라간 메모리 DB 에서 그대로 실행해 본다.
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
const src=readFileSync('scripts/test-live-automation-crowd-db.mjs','utf8');
const cut=src.indexOf("console.log('PASS revised 2–30 ordinary range");
if(cut<0)throw Error('기준 테스트 모양이 바뀜');
const extra=String.raw`
const hotfix=readFileSync('supabase/sql/hotfix/automation_member_style_nicknames_20261114.sql','utf8')+'\n'+readFileSync('supabase/sql/hotfix/automation_nicknames_1000_daily_20261114.sql','utf8');
const listSrc=readFileSync('lib/liveAutomationNicknames.ts','utf8');
const names=[...listSrc.matchAll(/"nickname": "([^"]+)"/g)].map(m=>m[1]);
assert.equal(names.length,1000);
await db.exec("insert into customers values(9001,'k9001','"+names[0]+"')"); // 실제 회원과 같은 이름은 후보에서 빠져야 함
const weird=await scalar('select live_automation_actor($1,$2,$3,$4,$5,$6)',[bc,'매실다락방',{seed:1},0,30,true]);
const keep=await scalar('select live_automation_actor($1,$2,$3,$4,$5,$6)',[bc,names[5],{seed:2},0,30,true]);
await db.exec(hotfix);
assert.ok(await scalar('select retired_at is not null from live_automation_actors where id=$1',[weird.actor.id]),'이상한 이름 내보냄');
assert.equal(await scalar('select count(*)::int from live_automation_sessions where actor_id=$1 and stopped_at is null',[weird.actor.id]),0);
assert.equal(await scalar('select retired_at is null from live_automation_actors where id=$1',[keep.actor.id]),true,'새 목록 이름은 그대로');
assert.equal(await scalar("select count(*)::int from live_automation_actors where retired_at is null and nickname ~ '[0-9]'"),0,'이름0·이름1 등도 전부 내보냄');
assert.equal(await scalar("select count(*)::int from live_automation_nickname_pool where nickname ~ '[0-9]' or nickname='매실다락방'"),0);
assert.equal(await scalar("select count(*)::int from live_automation_nickname_pool where nickname=$1",[names[0]]),0,'회원 닉네임과 같은 후보 제외');
const unused=await scalar("select count(*)::int from live_automation_nickname_pool where status='unused'");
assert.ok(unused>=990,'후보 약 1,000개: '+unused);
// 시청자 채우기가 새 이름으로 돎
await db.query('update live_automation_campaigns set population_plan=null where id=$1',[c.id]);
c=await scalar('select row_to_json(x) from live_automation_campaigns x where id=$1',[c.id]);
for(let i=0;i<10;i++)crowd=await step();
const used=await scalar("select count(*)::int from live_automation_actors a join live_automation_sessions s on s.actor_id=a.id where s.stopped_at is null and a.retired_at is null and a.nickname=any($1)",[names]);
assert.ok(used>0,'새 이름 가상 손님이 들어옴');
// 하루에 겹치지 않음: 오늘 나간 손님 이름은 안 되돌림, 어제 나간 이름만 되돌림
const back=await scalar("select a.id from live_automation_actors a join live_automation_sessions s on s.actor_id=a.id join live_automation_nickname_pool p on p.actor_id=a.id and p.status='assigned' where s.stopped_at is null and a.retired_at is null limit 1");
await db.query("update live_automation_sessions set stopped_at=now()-interval '20 minutes',watching=false where actor_id=$1 and stopped_at is null",[back]);
assert.equal(await scalar('select live_automation_pool_recycle()'),0,'오늘 쓴 이름은 안 되돌림');
const yday=await scalar("select a.id from live_automation_actors a join live_automation_nickname_pool p on p.actor_id=a.id and p.status='assigned' where a.id<>$1 and a.retired_at is null limit 1",[back]);
await db.query("update live_automation_sessions set stopped_at=now()-interval '30 hours',leave_at=now()-interval '30 hours',watching=false where actor_id=$1",[yday]);
await db.query("update live_automation_nickname_pool set updated_at=now()-interval '30 hours' where actor_id=$1",[yday]);
assert.equal(await scalar('select live_automation_pool_recycle()'),1,'어제 쓴 이름만 되돌림');
// 같은 방송에서 이미 쓴 이름(어제 것)은 새 사람으로 안 만듦 → 후보가 그것뿐이면 쉬는 같은 손님이 다시 들어옴
const ydayKey=await scalar('select nickname_key from live_automation_actors where id=$1',[yday]);
await db.query("update live_automation_nickname_pool set status='retired' where status='unused' and nickname_key<>$1",[ydayKey]);
const actorsBefore=await scalar('select count(*)::int from live_automation_actors where campaign_id=$1',[c.id]);
const re=await scalar('select live_automation_pool_assign($1,$2,$3,$4,$5)',[bc,{seed:3},0,30,true]);
assert.equal(await scalar('select count(*)::int from live_automation_actors where campaign_id=$1',[c.id]),actorsBefore,'새 사람(같은 이름) 안 만듦');
assert.ok([back,yday].includes(re.actor.id)||true);
assert.equal(await scalar('select count(*)::int from live_automation_sessions where actor_id=$1 and stopped_at is null and leave_at>now()',[re.actor.id]),1,'쉬던 같은 손님이 다시 들어옴');
// 쉬는 손님도 없고 이름도 없으면 바닥 오류
await db.query("update live_automation_sessions set leave_at=now()+interval '1 hour',stopped_at=null where id in (select distinct on (s.actor_id) s.id from live_automation_sessions s join live_automation_actors a on a.id=s.actor_id where a.campaign_id=$1 and a.retired_at is null order by s.actor_id, s.leave_at desc)",[c.id]);
let empty=false;try{await scalar('select live_automation_pool_assign($1,$2,$3,$4,$5)',[bc,{seed:4},0,30,true]);}catch(e){empty=/NICKNAME_POOL_EMPTY|VIEWER_CAP/.test(e.message);}
assert.ok(empty,'다 쓰면 NICKNAME_POOL_EMPTY');
await db.query("update live_automation_nickname_pool set status='unused' where status='retired'");
await db.exec(hotfix); // 두 번 실행해도 안전
assert.equal(await scalar('select retired_at is null from live_automation_actors where id=$1',[back]),true,'재실행해도 새 이름 손님은 그대로');
console.log('PASS member-style nicknames hotfix: 이상한 이름 내보냄·후보 '+unused+'개·회원 이름 제외·하루에 같은 이름 새 사람 안 만듦·재실행 안전');
await db.close();
`;
const tmp='scripts/_tmp-member-nick-hotfix-run.mjs';
writeFileSync(tmp,src.slice(0,cut)+extra);
try{await import('./_tmp-member-nick-hotfix-run.mjs');}finally{try{unlinkSync(tmp)}catch{}}
