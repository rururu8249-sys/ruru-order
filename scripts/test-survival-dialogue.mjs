import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const s=createUiLoader()('lib/eventSurvivalScene.ts');
assert.equal(typeof s.survivalDialogue,'function','scene must provide replay-stable, situation-specific speech');
const names=Array.from({length:100},(_,i)=>'P'+i);
const types=new Set();
for(const seed of [0,1,2,3,42]){
const scene=s.buildSurvivalScene({id:'speech',kind:'survival',status:'result',startedAt:'2030-01-01',durationMs:0,participants:names,winners:['P0']},seed);
for(const round of scene.rounds){
 for(const t of [round.at-300,round.at+120]){
  const frame=s.sampleSurvivalScene(scene,t),speech=s.survivalDialogue(frame,t);
  assert(speech.length<=2,'speech cannot flood the screen');
  assert.deepEqual(speech,s.survivalDialogue(frame,t),'reconnecting viewers must see the same dialogue');
  assert(new Set(speech.map(d=>d.actorId)).size===speech.length);
  assert(speech.every(d=>d.text.length<=12&&!d.text.includes('P0')),'short speech cannot announce a future winner');
  if(t<round.at)assert(speech.every(d=>!frame.players[d.actorId].dead),'warning speakers must be alive');
  else {assert(speech.length>0);assert(speech.every(d=>round.victims.includes(d.actorId)));types.add(round.dis.id);}
 }
 assert.deepEqual(s.survivalDialogue(s.sampleSurvivalScene(scene,round.at+350),round.at+350),[],'speech must disappear before the flying/fading part of elimination');
}
assert.deepEqual(s.survivalDialogue(s.sampleSurvivalScene(scene,scene.durationMs),scene.durationMs),[]);
}
assert.equal(types.size,5);
console.log('PASS five situation-specific reactions, max two speakers, stable replay, no premature winner');
