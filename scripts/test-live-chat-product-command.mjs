import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader({});
const bot=load('lib/liveChatBot.ts');
const mc={productId:'77',detailName:'MC-335 아이보리',texts:['MC-335 아이보리','MC-335'],line:'MC-335 아이보리 / 190,000원 / 사이즈: 1,2,3,4,5',soldOut:false,sizes:['1','2','3','4','5']};
for(const body of ['몽335','몽클-335','몽클레어335','mc335','MC-335','몽클 335']) assert.equal(bot.pickProductForChat(body,[mc])?.cand.detailName,mc.detailName,body);
const cmd=load('lib/liveChatProductCommand.ts');
for(const body of ['/335','/mc335','/몽335','/몽클-335',' /MC-335 ']) assert.equal(cmd.matchChatProductCommand(cmd.parseChatProductCommand(body),[mc])[0],mc,body);
for(const body of ['335','안녕 /335','/335 사주세요','/335/336','/','/335원']) assert.equal(cmd.parseChatProductCommand(body),null,body);
const pd={...mc,productId:'78',detailName:'PD-335 블랙',texts:['PD-335 블랙','PD-335']};
assert.equal(cmd.matchChatProductCommand('335',[mc,pd]).length,2,'ambiguous number must not pick first');
assert.deepEqual(cmd.matchChatProductCommand('몽335',[mc,pd]),[mc]);
for(const name of ['MC-1335 블랙','MC-3350 블랙','MC-335A 블랙','니트 335cm']) assert.equal(cmd.matchChatProductCommand('335',[{...mc,detailName:name,texts:[name]}]).length,0,name);
console.log('PASS brand aliases and exact slash command matching');

// Exercise the real POST route and command service against an isolated DB double.
const bc='00000000-0000-0000-0000-000000000001';
const brand={id:77,product_name:'몽클레어',price:190000,status:'active',product_note:{brand_group:{enabled:true,detail_options:{'MC-335 아이보리':{sizes:['1','2','3','4','5']}}}},color_options:['MC-335 아이보리']};
let products,listed,links,mod,banned,blocked,enabled,widgetOn,broadcastOn,rateLimited,failTable,writes,botCalls,roleError;
function reset(){products=[brand];listed=[77];links=[];mod=true;banned=false;blocked=false;enabled=true;widgetOn=true;broadcastOn=true;rateLimited=false;failTable='';writes=[];botCalls=0;roleError=false;}
reset();
const sb={from(table){let op='read',value,ids=null,start=0,end=999;const filters=[];
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(){return q;},order(){return q;},limit(){return q;},range(a,b){start=a;end=b;return q;},or(){return q;},maybeSingle(){return q;},single(){return q;},in(k,v){ids=v;return q;},upsert(v){op='upsert';value=v;return q;},update(v){op='update';value=v;return q;},insert(v){op='insert';value=v;return q;},then(resolve,reject){
    if(op!=='read')writes.push({table,op,value,filters});
    const error=failTable===`${table}:${op}`?{message:'DB failure'}:null;
    let data=null;
    if(!error){
      if(op==='insert')data=(Array.isArray(value)?value:[value]).map((row,i)=>({...row,id:501+i,created_at:new Date().toISOString()}));
      else if(op==='update')data=broadcastOn?{id:bc}:null;
      else if(table==='settings')data={value:JSON.stringify({enabled,words:[]})};
      else if(table==='broadcasts')data={id:bc,status:broadcastOn?'ON':'OFF',widget_card_enabled:widgetOn};
      else if(table==='customers')data={id:'customer',youtube_nickname:'관리자',is_blocked:blocked};
      else if(table==='live_chat_bans')data=banned?[{until_at:new Date(Date.now()+60000).toISOString()}]:[];
      else if(table==='live_chat_messages')data=rateLimited?{created_at:new Date().toISOString()}:null;
      else if(table==='broadcast_products'){assert.ok(filters.some(([k,v])=>k==='broadcast_id'&&v===bc));data=listed.slice(start,end+1).map(product_id=>({product_id}));}
      else if(table==='product_brand_links')data=links.slice(start,end+1);
      else if(table==='products')data=products.filter(p=>!ids||ids.includes(String(p.id)));
    }
    return Promise.resolve({data,error}).then(resolve,reject);
  }};return q;
}};
const apiLoad=createUiLoader({
  'next/server':{NextResponse:{json:(data,init)=>new Response(JSON.stringify(data),{status:init?.status??200})},after:fn=>fn()},
  '@/lib/youtube':{getServiceClient:()=>sb},
  '@/lib/liveChatServer':{chatRoleOfKakao:async()=>{if(roleError)throw Error('offline');return {isMod:mod,badge:mod?'mod':null};}},
  '@/lib/liveChatBotServer':{runLiveChatBot:async()=>{botCalls++;}},
});
const route=apiLoad('app/api/live-chat/route.ts');
const send=async (body,target)=>{const res=await route.POST({json:async()=>({kakao_id:'test-actor',bc,body,target})});return {status:res.status,...await res.json()};};
let picked=await send('/',{productId:'77',detailName:'MC-335 아이보리'});
assert.equal(picked.ok,true,'slash picker selects exact broadcast target');
reset();picked=await send('/',{productId:'999',detailName:''});assert.equal(picked.ok,false);assert.equal(writes.length,0);
reset();mod=false;picked=await send('/',{productId:'77',detailName:'MC-335 아이보리'});assert.equal(picked.ok,false);assert.equal(writes.length,0);
reset();
let result=await send('/335');
assert.equal(result.ok,true);assert.equal(result.message.body,'/335');
assert.equal(result.privateCommand,true,'command receipt must be explicitly private');
assert.equal(writes[2].value[0].hidden_by,'command');
assert.ok(writes[2].value[0].hidden_at,'command is hidden before the realtime insert event');
assert.equal(writes[2].value[1].hidden_at,undefined,'product guide stays public');
assert.deepEqual(writes.map(w=>w.table),['settings','broadcasts','live_chat_messages']);
assert.deepEqual(JSON.parse(writes[0].value.value),{mode:'selected',paused:false,targets:[{productId:'77',detailName:'MC-335 아이보리'}]});
assert.equal(writes[0].value.key,`widget_rotation_${bc}`);
assert.deepEqual(writes[1].value,{widget_pin_mode:'auto',widget_pin_product_id:null,widget_pin_detail_name:null});
assert.ok(writes[1].filters.some(([k,v])=>k==='status'&&v==='ON'));
const announcement=writes[2].value[1];
assert.equal(announcement.bot_ref,'p:77|MC-335 아이보리');
assert.match(announcement.body,/MC-335.*190,000원.*1,2,3,4,5/);
assert.equal(botCalls,0,'command posts exactly one guide, bypassing the ordinary bot');
for(const [label,change] of [
 ['non-admin',()=>mod=false],['role lookup failure',()=>roleError=true],['banned',()=>banned=true],['blocked',()=>blocked=true],
 ['disabled chat',()=>enabled=false],['widget off',()=>widgetOn=false],['broadcast off',()=>broadcastOn=false],['rate limit',()=>rateLimited=true],
 ['missing product',()=>listed=[]],['hidden product',()=>products=[{...brand,status:'hidden'}]],
 ['sold out',()=>products=[{...brand,is_soldout:true}]],['ambiguous',()=>{products.push({...brand,id:78,color_options:['PD-335 블랙'],product_note:{combo_mode:true}});listed.push(78);}],
 ['catalog query failure',()=>failTable='products:read'],['relations query failure',()=>failTable='product_brand_links:read'],
]){reset();change();result=await send('/335');assert.equal(result.ok,false,label);assert.equal(writes.length,0,label);}
reset();result=await send('/335 안녕');assert.equal(result.ok,false);assert.equal(writes.length,0);
reset();listed=[77,...Array.from({length:999},(_,i)=>2000+i),78];
products.push({...brand,id:78,color_options:['PD-335 블랙'],product_note:{combo_mode:true}});
result=await send('/335');assert.equal(result.ok,false,'duplicate number beyond the first 1,000 memberships must block selection');assert.match(result.message,/여러 개/);assert.equal(writes.length,0);
reset();failTable='settings:upsert';result=await send('/335');assert.equal(result.ok,false);assert.equal(writes.length,1);
reset();failTable='broadcasts:update';result=await send('/335');assert.equal(result.ok,false);assert.match(result.message,/목록은 저장/);assert.equal(writes.length,2);
reset();failTable='live_chat_messages:insert';result=await send('/335');assert.equal(result.ok,false);assert.match(result.message,/위젯은 변경됐지만/);
// Linked products must target the original independent ID, never a made-up parent detail.
reset();products=[{id:77,product_name:'몽클레어',product_note:{brand_group:{enabled:true}}},{id:88,product_name:'원래 이름',price:190000,size_options:['1','2']}];
links=[{parent_id:77,source_id:88,detail_name:'MC-335 아이보리',original_name:'원래 이름',moved_at:'2026-11-11'}];
result=await send('/몽클-335');assert.equal(result.ok,true);
assert.deepEqual(JSON.parse(writes[0].value.value).targets,[{productId:'88',detailName:''}]);
assert.equal(writes[2].value[1].bot_ref,'p:88|');assert.match(writes[2].value[1].body,/MC-335/);
// A candidate from a previous request is never reused after the catalog changes.
listed=[];writes=[];result=await send('/335');assert.equal(result.ok,false);assert.equal(writes.length,0);
reset();mod=false;result=await send('mc335');assert.equal(result.ok,true);assert.equal(botCalls,1);assert.deepEqual(writes.map(w=>w.table),['live_chat_messages']);
console.log('PASS actual chat POST: moderator guards, fresh catalog, unique/hidden/sold-out/linked targets, pin clear, guide, failures and ordinary chat');
