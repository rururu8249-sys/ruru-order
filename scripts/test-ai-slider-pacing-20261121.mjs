import assert from 'node:assert/strict';
import {chatPhaseConfig} from '../lib/liveAutomationRate.ts';
import {assessRoomTurn} from '../lib/liveAutomationTurnPolicy.ts';
const now=Date.now();
for(const mode of ['live','paused','replay']) {
 let previous=Infinity;
 for(let rate=1;rate<=100;rate++) {
  const p=chatPhaseConfig(rate,mode);assert.ok(p.gapMin<=p.gapMax);assert.ok(p.gapMin<=previous);previous=p.gapMin;
 }
 const room=[{id:1,at:now-130000,kind:'ai'}];
 const input={now,mode,currentProductKey:'p1',speakerId:'a',replyToId:0,room};
 assert.equal(assessRoomTurn({...input,chatRate:80}).ok,true,`${mode} high slider is not fixed 150/360s`);
 assert.equal(assessRoomTurn({...input,chatRate:20}).ok,mode==='live');
 assert.equal(assessRoomTurn({...input,chatRate:0}).ok,false);
}
assert.ok(chatPhaseConfig(48,'paused').gapMin>chatPhaseConfig(48,'live').gapMin);
console.log('PASS phase-aware slider scheduling and final admission');

const {run}=await import('./test-ai-product-director-20261120.mjs');
for(const mode of ['live','paused','replay']){
 const visible=[{id:10,body:'mx107 와인 디자인 보고 있어요',automation_actor_id:'other',created_at:new Date(now-130000).toISOString()},
 {id:11,body:'장바구니 알림',badge:'bot',bot_ref:'c:test',automation_actor_id:'notice',created_at:new Date(now-1000).toISOString()}];
 const result=await run({mode,clockNow:now,rate:80,visible,text:'mx107 와인 기장이 궁금하네요'});
 assert.equal(result.sent.length,1,mode+': fresh bot notice must not restart conversation clock');
}
console.log('PASS actual Director scheduler excludes system notices from AI rest');
const {hasNewGroundedInterest}=await import('../lib/liveAutomationTopics.ts');
const product={productId:'1',name:'HR-7 블랙',detailName:'HR-7 블랙',colors:[],sizes:['38','40']};
const prior=[{text:'HR-7 블랙 디자인이 깔끔하네요',at:now-600000},{text:'MC-315 초코 코디 생각 중이에요',at:now-300000}];
assert.equal(hasNewGroundedInterest('HR-7 블랙 기장표를 먼저 봐야겠어요',product,prior,now),true,'same product may add a different verified interest, not ninety-minute silence');
assert.equal(hasNewGroundedInterest('HR-7 블랙 디자인이 예뻐요',product,prior,now),false,'same-product same-interest remains blocked');
