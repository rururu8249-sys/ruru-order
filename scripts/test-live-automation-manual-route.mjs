import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let authorized=false,writes=0,afterCalls=0,rpcArgs=null,settingEnabled=true;
const bc='00000000-0000-4000-8000-000000000001';
const manual={token:'10000000-0000-4000-8000-000000000001',clientId:'20000000-0000-4000-8000-000000000001',requestId:'30000000-0000-4000-8000-000000000001'};
const db={from(table){let single=false;
 const q={select(){return q},eq(){return q},is(){return q},order(){return q},limit(){return q},maybeSingle(){single=true;return q},insert(){writes++;return q},single(){single=true;return q},then(resolve,reject){
 const rows=table==='settings'?[{value:JSON.stringify({enabled:settingEnabled,words:[]})}]:table==='broadcasts'?[{id:bc,status:'ON'}]:table==='customers'?[{id:1,youtube_nickname:'operator'}]:[];
 return Promise.resolve({data:single?rows[0]??null:rows,error:null}).then(resolve,reject)}};return q},
 async rpc(name,args){rpcArgs={name,args};return {data:{id:12,broadcast_id:bc,nickname:'selected',body:args.p_body,created_at:new Date().toISOString()},error:null}}};
const load=createUiLoader({
 'next/server':{NextResponse:{json:(d,i)=>new Response(JSON.stringify(d),i)},after:()=>afterCalls++},
 '@/lib/youtube':{getServiceClient:()=>db},
 '@/lib/liveChatBotServer':{runLiveChatBot:()=>{throw Error('bot side effect')}},
 '@/lib/productIntroServer':{},'@/lib/liveChatProductCommandServer':{},
 '@/lib/liveChatEmojiServer':{},
 '@/lib/liveChatServer':{chatRoleOfKakao:async()=>({isMod:true,badge:'crown'})},
 '@/lib/liveChatSession':{chatIdentityFromRequest:()=>null,sameChatOrigin:r=>r.headers.get('origin')==='https://shop.test'},
 '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>authorized?{sub:'owner'}:null},
});
const route=load('app/api/live-chat/route.ts');
const req=(extra={},origin='https://shop.test')=>({headers:new Headers({origin}),nextUrl:new URL('https://shop.test/api/live-chat'),json:async()=>({kakao_id:'1',bc,body:'hello',manual,...extra})});
let r=await route.POST(req());assert.equal(r.status,403,'unauthorized actor selection must not fall through as normal chat');
authorized=true;r=await route.POST(req({},'https://elsewhere.test'));assert.equal(r.status,403);
r=await route.POST(req({manual:{...manual,token:'forged'}}));assert.equal(r.status,400);
r=await route.POST(req({body:'/product'}));assert.equal(r.status,403,'actor selection carries no admin command powers');
settingEnabled=false;r=await route.POST(req());assert.equal(r.status,403);settingEnabled=true;
r=await route.POST(req());assert.equal(r.status,200);
assert.equal(rpcArgs.name,'live_automation_manual_send');assert.equal(rpcArgs.args.p_operator,'admin:owner');
assert.equal(rpcArgs.args.p_broadcast,bc);assert.equal(rpcArgs.args.p_token,manual.token);
assert.equal(writes,0,'manual messages use the atomic shared table RPC, never an unguarded insert');
assert.equal(afterCalls,0,'manual actor messages cannot trigger automatic bot replies');
console.log('PASS common chat route authenticates manual ownership, keeps broadcast/moderation checks, denies slash commands and suppresses AI side effects');
