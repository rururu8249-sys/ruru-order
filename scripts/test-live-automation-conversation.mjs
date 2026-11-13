import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-conversation-signature-over-32-chars';
const id='00000000-0000-4000-8000-000000000001';
let aiCalls=0,httpCalls=0,taken=false,admissions=0;
const ctx={campaign:{id,broadcast_id:id,revision:1},session:{id},actor:{id,nickname:'달빛',profile:{seed:0,style:'간결한 존댓말'},order_count:1}};
const db={from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{status:'ON'}})};return q},async rpc(name){if(name==='live_automation_context')return {data:ctx};if(name==='live_automation_ai_admission'){admissions++;if(taken)return {error:{message:'MANUAL_CHAT_ACTIVE'}}}return {data:null}}};
const load=createUiLoader({'./autoTestOrderServer':{streamModeOf:async()=>'live'},'./geminiJson':{callGeminiJson:async()=>{aiCalls++;taken=true;return {text:'{"text":"주문서 제출했어요"}',note:'model'}}}});
let C;try{C=load('lib/liveAutomationConversation.ts')}catch{}
assert.ok(C,'activity-aware conversation driver must exist');
const action={id,session_id:id,actor_id:id,revision:1,lease_token:id,kind:'chat',plan:{facts:{ordered:true,items:[]},mode:'live'}};
const transport=async()=>{httpCalls++;return new Response(JSON.stringify({ok:true}))};
await C.runConversationAction(db,'https://shop.test',action,[],transport);
assert.equal(aiCalls,1);assert.equal(httpCalls,0,'operator takeover during generation discards the generated text before sending');assert.equal(admissions,2);
assert.equal(C.acceptConversationText('주문했어요',{ordered:false},[]),null);
assert.equal(C.acceptConversationText('입금 완료',{ordered:true},[]),null);
assert.equal(C.acceptConversationText('잘 보고 있어요',{ordered:false},['잘 보고 있어요']),null);
assert.equal(C.acceptConversationText('색이 괜찮네요',{ordered:false},[]),'색이 괜찮네요');
let cardReads=0,missing=false;
const card={productId:'10',detailName:'',revision:'first'};
const featuredLoader=createUiLoader({
 './geminiJson':{callGeminiJson:async()=>{aiCalls++;return {text:'{"text":"기장은 어때요?"}'}}},
 './liveAutomationFeatured':{readAutomationFeatured:async()=>missing?null:{...card,revision:++cardReads===1?'first':'changed'},featuredMatches:()=>true},
 './autoTestOrderServer':{streamModeOf:async()=>'live'},
});
const withCard=featuredLoader('lib/liveAutomationConversation.ts');
db.from=()=>{const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{status:'ON'}})};return q};
taken=false;aiCalls=0;httpCalls=0;
const question={...action,kind:'question',plan:{card,mode:'live',facts:{ordered:false,items:[{productId:'10',productName:'상품'}]}}};
await withCard.runConversationAction(db,'https://shop.test',question,[],transport);
assert.equal(aiCalls,1);assert.equal(httpCalls,0,'card rotation during generation discards the stale product question');
missing=true;aiCalls=0;
await withCard.runConversationAction(db,'https://shop.test',question,[],transport);
assert.equal(aiCalls,0,'no current card means no product-question generation');
assert.equal(C.acceptConversationText('블랙 3개 구성 깔끔하네요.',{ordered:false},[],'paused'),null);
assert.equal(C.acceptConversationText('막스117 좀 더 보여줘요',{ordered:true},[],'paused'),null);
assert.equal(C.acceptConversationText('MIU-1 주문했어요',{ordered:true,items:[{productName:'MIU-1'}]},[],'paused'),'미우1 주문했어요');
assert.equal(C.acceptConversationText('MX-117 주문했어요',{ordered:true,items:[{productName:'MX-117 아이보리'}]},[],'replay'),'막스117 주문했어요');
assert.equal(C.acceptConversationText('다시 보다가 결국 골랐어요ㅎㅎ',{ordered:true},[],'replay'),'다시 보다가 결국 골랐어요ㅎㅎ');
assert.equal(C.acceptConversationText('아침 방송 보다가 주문했어요',{ordered:true},[],'paused'),null);
console.log('PASS no invented submission/settlement, duplicate suppression and generation-time manual takeover fence');
