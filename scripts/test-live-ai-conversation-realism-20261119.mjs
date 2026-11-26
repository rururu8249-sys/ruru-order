import assert from 'node:assert/strict';
import { personaVoice } from '../lib/liveAutomationLines.ts';
import { judgeTestChat } from '../lib/liveAutomationQualityGate.ts';
import { buildCompactConversationPrompt } from '../lib/liveAutomationCompactPrompt.ts';
import { buildFocusedProductPrompt } from '../lib/liveAutomationProductOpportunity.ts';
const now=Date.parse('2026-11-19T15:30:00+09:00');
const base={mode:'paused',now,actorId:'person-a',currentProductKey:'745:PD-529',recent:[]};
const gate=(text,recent=[])=>judgeTestChat({...base,text,recent});
assert.equal(gate('프라529아이보리컬러진짜많이예뻐보여서고민이네요').ok,false,'긴 무띄어쓰기 문장 차단');
assert.equal(gate('프라529 아이보리 529는 없는것 같아용').ok,false,'등록상품 없다고 단정 금지');
assert.equal(gate('프라521 말씀하시는거죠? 529는없는것 같아용.').ok,false,'실제 문제가 된 521/529 반박 차단');
const history=[{text:'몽335 아이보리 컬러 고민되네요',at:now-13*60000,actorId:'person-b',productKey:'748:MC-335'}];
assert.equal(gate('몽303 블랙이랑 고민되네요!',history).ok,false,'다른 상품이어도 같은 고민 반응 반복 금지');
assert.equal(gate('블랙 입으시는 분들은 아이보리도 괜찮아 보여요?',history).ok,true,'단순 질문·대안은 유지');
assert.equal(gate('프라529 아이보리 색감 궁금해요').ok,true,'정상 상품 관심 질문 허용');
assert.equal(gate('프라529 아이보리 다른 색 없나요?').ok,true,'없는지 묻는 질문은 단정이 아니다');
const long='아이보리 컬러가 생각보다 화사해서 평소 입는 옷이랑 잘 맞을지 모르겠어요';
for(let a=0;a<180;a++)for(let m=0;m<4;m++){
 const styled=personaVoice(long,a*13,m*19);
 assert.ok(/\s/.test(styled),`긴 채팅을 전부 붙여 씀: ${styled}`);
 assert.ok(!/[가-힣]{18,}/.test(styled),`비정상 장문 붙여쓰기: ${styled}`);
}
const prompt=buildCompactConversationPrompt({mode:'paused',cardText:'PD-529 아이보리',messages:[],actors:[{nickname:'모모'},{nickname:'나비'}],styleSummary:'한두 마디 짧음'});
assert.ok(prompt.includes('정확한 #번호')&&prompt.includes('고민한다고')&&prompt.includes('기본 띄어쓰기와 상품명을 유지한다'));
assert.ok(prompt.includes('상품을 찾지도 않고')&&prompt.includes('정형화')===false);
assert.ok(prompt.length<5200, 'prompt budget exceeded');
const focus=buildFocusedProductPrompt({productName:'PD-529 아이보리',colors:['아이보리','블랙'],candidates:['모모'],recentAi:['고민되네요']});
assert.ok(focus.includes('긴 무띄어쓰기')&&focus.includes('고민되네요'));
console.log('PASS AI chat realism: no run-ons, no fake missing products, no recycled dilemma, natural follow-ups, prompt budget');
