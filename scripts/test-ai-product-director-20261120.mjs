import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const now=Date.parse('2026-11-20T14:50:24+09:00');
const card={productId:'818',detailName:'MX-107 와인',name:'MX-107 와인',parentName:'막스마라',colors:[],sizes:['36','38','40']};
async function run({mode='paused',focused=false,text='mx107 와인 병 디자인이 독특하네요~',rate=80,rotate=false,removed=false,transition=false,hidden=[]}={}){
 const sent=[],prompts=[],actions=[];let reads=0,modes=0;
 const actor={id:'actor-a',nickname:'봄이',profile:{seed:17}},session={id:'session-a',actor_id:'actor-a',watching:true,last_ack_at:new Date(now-1000).toISOString()};
 const db={from(table){let key='',hiddenMemory=false;const q={select(){return q},eq(k,v){if(k==='key')key=v;return q},is(){return q},neq(){return q},not(){hiddenMemory=true;return q},gt(){return q},gte(){return q},in(){return q},order(){return q},limit(){return q},upsert(){return Promise.resolve({error:null})},maybeSingle:async()=>({data:table==='broadcasts'?{id:'bc',status:'ON',paused_at:'2026-11-19T18:00:00Z'}:{value:key==='live_automation_chat_rate_pct'?String(rate):key==='live_automation_director_log'?'[]':''}}),then(resolve,reject){const data=table==='live_automation_sessions'?[session]:table==='live_automation_actors'?[actor]:table==='visitor_presence'?[{automation_session_id:session.id}]:table==='live_chat_messages'&&hiddenMemory?hidden:[];return Promise.resolve({data,error:null}).then(resolve,reject)}};return q;}};
 const load=createUiLoader({
 './geminiJson':{callGeminiJson:async prompt=>{prompts.push(prompt);return {text:JSON.stringify(focused&&prompts.length===1?{speaker:'',text:''}:{speaker:'봄이',replyTo:0,text}),note:'ok'}}},
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
