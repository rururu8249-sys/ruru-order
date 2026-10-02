import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {sampleSurvivalScene,buildSurvivalScene}=createUiLoader()('lib/eventSurvivalScene.ts');
// Hand-timed fixture: catches movement which ignores actual warning/impact times.
const scene={durationMs:7700,winnerIds:[3],players:['A','B','C','D'].map((name,id)=>({id,name,x:25+id*16,y:54,dead:false,hit:false,dtype:null})),rounds:[
 {at:2800,victims:[0],dis:{id:'wave',label:'wave',accent:'blue',emoji:'wave'},streaks:[]},
 {at:4400,victims:[1],dis:{id:'hail',label:'hail',accent:'white',emoji:'hail'},streaks:[]},
 {at:6800,victims:[2],dis:{id:'lightning',label:'bolt',accent:'gold',emoji:'bolt'},streaks:[]},
]};
const at=t=>sampleSurvivalScene(scene,t);
for(const type of ['wave','wind']){
 const carried={...scene,rounds:[{...scene.rounds[0],dis:{...scene.rounds[0].dis,id:type}}]};
 assert.equal(sampleSurvivalScene(carried,3550).bursts.length,1,`${type}: keep victim visible until the 780ms carry-away finishes`);
 assert.equal(sampleSurvivalScene(carried,3650).bursts.length,0,`${type}: remove finished reaction without dragging the round`);
}
assert(at(1800).players.some(p=>p.pose==='run'),'opening must move, not remain static');
assert(at(2000).players.every(p=>p.pose==='look'),'brief startle when the warning appears');
assert(at(2450).players.every(p=>p.pose==='run'),'warning must become an escape, not another idle pause');
assert(at(2450).motionSpeed>2*at(1800).motionSpeed,'escape must accelerate relative to normal roaming');
for(const [start,end,speed] of [[1600,1700,.55],[2400,2500,1.2]]){
 for(const actor of at(start).players){
  const next=at(end).players[actor.id];
  assert(Math.abs(next.strideElapsedMs-actor.strideElapsedMs-(end-start)*speed)<.001,'limb cycle must follow the same accelerated clock as movement');
 }
}
assert.equal(at(1700).players[1].strideElapsedMs-at(1700).players[0].strideElapsedMs,170,'actors use their movement phase, not synchronized marching');
assert(at(2850).players.filter(p=>!p.dead).every(p=>p.pose==='duck'),'survivors react to the impact too');
assert.equal(at(2850).players[0].x,at(2800).players[0].x,'struck actor must remain at the impact location');
assert(at(3200).players.filter(p=>!p.dead).every(p=>p.pose==='look'),'short recovery follows the impact');
assert(at(4000).players.filter(p=>!p.dead).every(p=>p.pose==='run'),'second hazard triggers escape too');
assert(at(5900).players.filter(p=>!p.dead).every(p=>p.pose==='look'),'final hazard has the same brief anticipation');
assert(at(6350).players.filter(p=>!p.dead).every(p=>p.pose==='run'),'finalists both react, without predicting winner');
for(const t of [2350,4075,6350]){
 assert.equal(at(t).warning?.progress,.5,'progress must use the current round warning, not a free-running clock');
 assert.equal(at(t).winners.length,0);
 assert.equal(at(t).message.dead.length,0,'warnings cannot announce future victims');
}
for(let t=0;t<scene.durationMs;t+=16){
 const frame=at(t),next=at(t+1);
 for(const actor of frame.players.filter(p=>!p.dead)){
  const after=next.players[actor.id];
  assert(Math.abs(actor.x-after.x)<.5&&Math.abs(actor.y-after.y)<.5,'no position snap when tempo changes');
 }
}
assert.deepEqual(at(7700).winners.map(p=>p.name),['D']);
assert(at(7700).players.every(p=>p.pose==='rest'),'result must stop the race');
assert.deepEqual(at(7700).players,at(9700).players,'no wandering after the result');
// Verify impact alignment and every warning across complete, real generated flows.
for(const n of [2,3,8,30,100,200])for(const seed of [1,42,912]){
 const flow=buildSurvivalScene({participants:Array.from({length:n},(_,i)=>'P'+i),winners:['P0'],durationMs:null},seed);
 assert(flow.rounds[0].at<=4500,'opening may not consume six seconds without a disaster');
 for(const round of flow.rounds){
  const before=sampleSurvivalScene(flow,round.at-300);
  assert(before.warning,'every disaster must be foreshadowed');
  for(let t=round.at-900;t<round.at;t+=50){
   const frame=sampleSurvivalScene(flow,t);
   if(frame.warning)assert.equal(frame.fx,null,'do not start the next anticipation over an unfinished impact');
  }
  const hit=sampleSurvivalScene(flow,round.at+100);
  for(const streak of round.streaks){
   const end=streak.pts.split(' ').at(-1).split(',').map(Number),actor=hit.players[streak.id];
   assert(Math.abs(end[0]-actor.x)<.001&&Math.abs(end[1]-actor.y)<.001,'bolt must land on the actor, despite tempo changes');
  }
 }
 assert(flow.durationMs-flow.rounds.at(-1).at<=1000);
 assert.deepEqual(sampleSurvivalScene(flow,flow.durationMs).winners.map(p=>p.name),['P0']);
}
console.log('PASS entire flow: anticipation/escape/impact/recovery, continuous motion, every warning, bolt alignment, stopped result, unchanged winners');
