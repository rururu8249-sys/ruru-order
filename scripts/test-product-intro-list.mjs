import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader(),{productIntroKey,readProductIntroIndex}=load('lib/productIntroServer.ts');
const bc='00000000-0000-0000-0000-000000000001',video='abc_defghij';
const intro={videoId:video,seconds:120,capturedAt:Date.now(),recordedAt:new Date().toISOString()};
const target={productId:'1',detailName:'MC-335'},hidden={productId:'2',detailName:'hidden'};
let rows=[{key:productIntroKey(bc,video,target),value:JSON.stringify(intro)},{key:productIntroKey(bc,video,hidden),value:JSON.stringify(intro)}];
let status='ON',broadcastVideo=video,fail=false,visible=true,pages=[];
const sb={from(table){
 if(table==='broadcasts')return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{status,youtube_live_url:`https://www.youtube.com/watch?v=${broadcastVideo}`},error:null};}};
 assert.equal(table,'settings');return {
  select(columns){assert.equal(columns,'key,value');return this;},
  like(key,pattern){assert.equal(key,'key');assert.equal(pattern,'product_intro_v1_'.replace(/[\\%_]/g,'\\$&')+'%'+`_${video}_`.replace(/[\\%_]/g,'\\$&')+'%');return this;},
  order(key){assert.equal(key,'key');return this;},
  async range(from,to){pages.push([from,to]);return {data:rows.slice(from,to+1),error:fail?{message:'offline'}:null};},
 };
}};
const api=createUiLoader({
 'next/server':{NextResponse:{json:(data,init)=>new Response(JSON.stringify(data),init)}},
 '@/lib/youtube':{getServiceClient:()=>sb},
 '@/lib/liveChatProductCommandServer':{loadChatCommandProducts:async()=>visible?[target]:[]},
});
const get=async(query=`bc=${bc}&video=${video}&all=1`)=>{const r=await api('app/api/live-chat/product-intro/route.ts').GET({nextUrl:new URL(`https://example.com/api/live-chat/product-intro?${query}`)});return {status:r.status,body:await r.json()};};
assert.deepEqual((await get()).body,{items:[{...target,intro}]});
visible=false;assert.deepEqual((await get()).body,{items:[]});visible=true;
status='OFF';assert.deepEqual((await get()).body,{items:[]});status='ON';
broadcastVideo='12345678901';assert.deepEqual((await get()).body,{items:[]});broadcastVideo=video;
fail=true;assert.equal((await get()).status,503);fail=false;
assert.equal((await get('bc=bad&video=bad&all=1')).status,400);
rows=[...rows,...Array.from({length:999},(_,i)=>({key:`product_intro_v1_${bc}_${video}_bad${i}`,value:'invalid'}))];pages=[];
const index=await readProductIntroIndex(sb,bc,video);
assert.equal(index.size,2);assert.deepEqual(pages,[[0,999],[1000,1999]]);
console.log('PASS bulk API current broadcast/video, visible-only exact targets, no private keys, DB errors, escaped prefix and pagination');
