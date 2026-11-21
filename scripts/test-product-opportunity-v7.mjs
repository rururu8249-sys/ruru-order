import assert from 'node:assert/strict';
import {shouldRecoverProductSilence,buildFocusedProductPrompt} from '../lib/liveAutomationProductOpportunity.ts';
const now=Date.parse('2026-11-18T22:30:00+09:00');
const base={now,mode:'live',hasCard:true,chatRate:80,hasPendingHuman:false,lastHumanAt:0,lastAiAt:0,lastFocusAt:0,candidates:5};
const cases=[
  ['high pace, quiet room, verified card',base,true],
  ['no product', {...base,hasCard:false},false],
  ['zero slider', {...base,chatRate:0},false],
  ['human needs attention', {...base,hasPendingHuman:true},false],
  ['no connected candidates', {...base,candidates:0},false],
  ['human just spoke', {...base,lastHumanAt:now-60_000},false],
  ['AI just spoke', {...base,lastAiAt:now-90_000},false],
  ['already attempted recently', {...base,lastFocusAt:now-90_000},false],
  ['after slider-aware two-minute retry floor, can try again', {...base,lastFocusAt:now-120_000},true],
  ['moderate pace still cooling', {...base,chatRate:50,lastFocusAt:now-110_000},false],
  ['moderate pace after retry floor', {...base,chatRate:50,lastFocusAt:now-120_000},true],
  ['low pace cooling longer', {...base,chatRate:15,lastFocusAt:now-300_000},false],
  ['offline no extra chatter', {...base,mode:'replay'},false]
];
for(const [name,q,expected] of cases){assert.equal(shouldRecoverProductSilence(q),expected,name);console.log('PASS',name)}
const prompt=buildFocusedProductPrompt({productName:'MC-320 블랙',colors:['블랙'],candidates:['달콩','봄이'],recentAi:['MC-319 아이보리 예쁘네요']});
assert.ok(prompt.includes('MC-320 블랙'));
assert.ok(prompt.includes('확인된 색상: 블랙'));
assert.ok(prompt.includes('구체적 사이즈 번호'));
assert.ok(prompt.includes('배송 기간이나 방식'));
assert.ok(prompt.includes('"replyTo":0'));
assert.ok(!prompt.includes('결제 계좌'));
assert.ok(prompt.length<2300);
assert.equal(buildFocusedProductPrompt({productName:'',colors:[],candidates:['달콩'],recentAi:[]}), '');
assert.equal(buildFocusedProductPrompt({productName:'MC-320',colors:[],candidates:[],recentAi:[]}), '');
console.log('PASS V7 opportunity and grounded focused prompt');
