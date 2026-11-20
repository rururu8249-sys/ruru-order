import assert from 'node:assert/strict';
import {judgeTestChat} from '../lib/liveAutomationQualityGate.ts';
const now=Date.parse('2026-11-20T21:41:37+09:00');
const earlier={text:'몽클323 블랙 모델 색감 실제로 어때요?',at:Date.parse('2026-11-20T21:03:11+09:00'),actorId:'a',productKey:'748:MC-323 블랙(란스)'};
const q={now,mode:'live',actorId:'b',currentProductKey:'823:',recent:[earlier],text:'CP-1 올리브(CP컴퍼니 디디쉘) 색감이 화면이랑 실제로 볼 때랑 비슷할까요?'};
assert.equal(judgeTestChat(q).ok,false,'production 5724 → 5762: new actor/product must not reset repeated color question');
for(const mode of ['live','paused','replay']) {
 assert.equal(judgeTestChat({...q,mode,actorId:'a'}).ok,false,'same speaker repetition also blocked');
 for(const text of ['블랙이랑 올리브 중 어느 쪽이 더 좋아요?','올리브에 검정 바지 어울릴까요?','저는 올리브 쪽이 좋아요','소매 길이는 어느 정도인가요?'])assert.equal(judgeTestChat({...q,mode,text}).ok,true,text);
 assert.equal(judgeTestChat({...q,mode,replyingToHuman:true,replySourceIsHuman:true,replySourceText:'어느 부분이 궁금하세요?'}).ok,true,'anchored human clarification remains possible');
}
assert.equal(judgeTestChat({...q,recent:[{...earlier,at:now-91*60_000}]}).ok,true,'existing 90-minute repetition memory expires');
assert.equal(judgeTestChat({...q,recent:[{...earlier,at:now+1000}]}).ok,true,'future observations ignored');
console.log('PASS real production color-question recurrence and normal discussion controls');

for(const text of ['막스128 그레이 컬러 실물 느낌이 화면이랑 비슷한가요?','막스112 찐베이지 색상 실제로 보면 화면이랑 많이 다르나요??','몽308 소라 색상 실제로 보면 어떤 느낌인가요?'])assert.equal(judgeTestChat({...q,text}).ok,false,text);
assert.equal(judgeTestChat({...q,text:'pd222 이거 디자인이 어떻게 나왔는지 궁금하네^^',recent:[{...earlier,text:'버버114 블랙 디자인이어떻게 나왔는지 궁금하네요'}]}).ok,false,'same generic design formula across products');
assert.equal(judgeTestChat({...q,text:'pd222 주머니 디자인은 어떤가요?',recent:[{...earlier,text:'버버114 블랙 디자인이어떻게 나왔는지 궁금하네요'}]}).ok,true,'specific design question remains allowed');
