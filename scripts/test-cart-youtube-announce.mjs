import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
async function scenario(change={}) {
 const cfg={bc:'b1',active:'b1',chat:true,bot:true,cart:true,nick:'루루동이',blocked:false,saveFail:false,youtubeFail:false,...change};
 const site=[],youtube=[],writes=[];
 const sb={from(table){let key='',value;const q={select(){return q;},eq(k,v){if(k==='key')key=v;return q;},order(){return q;},in(){return q;},gte(){return q;},limit(){return q;},maybeSingle(){return q;},insert(v){value=v;return q;},then(resolve,reject){
  if(value){writes.push(table);if(!cfg.saveFail)site.push(value);return Promise.resolve({error:cfg.saveFail?{message:'failed'}:null}).then(resolve,reject);}
  const data=table==='live_chat_messages'?[]:table==='broadcasts'?{id:cfg.bc}:table==='customers'?{youtube_nickname:cfg.nick,is_blocked:cfg.blocked}:{value:JSON.stringify(key==='live_chat_bot_v1'?{enabled:cfg.bot,cart:cfg.cart}:{enabled:cfg.chat})};
  return Promise.resolve({data,error:null}).then(resolve,reject);
 }};return q;}};
 const cand={productId:'1',detailName:'BB-58',name:'BB-58',texts:['BB-58'],sizes:['S','M','L'],priceMin:195000,priceMax:195000,soldOut:false};
 const announce=createUiLoader({
  '@/lib/liveChatBotServer':{loadCandidates:async()=>[cand]},
  '@/lib/youtube':{readActiveBroadcastId:async()=>cfg.active,postOrderChatEverywhere:async text=>{youtube.push(text);if(cfg.youtubeFail)throw Error('offline');return {main:{ok:true},second:{ok:false,skipped:true}};}},
 })('lib/liveCartAnnounceServer.ts').announceNewCartLines;
 const input={sessionKey:'test-session',kakaoId:'123',lines:[{productId:'1',productName:'BB-58',color:'',size:'L',unitPrice:195000}]};
 await announce(sb,input);
 return {site,youtube,writes,repeat:()=>announce(sb,input)};
}
let r=await scenario();
assert.equal(r.site.length,1);assert.equal(r.youtube.length,0,'2026-11-13: cart notice is NOT posted to YouTube (quota)');
assert.match(r.site[0].body,/🛍️ 루.*\*.*님 장바구니 담음 · BB-58 L · 195,000원/);
assert.ok(!r.site[0].body.includes('루루동이'));assert.deepEqual(r.writes,['live_chat_messages']);
await r.repeat();assert.equal(r.youtube.length,0);
for(const change of [{chat:false},{bot:false},{cart:false},{bc:''},{nick:''},{blocked:true},{saveFail:true}]){r=await scenario(change);assert.equal(r.youtube.length,0,JSON.stringify(change));}
r=await scenario({active:'b2'});assert.equal(r.site.length,1);assert.equal(r.youtube.length,0);
console.log('PASS cart notice: site chat only (no YouTube post), masked text, switches/throttle');
