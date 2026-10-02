import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader(),p=load('lib/eventPlayback.ts'),s=load('lib/eventSurvivalScene.ts');
let combinations=0,scenes=0;
for(let n=0;n<=200;n++){
 const names=Array.from({length:n},(_,i)=>'P'+i);
 for(let w=0;w<=n;w++){
  const duration=p.calculateEventDurationMs('survival',names,names.slice(0,w),42);
  assert(Number.isFinite(duration)&&duration>0);
  if(w===n)assert.equal(duration,1,'all winners require no invented elimination');
  else assert(duration>=4500&&duration<120000);
  combinations++;
 }
 for(const w of new Set([0,1,Math.min(n,2),Math.min(n,5),Math.floor(n/2),n-1,n].filter(v=>v>=0&&v<=n))){
  const winners=names.slice(0,w),duration=p.calculateEventDurationMs('survival',names,winners,42);
  const scene=s.buildSurvivalScene({id:'matrix',kind:'survival',status:'result',startedAt:'2030-01-01',durationMs:duration,participants:names,winners},42);
  assert.equal(scene.durationMs,duration);
  const eliminated=scene.rounds.flatMap(r=>r.victims);
  assert.equal(new Set(eliminated).size,eliminated.length,'no repeated eliminations');
  if(w){assert.equal(eliminated.length,n-w);assert.deepEqual(s.sampleSurvivalScene(scene,duration).winners.map(x=>x.name),winners);}
  else assert.equal(scene.rounds.length,0,'no winner must not fabricate a draw');
  for(let i=1;i<scene.rounds.length;i++)assert(scene.rounds[i].at-scene.rounds[i-1].at>=2100);
  if(scene.rounds.length)assert.equal(duration-scene.rounds.at(-1).at,900);
  scenes++;
 }
}
console.log(`PASS ${combinations} exact roster/winner timing combinations, ${scenes} full scenes, empty/single/multi/all-winner boundaries`);
for(const ids of [[2,17,35],[2,7,11,17,22,27,31,37,43,49]]){
 const names=Array.from({length:50},(_,i)=>'chosen-'+i),winners=ids.map(i=>names[i]);
 const duration=p.calculateEventDurationMs('survival',names,winners,42);
 const scene=s.buildSurvivalScene({id:'designated',kind:'survival',status:'result',startedAt:'2030-01-01',durationMs:duration,participants:names,winners},42);
 assert.deepEqual(scene.winnerIds,ids,'nonconsecutive administrator-selected people remain the winners');
 assert.deepEqual(s.sampleSurvivalScene(scene,duration).winners.map(p=>p.name),winners);
 assert(scene.rounds.every(r=>r.victims.every(id=>!ids.includes(id))));
}
console.log('PASS exact nonconsecutive designated three/ten winners, no accidental elimination');
