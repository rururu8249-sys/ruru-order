import assert from 'node:assert/strict';
import {canContinueOwnTestTurn,planColorTestThread,judgeTestChat} from '../lib/liveAutomationQualityGate.ts';
const now=Date.now(), colors=['블랙','베이지'],productKey='p01:패딩';
const base={mode:'live',stage:2,sourceText:'블랙 예쁘네요',colors,productKey};
const good=planColorTestThread(base);
assert.deepEqual(good,{text:'근데 베이지도 고민되네요',firstColor:'블랙',secondColor:'베이지'});
for(const [name,change] of [
 ['not live',{mode:'replay'}],['paused',{mode:'paused'}],['no options',{colors:['블랙']}],
 ['unknown color',{sourceText:'핑크 예쁘네요'}],['no product',{productKey:''}],
 ['question not a thought',{sourceText:'블랙 사이즈 있나요?'}],
 ['already two colors',{sourceText:'블랙 베이지 둘다 이쁘네요'}],
 ['unrelated',{sourceText:'유튜브 보고 왔어요'}],
]){assert.equal(planColorTestThread({...base,...change}),null,name);console.log('PASS',name)}
const next={...base,stage:3,sourceText:good.text,sourceProductKey:productKey,firstColor:good.firstColor,secondColor:good.secondColor};
assert.deepEqual(planColorTestThread(next),{text:'저는 블랙 쪽이요',firstColor:'블랙',secondColor:'베이지'});
for(const [name,change] of [
 ['changed card',{productKey:'p02:패딩'}],['missing second',{secondColor:''}],
 ['unknown alternate',{colors:['블랙','초코']}],['wrong anchor text',{sourceText:'딴 얘기'}],
 ['same colors',{firstColor:'블랙',secondColor:'블랙'}],
]){assert.equal(planColorTestThread({...next,...change}),null,name);console.log('PASS',name)}
const source={id:77,actorId:'A',at:now-20000};
const own={mode:'live',now,actorId:'A',replyToMessageId:77,stage:2,lastMessage:source};
assert.equal(canContinueOwnTestTurn(own),true);
for(const [name,change] of [
 ['wrong actor',{actorId:'B'}],['wrong stage',{stage:3}],['wrong message',{replyToMessageId:76}],
 ['early',{lastMessage:{...source,at:now-7000}}],['old',{lastMessage:{...source,at:now-91000}}],
 ['off',{mode:'paused'}],['no message',{lastMessage:null}],
]){assert.equal(canContinueOwnTestTurn({...own,...change}),false,name);console.log('PASS',name)}
// Existing hard policy must remain on even when allowing a linked turn.
assert.equal(judgeTestChat({text:'밴드 보고 왔어요',mode:'live',now,actorId:'A',currentProductKey:productKey,replyingToHuman:true,recent:[]}).ok,false);
assert.equal(judgeTestChat({text:'입어봐주세요',mode:'replay',now,actorId:'A',currentProductKey:productKey,replyingToHuman:true,recent:[]}).ok,false);
console.log('PASS mini-dialogue: anchored same person, 3rd-person preference, guards and topic continuity');
