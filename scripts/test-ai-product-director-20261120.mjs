import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const now=Date.parse('2026-11-20T14:50:24+09:00');
const card={productId:'818',detailName:'MX-107 와인',name:'MX-107 와인',parentName:'막스마라',colors:[],sizes:['36','38','40']};
async function run({mode='paused',focused=false,text='mx107 와인 병 디자인이 독특하네요~',rate=80,rotate=false,removed=false,transition=false,hidden=[],visible=[],replyTo=0}={}){
 const sent=[],prompts=[],actions=[];let reads=0,modes=0;
 const actor={id:'actor-a',nickname:'봄이',profile:{seed:17}},session={id:'session-a',actor_id:'actor-a',watching:true,last_ack_at:new Date(now-1000).toISOString()};
 const db={from(table){let key='',hiddenMemory=false;const q={select(){return q},eq(k,v){if(k==='key')key=v;return q},is(){return q},neq(){return q},not(){hiddenMemory=true;return q},gt(){return q},gte(){return q},in(){return q},order(){return q},limit(){return q},upsert(){return Promise.resolve({error:null})},maybeSingle:async()=>({data:table==='broadcasts'?{id:'bc',status:'ON',paused_at:'2026-11-19T18:00:00Z'}:{value:key==='live_automation_chat_rate_pct'?String(rate):key==='live_automation_director_log'?'[]':''}}),then(resolve,reject){const data=table==='live_automation_sessions'?[session]:table==='live_automation_actors'?[actor]:table==='visitor_presence'?[{automation_session_id:session.id}]:table==='live_chat_messages'?(hiddenMemory?hidden:visible):[];return Promise.resolve({data,error:null}).then(resolve,reject)}};return q;}};
 const load=createUiLoader({
 './geminiJson':{callGeminiJson:async prompt=>{prompts.push(prompt);return {text:JSON.stringify(focused&&prompts.length===1?{speaker:'',text:''}:{speaker:'봄이',replyTo,text}),note:'ok'}}},
 './autoTestOrderServer':{streamModeOf:async()=>transition&&++modes>=3?'replay':mode},
 './liveAutomationDialogueServer':{readDialogueCard:async()=>rotate&&++reads>1?{...card,detailName:'MX-104 와인',name:'MX-104 와인'}:card},
 './widgetFeaturedServer':{computeWidgetFeatured:async()=>({enabled:true,siteCardOff:false,targets:removed?[]:[card]})},
 './liveAutomationLearningServer':{readLearning:async()=>null},
 './liveAutomationRoomSignals':{readRoomSignals:async()=>({style:'',realOrderProducts:[]})},
 './subscribeFreeShipServer':{readSubscribeFreeShipConfig:async()=>({})},
 './liveAutomationServer':{automationRpc:async(_db,name,args)=>{
  if(name==='live_automation_action'){const a={id:'action-a',session_id:session.id,actor_id:actor.id,kind:args.p_kind,plan:args.p_plan,revision:1,lease_token:'lease'};actions.push(a);return a;}
  if(name==='live_automation_claim')return actions.at(-1);
  if(name==='live_automation_context')return {};
  return null;
 }},
 './liveAutomationTransport':{automationPost:async(...args)=>{sent.push(args[5]);return {ok:true}}},
 });
 const dateNow=Date.now,random=Math.random;Date.now=()=>now;Math.random=()=>0;
 try{await load('lib/liveAutomationDirector.ts').runRoomDirector(db,{id:'campaign',broadcast_id:'bc',chat_enabled:true,revision:1},'https://invalid.test');}finally{Date.now=dateNow;Math.random=random;}
 return {sent,prompts,actions};
}
for(const mode of ['live','paused','replay'])for(const focused of [false,true]){
 const bad=await run({mode,focused});assert.equal(bad.sent.length,0,`${mode}/${focused}: semantic error must not reach transport`);
 assert.equal(bad.prompts.length,focused?2:1);for(const p of bad.prompts)assert.ok(p.includes('막스마라')&&p.includes('세부상품명 속 색상: 와인'));
 const good=await run({mode,focused,text:'mx107 와인 색이 예쁘네요'});assert.equal(good.sent.length,1,`${mode}/${focused}: normal color remark is sent`);
}
assert.equal((await run({rate:0})).prompts.length,0,'0% no model call');
assert.equal((await run({text:'mx107 와인 색이 예쁘네요',rotate:true})).sent.length,1,'ordinary carousel rotation allowed');
assert.equal((await run({text:'mx107 와인 색이 예쁘네요',rotate:true,removed:true})).sent.length,0,'removed product denied');
assert.equal((await run({text:'mx107 와인 색이 예쁘네요',transition:true})).sent.length,0,'mode changed during generation denied');
const prior=await run({text:'mx107 와인 색이 예쁘네요'});
const hidden=[{id:5,body:prior.sent[0].body,created_at:new Date(now-60_000).toISOString(),automation_actor_id:'other'}];
const cleared=await run({text:'mx107 와인 색이 예쁘네요',hidden});
assert.equal(cleared.sent.length,0,'screen-clear does not reset repeat memory');
assert.ok(!cleared.prompts[0].includes('#5'),'hidden row not restored as reply context');
console.log('PASS actual director normal/focused paths, all phases, 0%, rotation/removal, transition, hidden memory');
// Actual production gap: automated notices displace older AI turns from the visible
// 40-row window; retain only their question family, never hidden raw dialogue.
const olderQuestion={id:5724,body:'몽클323 블랙 모델 색감 실제로 어때요?',created_at:new Date(now-38*60_000).toISOString(),automation_actor_id:'other'};
for(const focused of [false,true]){
 const result=await run({mode:'live',focused,text:'mx107 와인 색감 화면이랑 실제랑 비슷한가요?',hidden:[olderQuestion]});
 assert.equal(result.sent.length,0,'cross-product question repetition cannot reach transport');
 for(const prompt of result.prompts){
  assert.ok(prompt.includes('실물·화면 색감 확인 질문'),'both generation paths receive long-lived topic memory');
  assert.ok(!prompt.includes(olderQuestion.body),'hidden text not republished as dialogue');
  assert.ok(!prompt.includes('#5724'),'hidden message cannot be a reply target');
 }
}
console.log('PASS director topic memory survives notification churn and screen clearing');

const clarification={id:6000,nickname:'다른사람',body:'어느 부분이 궁금하세요?',created_at:new Date(now-120_000).toISOString(),badge:null};
const repeated='mx107 와인 색감 화면이랑 실제랑 비슷한가요?';
const aiReply=await run({mode:'live',text:repeated,hidden:[olderQuestion],visible:[{...clarification,automation_actor_id:'other'}],replyTo:6000});
assert.equal(aiReply.prompts.length,1,'AI reply regression reaches model');
assert.equal(aiReply.sent.length,0,'replyTo a TEST actor cannot bypass product question memory');
const humanReply=await run({mode:'live',text:repeated,hidden:[olderQuestion],visible:[clarification],replyTo:6000});
assert.equal(humanReply.sent.length,1,'verified human clarification can receive a contextual answer');
console.log('PASS verified human exception without TEST-reply bypass');
// 11/21: long off-air silence must not turn the room back into a questionnaire.
const oldOffAirQuestion={id:7000,body:'몽2 네이비 색감 차분한 편인가용?',created_at:new Date(now-5*3600_000).toISOString(),automation_actor_id:'other'};
for(const focused of [false,true]){
 const q=await run({mode:'paused',focused,text:'mx107 와인 색감 어때요?',hidden:[oldOffAirQuestion]});
 assert.equal(q.sent.length,0,'off-air unanswered question remembered beyond short topic window');
 const thought=await run({mode:'paused',focused,text:'오늘은 천천히 구경하고 있어요',hidden:[oldOffAirQuestion]});
 assert.equal(thought.sent.length,1,'grounded off-air browsing reflection is not discarded');
 for(const prompt of thought.prompts){
  assert.ok(prompt.includes('답을 기다리는 질문이 있음'),'both prompts get off-air conversation state');
  assert.ok(!prompt.includes(oldOffAirQuestion.body),'hidden source text stays private');
 }
}
console.log('PASS off-air flow through both real director paths');
const sparseTurn={id:7100,nickname:'다른테스트',body:'연베이지 색감 차분해 보여요',created_at:new Date(now-2*3600_000).toISOString(),automation_actor_id:'other'};
const notices=Array.from({length:20},(_,i)=>({id:7200+i,body:'알림 개인정보',badge:'bot',bot_ref:'c:test'}));
const sparse=await run({mode:'paused',focused:true,text:'오늘은 천천히 구경하고 있어요',visible:[...notices,sparseTurn]});
for(const prompt of sparse.prompts){
 assert.ok(prompt.includes(sparseTurn.body),'sparse conversation survives both notification churn and focused retry');
 assert.ok(!prompt.includes('알림 개인정보'),'system notification content stays excluded');
 assert.ok(prompt.includes('테스트 장바구니'),'retry retains per-speaker grounded context');
 assert.ok(!prompt.includes('#7100'),'older context is not presented as a reply target');
}
console.log('PASS shared conversation context in focused recovery');
const staleReply=await run({mode:'paused',focused:true,text:'저도 와인이 더 좋아요',visible:[{...sparseTurn,body:'와인 색감 차분해 보여요'}],replyTo:7100});
assert.equal(staleReply.sent.length,0,'expired explicit reply is never demoted into unsolicited speech');
