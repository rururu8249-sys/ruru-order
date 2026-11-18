import assert from 'node:assert/strict';
import {parseDirectorChoice,shouldTryFocusedProductTurn,cardRemainsInRotation,resolveExplicitReplyTarget} from '../lib/liveAutomationFocus.ts';
import {assessRoomTurn} from '../lib/liveAutomationTurnPolicy.ts';
const allowed=['봄이','달콩'];
assert.equal(parseDirectorChoice(null,allowed).reason,'empty-response');
assert.equal(parseDirectorChoice('{garbled',allowed).reason,'invalid-json');
assert.equal(parseDirectorChoice('{"speaker":"","text":""}',allowed).reason,'model-chose-silence');
assert.equal(parseDirectorChoice('{"speaker":"없는분","text":"와"}',allowed).reason,'unknown-speaker');
assert.deepEqual(parseDirectorChoice('{"speaker":"봄이","replyTo":0,"text":"MC-352 아이보리 색 예쁘네요"}',allowed),{speaker:'봄이',text:'MC-352 아이보리 색 예쁘네요',replyTo:0,reason:'ok'});
const now=Date.parse('2026-11-18T17:30:00+09:00');
const samples=[{id:11,created_at:new Date(now-35_000).toISOString(),badge:null,body:'네'},
 {id:12,created_at:new Date(now-15_000).toISOString(),badge:null,body:'사이즈 문의'},
 {id:13,created_at:new Date(now-10_000).toISOString(),badge:'bot',body:'시스템 안내'}];
assert.equal(resolveExplicitReplyTarget(0,samples,now),null,'no implicit reply to newest human');
assert.equal(resolveExplicitReplyTarget(11,samples,now)?.id,11,'explicit target is available');
assert.equal(resolveExplicitReplyTarget(13,samples,now),null,'never link system bot');
assert.equal(resolveExplicitReplyTarget(99,samples,now),null,'unknown reply id');
assert.equal(resolveExplicitReplyTarget(11,samples,now+160_000),null,'old reply id');
const base={now,mode:'paused',hasProduct:true,hasPendingHuman:false,lastHumanAt:now-1800_000,lastAiAt:0,lastFocusAt:0};
assert.equal(shouldTryFocusedProductTurn(base),true);
assert.equal(shouldTryFocusedProductTurn({...base,hasProduct:false}),false);
assert.equal(shouldTryFocusedProductTurn({...base,hasPendingHuman:true}),false);
assert.equal(shouldTryFocusedProductTurn({...base,lastHumanAt:now-20_000}),false);
assert.equal(shouldTryFocusedProductTurn({...base,lastAiAt:now-90_000}),false);
assert.equal(shouldTryFocusedProductTurn({...base,lastFocusAt:now-3*60_000}),false);
assert.equal(shouldTryFocusedProductTurn({...base,lastFocusAt:now-13*60_000}),true);
const roomBase={now,mode:'paused',currentProductKey:'MC-352:ivory',replyToId:0,speakerId:'spring'};
const ai=(id,minutesAgo,actorId)=>({id,at:now-minutesAgo*60_000,kind:'ai',actorId});
assert.equal(assessRoomTurn({...roomBase,room:[ai(3,2,'B'),ai(2,5,'A')]}).ok,false);
assert.equal(assessRoomTurn({...roomBase,room:[ai(3,20,'B'),ai(2,24,'A')]}).ok,true);
assert.equal(assessRoomTurn({...roomBase,room:[ai(3,0.5,'B')],replyToId:3}).ok,true);
// Fresh carousel validation, even when the next 5-second slide is visible.
const card={productId:'822',detailName:'HR-1 연베이지'};
const rotation={enabled:true,siteCardOff:false,targets:[{productId:'822',detailName:'HR-1 연베이지'},{productId:'822',detailName:'HR-7 블랙'}]};
assert.equal(cardRemainsInRotation(card,rotation),true);
assert.equal(cardRemainsInRotation(card,{...rotation,siteCardOff:true}),false);
assert.equal(cardRemainsInRotation(card,{...rotation,targets:[{productId:'822',detailName:'HR-7 블랙'}]}),false);
assert.equal(cardRemainsInRotation(card,{...rotation,enabled:false}),false);
console.log('PASS V3: model outcome classification, recovery, and rotating widget protection');
