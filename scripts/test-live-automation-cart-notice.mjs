import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let external=0;const calls=[];
let enabled=true;
const sb={from(table){assert.equal(table,'settings');let key;const q={select(){return q},eq(k,v){key=v;return q},async maybeSingle(){return {data:{value:JSON.stringify(key==='live_chat_bot_v1'?{enabled:true,cart:enabled}:{enabled:true})},error:null}}};return q},async rpc(name,args){calls.push({name,args});return {data:1,error:null}}};
const announce=createUiLoader({
 '@/lib/liveChatBotServer':{loadCandidates:async()=>{throw Error('unnecessary catalog read')}},
 '@/lib/youtube':{readActiveBroadcastId:async()=>{external++;return 'bc'},postOrderChatEverywhere:async()=>{external++;return {}}},
})('lib/liveCartAnnounceServer.ts').announceAutomationCart;
const input={actionId:'action',leaseToken:'lease',revision:3,nickname:'입금확인용',sessionKey:'live-auto:cart',lines:[{productId:'10',productName:'니트',color:'블랙',size:'M',unitPrice:190000}]};
await announce(sb,input);
assert.equal(calls.length,1);assert.equal(calls[0].name,'live_automation_announce_cart');
assert.equal(calls[0].args.p_action,'action');assert.equal(calls[0].args.p_lease,'lease');assert.equal(calls[0].args.p_revision,3);
assert.match(calls[0].args.p_body,/🛍️ .*\*.*님 장바구니 담음 · 니트 블랙\/M · 190,000원/);
assert.match(calls[0].args.p_ref,/^c:[0-9a-f]{8}~10\|니트$/);
enabled=false;await announce(sb,input);assert.equal(calls.length,1,'cart notification setting is respected');
assert.equal(external,0,'rehearsal notices never relay to YouTube');
console.log('PASS saved-cart notice formatting, identity authorization arguments, settings and no external relay');
