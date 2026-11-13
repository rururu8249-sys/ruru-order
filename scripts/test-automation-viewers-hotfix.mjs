// [2026-11-13] hotfix SQL(automation_viewers_and_suffix_names_20261113.sql)을 실제 마이그레이션이 다 올라간 메모리 DB 에서 그대로 실행해 본다.
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
const src=readFileSync('scripts/test-live-automation-crowd-db.mjs','utf8');
const cut=src.indexOf("console.log('PASS revised 2–30 ordinary range");
if(cut<0)throw Error('기준 테스트 모양이 바뀜');
const extra=String.raw`
const hotfix=readFileSync('supabase/sql/hotfix/automation_viewers_and_suffix_names_20261113.sql','utf8');
await db.query("insert into live_automation_nickname_pool(nickname_key,nickname,category) values('가나다라','가나다라','korean')");
const bad=await scalar('select live_automation_actor($1,$2,$3,$4,$5,$6)',[bc,'가나다라53',{seed:1},0,30,true]);
const ok=await scalar('select live_automation_actor($1,$2,$3,$4,$5,$6)',[bc,'달빛27',{seed:1},0,30,true]);
await db.exec(hotfix);
assert.ok(await scalar('select retired_at is not null from live_automation_actors where id=$1',[bad.actor.id]),'숫자 붙은 닉네임 내보냄');
assert.equal(await scalar('select count(*)::int from live_automation_sessions where actor_id=$1 and stopped_at is null',[bad.actor.id]),0);
assert.ok(await scalar('select retired_at is null from live_automation_actors where id=$1',[ok.actor.id]),'원래 이름이 후보에 없는 닉네임은 그대로');
assert.equal(await scalar('select population_plan is null from live_automation_campaigns where id=$1',[c.id]),true);
for(let i=0;i<40;i++){
 if(i%10===0)await scalar('select live_automation_pool_refill($1)',[Array.from({length:200},(_,n)=>({nickname:'핫픽스'+i+'번'+n,category:'korean'}))]);
 crowd=await step();
}
assert.equal(crowd.target,24,'처음 기준 24명');assert.equal(crowd.count,24);
for(let i=0;i<100;i++){
 if(i%20===0)await scalar('select live_automation_pool_refill($1)',[Array.from({length:200},(_,n)=>({nickname:'평소'+i+'번'+n,category:'korean'}))]);
 await db.query("update live_automation_campaigns set population_plan=jsonb_build_object('phase','spike','until',now()-interval '1 second','nextSpike',now()+interval '1 hour','nextLow',now()+interval '1 hour') where id=$1",[c.id]);
 crowd=await step();assert.ok(crowd.target>=20&&crowd.target<=30,'평소 20~30: '+crowd.target);
}
let lows=0;
for(let i=0;i<200;i++){
 if(i%20===0)await scalar('select live_automation_pool_refill($1)',[Array.from({length:200},(_,n)=>({nickname:'낮음'+i+'번'+n,category:'korean'}))]);
 await db.query("update live_automation_campaigns set population_plan=jsonb_build_object('phase','baseline','until',now()-interval '1 second','nextSpike',now()+interval '1 hour') where id=$1",[c.id]);
 crowd=await step();assert.ok(crowd.target>=17&&crowd.target<=30,'줄어도 17 이상: '+crowd.target);if(crowd.target<20)lows++;
}
assert.ok(lows>0,'가끔 17~19 구간도 나옴');
await db.query("update live_automation_campaigns set population_plan=jsonb_build_object('phase','baseline','until',now()-interval '1 second','nextSpike',now()-interval '1 second') where id=$1",[c.id]);
crowd=await step();assert.ok(crowd.target>=46&&crowd.target<=50,'가끔 46~50');
const until=await scalar("select extract(epoch from (population_plan->>'until')::timestamptz-now()) from live_automation_campaigns where id=$1",[c.id]);
assert.ok(until>=350&&until<=545,'50명 구간 6~9분: '+until);
let peak=0;
for(let i=0;i<12;i++){ // 6분(30초×12)
 if(i%4===0)await scalar('select live_automation_pool_refill($1)',[Array.from({length:200},(_,n)=>({nickname:'피크'+i+'번'+n,category:'korean'}))]);
 crowd=await step();peak=Math.max(peak,crowd.count);
}
assert.ok(peak>=46,'6분 안에 46명 이상까지 올라감: '+peak);
await db.exec(hotfix); // 두 번 실행해도 안전
assert.ok((await scalar("select pg_get_functiondef('public.live_automation_population_step(uuid,bigint,jsonb)'::regprocedure)")).includes('20+floor(random()*11)::int'));
console.log('PASS viewers hotfix: 53 닉네임 내보냄, 평소 20~30·최저 17·피크 46~50(6~9분, 실제 도달 '+peak+'명), 재실행 안전');
await db.close();
`;
const tmp='scripts/_tmp-viewers-hotfix-run.mjs';
writeFileSync(tmp,src.slice(0,cut)+extra);
try{await import('./_tmp-viewers-hotfix-run.mjs');}finally{try{unlinkSync(tmp)}catch{}}
