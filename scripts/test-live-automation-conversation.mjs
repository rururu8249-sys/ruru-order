import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-conversation-signature-over-32-chars';
const savedRandom=Math.random;Math.random=()=>.8;
const id='00000000-0000-4000-8000-000000000001';
let aiCalls=0,httpCalls=0,taken=false,admissions=0;
const ctx={campaign:{id,broadcast_id:id,revision:1},session:{id},actor:{id,nickname:'달빛',profile:{seed:0,style:'간결한 존댓말'},order_count:1}};
const db={from(table){const q={select(){return q},eq(){return q},is(){return q},not(){return q},gte(){return q},or(){return q},order(){return q},limit(){return q},maybeSingle:async()=>({data:{status:'ON'}}),then(resolve,reject){return Promise.resolve({data:table==='broadcasts'?{status:'ON'}:[],error:null}).then(resolve,reject)}};return q},async rpc(name){if(name==='live_automation_context')return {data:ctx};if(name==='live_automation_ai_admission'){admissions++;if(taken)return {error:{message:'MANUAL_CHAT_ACTIVE'}}}return {data:null}}};
const load=createUiLoader({'./liveAutomationDialogueServer':{readDialogueCard:async()=>null},'./autoTestOrderServer':{streamModeOf:async()=>'live'},'./geminiJson':{callGeminiJson:async()=>{aiCalls++;taken=true;return {text:'{"text":"천천히 구경할게요","scope":"general","productId":"","detailName":""}',note:'model'}}}});
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
 './liveAutomationDialogueServer':{readDialogueCard:async()=>({...card,name:'상품',colors:[],sizes:[]})},
 './geminiJson':{callGeminiJson:async()=>{aiCalls++;return {text:'{"text":"기장은 어때요?","scope":"product","productId":"10","detailName":""}'}}},
 './liveAutomationFeatured':{readAutomationFeatured:async()=>missing?null:{...card,revision:++cardReads===1?'first':'changed'},featuredMatches:()=>true},
 './autoTestOrderServer':{streamModeOf:async()=>'live'},
});
const withCard=featuredLoader('lib/liveAutomationConversation.ts');

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

const S=load('lib/liveAutomationSpeech.ts');
assert.equal(S.spokenProductName('MIU-1',1),'미워1');
assert.equal(S.spokenProductName('MX-117',1),'막땡117');
assert.equal(S.spokenProductName('PD-509',2),'푸라닭509');
assert.equal(S.spokenProductName('CL-102',1),'쎌린102');
assert.equal(S.spokenProductName('BC-101',2),'쿠치101');
assert.equal(S.spokenProductName('LOE-1',0),'로에1');
assert.equal(S.normalizeSpokenCodes('MX-117은요?',[{productName:'MIU-1'}],0),'MX-117은요?','unrelated product codes are never silently substituted');
for(const [code,aliases] of Object.entries(S.BRAND_SPEECH_ALIASES)){
 const spoken=new Set(Array.from({length:40},(_,i)=>S.spokenProductName(code+'-117',i).replace(/-?117$/,'')));
 for(const alias of aliases)assert.ok(spoken.has(alias),code+' rotates '+alias);
}
assert.equal(C.acceptConversationText('miu1 주문했어요',{ordered:true,items:[{productName:'MIU-1'}]},[],'paused','chat',9),'miu-1 주문했어요');
assert.equal(C.acceptConversationText('MX117 주문했어요',{ordered:true,items:[{productName:'MIU-1'}]},[],'paused'),null);

const R=load('lib/liveAutomationRoom.ts');
const now=Date.now();
const bot=[0,1,2].map(i=>({badge:'bot',body:'🛒 주문 감사합니다',created_at:new Date(now-i*30000).toISOString()}));
const quiet=R.conversationRoom(bot,'paused',now);
assert.equal(quiet.quietWhileOrdering,true);
assert.equal(R.conversationRoom([...bot,{body:'안녕하세요',created_at:new Date(now-20000).toISOString()}],'paused',now).quietWhileOrdering,false);
assert.equal(R.conversationRoom(Array.from({length:40},()=>bot[0]),'paused',now).quietWhileOrdering,false,'truncated busy history cannot establish silence');
assert.equal(R.conversationRoom([...bot,{body:'다들 조용하시네요',automation_actor_id:id,created_at:new Date(now-600000).toISOString()}],'paused',now).quietWhileOrdering,false,'room comments have a 15 minute cooldown');
assert.equal(C.acceptConversationText('다들 조용히 주문만 하시네요ㅎㅎ',{ordered:true,room:quiet},[],'paused'),'다들 조용히 주문만 하시네요ㅎㅎ');
assert.equal(C.acceptConversationText('다들 조용히 주문만 하시네요ㅎㅎ',{ordered:true},[],'paused'),null);

assert.equal(R.conversationRoom(bot,'paused',now,new Date(now-600000).toISOString()).quietWhileOrdering,false,'independent room-comment history preserves cooldown beyond 40 recent rows');

Math.random=savedRandom;

assert.equal(C.acceptConversationText('넹',{ordered:true},[],'live','chat'),null);
assert.equal(C.acceptConversationText('넹',{ordered:true,question:'확인해 주세요'},[],'live','reply'),'넹');
