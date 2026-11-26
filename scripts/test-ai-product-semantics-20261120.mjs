import assert from 'node:assert/strict';
import {judgeTestChat} from '../lib/liveAutomationQualityGate.ts';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {stockQuestionBlocked}=createUiLoader()('lib/liveAutomationDirector.ts');
const now=Date.parse('2026-11-20T14:50:24+09:00');
const card={productId:'818',detailName:'MX-107 와인',name:'MX-107 와인',parentName:'막스마라',colors:[],sizes:['36','38','40']};
const base={now,mode:'paused',actorId:'test',currentProductKey:'818:MX-107 와인',currentProduct:card,recent:[]};
for(const text of ['막지마라115 와인 잔에 따라 마시면 색이 예쁘게 비치겠어요','막스104 와인 페어링하기 좋은 안주도 따로 추천해주시나요?','mx107 와인 병 디자인이 독특하네요~']){
 assert.equal(judgeTestChat({...base,text}).ok,false,`stored product-category error: ${text}`);
}
for(const text of ['mx107 와인 색이 예쁘네요','와인 컬러는 검정 바지랑 어울릴까요?','와인색이 포도주처럼 진한가요?','반가워요💕','아 그렇군요 안내 감사해요!']){
 assert.equal(judgeTestChat({...base,text,replyingToHuman:true,replySourceIsHuman:true}).ok,true,`normal conversation: ${text}`);
}
for(const text of ['미우302 블랙 색상 따로 없나요','막지마라129 와인 컬러가 따로 있나요?','프라땡518 블랙 색상 따로 없나요..'])assert.equal(stockQuestionBlocked(text),true,text);
for(const text of ['와인 색감이 어떤가요?','블랙에 어울리는 색상 있나요?','각인 있나요?','숏 패딩도 있나요?'])assert.equal(stockQuestionBlocked(text),false,text);
console.log('PASS production product semantics and option-existence regressions');
const {productSemanticFacts,productFactsPrompt}=await import('../lib/liveAutomationProductFacts.ts');
const {buildCompactConversationPrompt}=await import('../lib/liveAutomationCompactPrompt.ts');
const {buildFocusedProductPrompt}=await import('../lib/liveAutomationProductOpportunity.ts');
assert.deepEqual(productSemanticFacts(card).namedColors,['와인']);
assert.deepEqual(productSemanticFacts(card).colors,[],'name color is not a new selectable option');
assert.equal(productSemanticFacts(card).parentName,'막스마라');
assert.equal(productSemanticFacts({...card,name:'상품',detailName:'',sizes:[]}).kind,'종류 미확인');
for(const mode of ['live','paused','replay']) {
 const prompts=[buildCompactConversationPrompt({mode,cardText:card.name,product:card,messages:[],actors:[{nickname:'테스터'}]}),buildFocusedProductPrompt({mode,product:card,productName:card.name,colors:[],candidates:['테스터'],recentAi:[]})];
 for(const p of prompts){assert.ok(p.includes(productFactsPrompt(card)));assert.ok(p.includes('세부상품명 속 색상: 와인'));}
 assert.ok(prompts[0].length<5200);assert.ok(prompts[1].length<2300);
 assert.equal(judgeTestChat({...base,mode,text:'mx107 와인 병 디자인이 독특하네요~'}).ok,false);
 assert.equal(judgeTestChat({...base,mode,text:'mx107 와인 색은 검정 바지랑 어울릴까요?'}).ok,true);
}
for(const [color,text] of [['초코','초코 먹으면 달콤한 맛이 나나요?'],['올리브','올리브 볶아 먹기 좋겠어요']]) {
 const currentProduct={...card,name:`MX-118 ${color}`,detailName:`MX-118 ${color}`};
 assert.equal(judgeTestChat({...base,currentProduct,text}).ok,false);
 assert.equal(judgeTestChat({...base,currentProduct,text:`막스118 ${color} 색감이 어떤가요?`}).ok,true);
}
assert.equal(judgeTestChat({...base,currentProduct:{name:'레드와인 음료',colors:[],sizes:[]},text:'레드와인 음료 병 디자인이 독특하네요'}).ok,true,'actual beverage is not a garment');
assert.equal(judgeTestChat({...base,text:'안주가 맛있겠네요',replySourceText:'와인 안주 먹고 있어요',replyingToHuman:true}).ok,true,'human food topic remains allowed');
assert.equal(judgeTestChat({...base,text:'mx107 와인 안주로 좋겠네요',replySourceText:'와인 안주 먹고 있어요',replyingToHuman:true,replySourceIsHuman:true}).ok,false,'human source does not license garment-as-food');
// Read the real card builder with only the network featured selection replaced.
const load=createUiLoader({'./liveAutomationFeatured':{readAutomationFeatured:async()=>({productId:'818',detailName:'MX-107 와인',revision:'r'})}});
const product={id:818,product_name:'막스마라',status:'active',product_status:'active',color_options:['MX-107 와인'],product_note:{brand_group:{enabled:true,detail_options:{'MX-107 와인':{colors:['없음'],sizes:['36','38','40']}}}}};
const db={from(table){const q={select(){return q},eq(){return q},limit:async()=>({data:[{product_id:818}]}),maybeSingle:async()=>({data:product})};return q;}};
const loaded=await load('lib/liveAutomationDialogueServer.ts').readDialogueCard(db,'broadcast');
assert.ok(loaded,'verified exposed product loaded');
assert.equal(loaded.parentName,'막스마라');assert.deepEqual(loaded.colors,[]);
assert.deepEqual(productSemanticFacts(loaded).namedColors,['와인']);
console.log('PASS shared prompt facts, all modes, other color homonyms, genuine food replies and actual card mapping');

for(const [replySourceText,text] of [['와인 안주 먹고 있어요','와인 안주 맛있겠네요'],['오늘 치킨 시켰어요','안주 맛있게 드세요']])assert.equal(judgeTestChat({...base,replySourceText,text,replyingToHuman:true,replySourceIsHuman:true}).ok,true,'human food conversation is not a garment reference');
