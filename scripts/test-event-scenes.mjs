import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createUiLoader} from './admin-ui-test-loader.mjs';
assert(fs.existsSync('lib/eventSurvivalScene.ts')&&fs.existsSync('lib/eventRaceScene.ts'),'deterministic scenes have not been implemented');
const load=createUiLoader();
for(const kind of ['Survival','Race']){
 const api=load(`lib/event${kind}Scene.ts`),build=api[`build${kind}Scene`],sample=api[`sample${kind}Scene`];
 for(const [participants,winners] of [[['A','B','C'],['B']],[['A'],['A']],[[],[]],[['A','A','B'],['A']],[Array.from({length:200},(_,i)=>'P'+i),['P3','P70','P199']]]){
  const input={id:'fixture',kind:kind.toLowerCase(),status:'result',startedAt:'2030-01-01T00:00:00Z',durationMs:null,participants,winners};
  const a=build(input,42),b=build(input,42);
  assert.deepEqual(sample(a,3000),sample(b,3000));
  for(const fps of [30,60,120]){for(let ms=0;ms<3000;ms+=1000/fps)sample(a,ms);assert.deepEqual(sample(a,3000),sample(b,3000),'frame count never consumes random values');}
  const end=sample(a,a.durationMs+1);assert.equal(end.phase,'done');
  assert.deepEqual(end.winners.map(w=>w.name),winners,'only server winners, in server order');
  assert.equal(new Set((end.players||end.runners).map(p=>p.id)).size,participants.length,'duplicate display names retain index identity');
 }
}
const {sampleClawMotion}=load('lib/eventClawScene.ts');
assert.deepEqual(sampleClawMotion(1000,0,true,10000),sampleClawMotion(1000,0,true,20000),'running claw does not depend on local idle phase');
console.log('PASS seeded scenes, 30/60/120fps independence, 200/one/empty/duplicate names, exact server winners, late completion');
