import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reset,seed,sql,E,W} from './event-custom-gift-db-fixture.mjs';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {calculateEventDurationMs}=createUiLoader()('lib/eventPlayback.ts');
reset(); await seed();
await sql(`delete from event_roulette_winners; update event_roulette_events set overlay_token='survival_test',status='idle' where id='${E}';
alter table event_roulette_events drop constraint event_roulette_events_spin_duration_ms_check;
alter table event_roulette_events add constraint event_roulette_events_spin_duration_ms_check check(spin_duration_ms between 1000 and 10000);`);
const names=Array.from({length:17},(_,i)=>'N'+i),winners=names.slice(0,5);
const duration=calculateEventDurationMs('survival',names,winners,1);
assert.ok(duration>10000);
await assert.rejects(()=>sql(`update event_roulette_events set spin_duration_ms=${duration} where id='${E}'`),/spin_duration_ms_check/);
await assert.rejects(()=>sql(`set role service_role;select admin_finalize_custom_gift_event('${E}','[{"nickname":"A","orderIds":["1"]}]',now(),${duration})`),/spin_duration_ms_check/);
assert.equal(await sql('select count(*) from event_roulette_winners'),'0','failed RPC must roll back winners');
assert.equal(await sql(`select status from event_roulette_events where id='${E}'`),'idle');
const migration=readFileSync('supabase/migrations/20261003000100_event_playback_duration.sql','utf8');
await sql(migration); await sql(migration); // repeatable deployment
let cases=0;
for(const kind of ['survival','race','claw','roulette']){
 for(const n of [1,2,5,15,17,60,100,500,1000]){
  for(const k of new Set([1,Math.max(1,n-1),n])){
   for(const seed of [0,1,2]){
    const ms=calculateEventDurationMs(kind,Array(n).fill('P'),Array(k).fill('W'),seed);
    await sql(`update event_roulette_events set overlay_token='${kind}_test',spin_duration_ms=${ms} where id='${E}'`);cases++;
   }
  }
 }
}
await sql(`update event_roulette_events set overlay_token='survival_test' where id='${E}'`);
const args=`'${E}','[{"nickname":"A","orderIds":["1"]}]',now(),${duration}`;
const result=JSON.parse(await sql(`set role service_role;select admin_finalize_custom_gift_event(${args})`));
assert.equal(result.ok,true);assert.equal(result.event.spin_duration_ms,duration);
await sql(`set role service_role;select admin_finalize_custom_gift_event(${args})`);
assert.equal(await sql('select count(*) from event_roulette_winners'),'1');
for(const token of ['survival_test','race_test','claw_test','roulette_test'])for(const ms of [0,-1])
 await assert.rejects(()=>sql(`update event_roulette_events set overlay_token='${token}',spin_duration_ms=${ms} where id='${E}'`));
await assert.rejects(()=>sql(`update event_roulette_events set overlay_token='roulette_test',spin_duration_ms=11000 where id='${E}'`));
assert.equal(await sql('select count(*) from orders'),'3','no gift registration or financial writes');
const {eventSaveError}=createUiLoader()('lib/eventSaveError.ts');
assert.match(eventSaveError({code:'23514',message:'spin_duration_ms_check'},'fallback'),/진행시간/);
assert.doesNotMatch(eventSaveError({code:'23514',message:'spin_duration_ms_check'},'fallback'),/컬럼/);
assert.equal(eventSaveError({code:'08006',message:'secret'},'fallback'),'fallback');
console.log(`PASS ${cases} actual PostgreSQL schedules; reproduced both failures; RPC rollback, retry, invalid bounds, no order writes, accurate errors`);
