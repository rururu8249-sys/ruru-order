import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {buildSurvivalScene,sampleSurvivalScene}=createUiLoader()('lib/eventSurvivalScene.ts');
const names=Array.from({length:100},(_,i)=>'P'+i);
const scene=buildSurvivalScene({id:'speed',kind:'survival',status:'result',startedAt:'2030-01-01',durationMs:0,participants:names,winners:['P0']},42);
let maxDistance=0;
for(let t=0;t<scene.durationMs-100;t+=100){
 const a=sampleSurvivalScene(scene,t),b=sampleSurvivalScene(scene,t+100);
 for(let i=0;i<100;i++){
  if(a.players[i].dead||b.players[i].dead)continue;
  const distance=Math.hypot(b.players[i].x-a.players[i].x,b.players[i].y-a.players[i].y);
  maxDistance=Math.max(maxDistance,distance);
 }
}
assert(maxDistance<=2,'living characters must not cross more than 2% of the stage per 100ms; actual '+maxDistance.toFixed(2));
const calm=sampleSurvivalScene(scene,1000),warning=sampleSurvivalScene(scene,scene.rounds[0].at-250);
assert(warning.motionSpeed>calm.motionSpeed,'short escape must still be quicker than ordinary movement');
assert(warning.motionSpeed<=1.3,'escape must remain controllable, not a screen-crossing sprint');
console.log('PASS bounded 100-person travel, calm/escape contrast; max '+maxDistance.toFixed(2)+'% per 100ms');
