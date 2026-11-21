import assert from 'node:assert/strict';
import {judgeTestChat} from '../lib/liveAutomationQualityGate.ts';
import {rankChatCandidates} from '../lib/liveAutomationCandidates.ts';
import {run} from './test-ai-product-director-20261120.mjs';

// Actual production messages 6046–6048, no customer data or invented model output.
const now=Date.parse('2026-11-21T05:31:12.444Z');
const history=[
 {id:6047,body:'차분한 색감이라 휘뚜루마뚜루 걸치기엔 올리브가 제일 편할 것 같아요!',created_at:'2026-11-21T05:20:22.908425Z',automation_actor_id:'other-b'},
 {id:6046,body:'올리브 컬러는 은근히 매치할 수 있는 색이 많아서 활용도가 좋아 보여요~',created_at:'2026-11-21T05:06:22.458455Z',automation_actor_id:'other-a'},
];
const text='올리브 색상이 코디하기 무난해서 자꾸 눈길이 가네요.';
const recent=history.map(m=>({text:m.body,at:Date.parse(m.created_at),actorId:m.automation_actor_id}));
const base={mode:'paused',now,actorId:'new-actor',currentProductKey:'cp:olive',recent};
assert.equal(judgeTestChat({...base,text}).ok,false,'normal final gate must reject the production color/styling wave');
const choice=t=>({reason:'ok',speaker:'봄이',replyTo:0,text:t});
assert.equal(rankChatCandidates([choice(text)],recent,now).length,0,'candidate ranking uses the same shared multi-topic rule');
assert.equal(judgeTestChat({...base,text:'CP-1 올리브 후드는 분리되나요?'}).ok,true,'a color in a product name must not block a genuinely different question');
assert.equal(judgeTestChat({...base,text:'저는 올리브 쪽이 좋아요',replyingToHuman:true,replySourceIsHuman:true,replySourceText:'어떤 색이 더 좋아요?'}).ok,true,'a real customer may reopen a topic');
assert.equal(judgeTestChat({...base,text,replyingToHuman:true,replySourceIsHuman:false}).ok,false,'TEST replies cannot bypass room repetition');
assert.equal(judgeTestChat({...base,text,recent:recent.map(r=>({...r,at:now-91*60000}))}).ok,true,'existing 90-minute topic memory remains bounded');
const card={productId:'cp',detailName:'CP-1 올리브',name:'CP-1 올리브',parentName:'CP컴퍼니 아우터',colors:['올리브'],sizes:['M','L']};
assert.equal(judgeTestChat({...base,currentProduct:card,recent:[],text:'올리브 색감 차분하네요'}).ok,false,'standalone color impression needs an identifiable product');
for(const text of ['핑크가 예뻐요','브라운은 좋아요','화이트도 좋아요','색이 예뻐요']){
 assert.equal(judgeTestChat({...base,currentProduct:card,recent:[],text}).ok,false,'grounding is not an olive-only keyword patch: '+text);
 assert.equal(rankChatCandidates([choice(text)],recent,now).length,0,'other colors are the same overused interest');
}
assert.equal(judgeTestChat({...base,currentProduct:card,recent:[],text:'CP-1 올리브 색이 좋아요'}).ok,true,'explicit verified item is allowed without a preceding wave');
assert.equal(judgeTestChat({...base,currentProduct:card,recent:[],text:'CP-10 올리브 색이 좋아요'}).ok,false,'a different product number is not a valid reference');
assert.equal(judgeTestChat({...base,currentProduct:{...card,name:'MX-107 와인',detailName:'MX-107 와인'},recent:[],text:'막스107 와인 색이 좋아요'}).ok,true,'existing spoken aliases remain valid');
for(const mode of ['live','paused','replay'])for(const focused of [false,true]){
 const r=await run({mode,focused,text,hidden:history,cardOverride:card,clockNow:now});
 assert.equal(r.sent.length,0,`${mode}/${focused}: production wave must never reach transport`);
 assert.ok(r.prompts.every(p=>p.includes('최근 관심사:')&&p.includes('색감·외형 감상')),'normal and focused share bounded topic summaries');
 assert.ok(r.prompts.every(p=>!p.includes(history[0].body)),'hidden history stays summary-only');
}
const other=await run({mode:'live',text:'CP-1 올리브 후드는 분리되나요?',hidden:history,cardOverride:card,clockNow:now});
assert.equal(other.sent.length,1,'different grounded interest still reaches transport');
const drafts=await run({mode:'live',focused:true,drafts:[text,'CP-1 올리브 후드는 분리되나요?'],hidden:history,cardOverride:card,clockNow:now});
assert.equal(drafts.sent.length,1,'reject repetitive draft and retain different valid draft');
assert.ok(drafts.sent[0].body.includes('후드'));
console.log('PASS production olive wave: normal/focused final boundary, shared memory, real-human exception, independent new interest');
const ordered={productId:'818',detailName:'MX-133 초코',name:'MX-133 초코',parentName:'막스마라',colors:[],sizes:['36','38'],revision:'orders-today'};
for(const mode of ['live','paused','replay'])for(const focused of [false,true]){
 const r=await run({mode,focused,text:'막스133 초코 세탁은 어떻게 하나요?',cardOverride:card,orderedCards:[ordered],clockNow:now});
 assert.equal(r.sent.length,1,`${mode}/${focused}: today's verified ordered product is allowed even when not the rotating card`);
 assert.equal(r.actions[0].plan.chatProductKey,'818:MX-133 초코','remember the product actually discussed');
 assert.ok(r.prompts.every(p=>p.includes('MX-133 초코')),'both paths receive verified alternatives');
}
assert.equal((await run({mode:'live',text:'막스133 초코 세탁은 어떻게 하나요?',cardOverride:card,orderedCards:[ordered],orderedRemoved:true,clockNow:now})).sent.length,0,'withdrawn order/catalog source is rechecked before send');
assert.equal((await run({mode:'live',text:'MX-999 초코 세탁은 어떻게 하나요?',cardOverride:card,orderedCards:[ordered],clockNow:now})).sent.length,0,'unlisted products remain forbidden');
console.log('PASS current card or verified daily order topic in all broadcast phases');
for(const text of ['MX-133 초코 담았어요','막스133 초코 담아뒀어요','MX-133 초코 주문했어요'])assert.equal((await run({mode:'live',text,cardOverride:card,orderedCards:[ordered],clockNow:now})).sent.length,0,'daily topic is not proof of the TEST actor cart/order: '+text);

for(const mode of ['live','paused','replay'])assert.equal((await run({mode,focused:true,noCard:true,text:'막스133 초코 세탁은 어떻게 하나요?',orderedCards:[ordered],clockNow:now})).sent.length,1,'verified daily order source remains usable without a displayed card');
const recovery=await run({mode:'live',focused:true,normalText:'CP-1 올리브 컬러가 확실히 활용도는 높을 것 같아요.',drafts:['막스133 초코 세탁은 어떻게 하나요?'],cardOverride:card,orderedCards:[ordered],hidden:history,clockNow:now});
assert.equal(recovery.sent.length,1,'a repeated normal choice should use the existing bounded recovery opportunity for a different valid topic');
assert.ok(recovery.sent[0].body.includes('세탁'));
assert.equal(recovery.prompts.length,2,'one recovery, not an unbounded regeneration loop');
const cooldown=await run({mode:'live',focused:true,normalText:text,drafts:['막스133 초코 세탁은 어떻게 하나요?'],cardOverride:card,orderedCards:[ordered],hidden:history,clockNow:now,recentDecisionLog:[{result:'focus-attempt',at:new Date(now-60000).toISOString()},{result:'quality:room-repeated-interest',at:new Date(now-30000).toISOString(),raw:'거절된 실제 반복 문장'}]});
assert.equal(cooldown.sent.length,0,'cooldown cannot be bypassed by repetitive drafts');
assert.equal(cooldown.prompts.length,1,'no repeated recovery call each scheduler tick');
assert.ok(cooldown.prompts[0].includes('거절된 실제 반복 문장'),'quality-rejected text is fed back as forbidden, not silently retried');
