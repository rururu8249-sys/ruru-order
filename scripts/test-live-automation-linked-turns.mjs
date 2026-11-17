import assert from 'node:assert/strict';
import {canContinueTestConversation as allows} from '../lib/liveAutomationQualityGate.ts';
const now=Date.now();const base={mode:'live',now,actorId:'actor-B',replyToMessageId:42,lastMessage:{id:42,actorId:'actor-A',at:now-30000}};
const cases=[
 ['linked answer 30s',base,true],
 ['linked answer 15s',{...base,lastMessage:{...base.lastMessage,at:now-15000}},true],
 ['linked answer 45s',{...base,lastMessage:{...base.lastMessage,at:now-45000}},true],
 ['linked answer 8s',{...base,lastMessage:{...base.lastMessage,at:now-8000}},true],
 ['linked answer 90s',{...base,lastMessage:{...base.lastMessage,at:now-90000}},true],
 ['too early',{...base,lastMessage:{...base.lastMessage,at:now-7999}},false],
 ['expired',{...base,lastMessage:{...base.lastMessage,at:now-90001}},false],
 ['paused',{...base,mode:'paused'},false],
 ['replay',{...base,mode:'replay'},false],
 ['wrong thread',{...base,replyToMessageId:43},false],
 ['no anchor',{...base,replyToMessageId:0},false],
 ['self reply',{...base,actorId:'actor-A'},false],
 ['real human source',{...base,lastMessage:{...base.lastMessage,actorId:''}},false],
 ['missing message',{...base,lastMessage:null},false],
 ['future message',{...base,lastMessage:{...base.lastMessage,at:now+1000}},false],
 ['stale message time',{...base,lastMessage:{...base.lastMessage,at:NaN}},false],
];
for(const [name,input,want] of cases){assert.equal(allows(input),want,name);console.log('PASS',name)}
console.log(`PASS ${cases.length} linked-turn scenarios`);
