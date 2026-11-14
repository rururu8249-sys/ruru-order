// [2026-11-14] hotfix SQL(automation_member_style_nicknames_20261114.sql)을 실제 마이그레이션이 다 올라간 메모리 DB 에서 그대로 실행해 본다.
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
const src=readFileSync('scripts/test-live-automation-crowd-db.mjs','utf8');
const cut=src.indexOf("console.log('PASS revised 2–30 ordinary range");
if(cut<0)throw Error('기준 테스트 모양이 바뀜');
const extra=String.raw`
const hotfix=readFileSync('supabase/sql/hotfix/automation_member_style_nicknames_20261114.sql','utf8');
const listSrc=readFileSync('lib/liveAutomationNicknames.ts','utf8');
const names=[...listSrc.matchAll(/"nickname": "([^"]+)"/g)].map(m=>m[1]);
assert.equal(names.length,500);
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
assert.ok(unused>=490,'후보 약 500개: '+unused);
// 시청자 채우기가 새 이름으로 돎
await db.query('update live_automation_campaigns set population_plan=null where id=$1',[c.id]);
c=await scalar('select row_to_json(x) from live_automation_campaigns x where id=$1',[c.id]);
for(let i=0;i<10;i++)crowd=await step();
const used=await scalar("select count(*)::int from live_automation_actors a join live_automation_sessions s on s.actor_id=a.id where s.stopped_at is null and a.retired_at is null and a.nickname=any($1)",[names]);
assert.ok(used>0,'새 이름 가상 손님이 들어옴');
// 다시 온 손님: 나간 지 15분 지난 이름을 되돌리면 같은 가상 손님이 다시 들어옴
const back=await scalar("select a.id from live_automation_actors a join live_automation_sessions s on s.actor_id=a.id join live_automation_nickname_pool p on p.actor_id=a.id and p.status='assigned' where s.stopped_at is null and a.retired_at is null limit 1");
await db.query("update live_automation_sessions set stopped_at=now()-interval '20 minutes',watching=false where actor_id=$1 and stopped_at is null",[back]);
assert.ok(await scalar('select live_automation_pool_recycle()')>=1,'나간 손님 이름 되돌림');
await db.query("update live_automation_nickname_pool set status='retired' where status='unused' and nickname_key<>(select nickname_key from live_automation_actors where id=$1)",[back]);
const re=await scalar('select live_automation_pool_assign($1,$2,$3,$4,$5)',[bc,{seed:3},0,30,true]);
assert.equal(re.actor.id,back,'같은 가상 손님이 다시 들어옴(새로 안 만듦)');
assert.equal(await scalar('select count(*)::int from live_automation_sessions where actor_id=$1 and stopped_at is null',[back]),1);
// 후보가 다 쓰이면 바닥 오류(시청자 채우기는 그 차례만 실패)
let empty=false;try{await scalar('select live_automation_pool_assign($1,$2,$3,$4,$5)',[bc,{seed:4},0,30,true]);}catch(e){empty=/NICKNAME_POOL_EMPTY/.test(e.message);}
assert.ok(empty,'다 쓰면 NICKNAME_POOL_EMPTY');
await db.query("update live_automation_nickname_pool set status='unused' where status='retired'");
await db.exec(hotfix); // 두 번 실행해도 안전
assert.equal(await scalar('select retired_at is null from live_automation_actors where id=$1',[back]),true,'재실행해도 새 이름 손님은 그대로');
console.log('PASS member-style nicknames hotfix: 이상한 이름 내보냄·후보 '+unused+'개·회원 이름 제외·다시 온 손님 재사용·재실행 안전');
await db.close();
`;
const tmp='scripts/_tmp-member-nick-hotfix-run.mjs';
writeFileSync(tmp,src.slice(0,cut)+extra);
try{await import('./_tmp-member-nick-hotfix-run.mjs');}finally{try{unlinkSync(tmp)}catch{}}
