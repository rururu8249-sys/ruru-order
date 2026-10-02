import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {buildSurvivalScene}=createUiLoader()('lib/eventSurvivalScene.ts');
const names=Array.from({length:50},(_,i)=>'P'+i),counts={lightning:0,wave:0,wind:0,hail:0,meteor:0};
for(let seed=0;seed<1000;seed++){
 const scene=buildSurvivalScene({id:'rate',kind:'survival',status:'result',startedAt:'2030-01-01',durationMs:0,participants:names,winners:['P2','P17','P35']},seed);
 assert.deepEqual(scene.winnerIds,[2,17,35]);
 for(const round of scene.rounds){counts[round.dis.id]++;assert(round.victims.every(id=>!scene.winnerIds.includes(id)));}
}
const total=Object.values(counts).reduce((a,b)=>a+b,0),rate=counts.lightning/total;
assert(rate>.37&&rate<.43,'lightning should appear approximately 40%, not the old equal 20%');
for(const kind of ['wave','wind','hail','meteor'])assert(counts[kind]/total>.12&&counts[kind]/total<.18);
console.log('PASS 1000 seeds, unchanged designated winners; disaster counts',counts,'lightning',rate);
