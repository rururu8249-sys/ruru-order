import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader({});
const {captureProductIntro,parseProductIntro,validateIntroCapture,createIntroReplay}=load('lib/productIntro.ts');
const now=1800000000000,video='abcdefghijk';
const sample={videoId:video,t:120,state:1,live:true,edge:121,start:0,at:now-200,atLiveHead:true};
assert.deepEqual(captureProductIntro(sample,video,now),{videoId:video,seconds:115,capturedAt:now});
for(const patch of [{at:now-6000},{at:now+100},{t:NaN},{t:0},{state:2},{live:false},{videoId:'12345678901'},{edge:190,atLiveHead:false}]) assert.equal(captureProductIntro({...sample,...patch},video,now),null,JSON.stringify(patch));
const capture={videoId:video,seconds:115,capturedAt:now};
assert.deepEqual(validateIntroCapture(capture,video,now),capture);
for(const patch of [{seconds:-1},{seconds:'5'},{seconds:Infinity},{capturedAt:now-20000},{capturedAt:now+20000},{videoId:'12345678901'}]) assert.equal(validateIntroCapture({...capture,...patch},video,now),null);
assert.equal(parseProductIntro(JSON.stringify({...capture,recordedAt:new Date(now).toISOString()}),video).seconds,115);
assert.equal(parseProductIntro({...capture,recordedAt:'bad'},video),null);
assert.equal(parseProductIntro({...capture,recordedAt:new Date(now).toISOString()},'otherVideo1'),null);

// Exercise a real controller, with deterministic player packets and clock.
let clock=now,commands=[],status=[];
const replay=createIntroReplay({now:()=>clock,seek:t=>commands.push(t),status:s=>status.push(s)});
replay.start(115);
assert.equal(commands.length,0,'wait for fresh player readiness');
replay.info({currentTime:300,playerState:1,progressState:{seekableStart:0,seekableEnd:320}});
assert.deepEqual(commands,[115]);
replay.info({currentTime:300,playerState:3});
assert.notEqual(status.at(-1),'playing','old time is not arrival');
replay.info({currentTime:116,playerState:1});
assert.equal(status.at(-1),'playing');
replay.start(5);replay.info({currentTime:300,playerState:1,progressState:{seekableStart:90,seekableEnd:320}});
assert.equal(status.at(-1),'unavailable','DVR expired point must not seek');
assert.deepEqual(commands,[115]);
replay.start(100);clock+=13000;replay.tick();assert.equal(status.at(-1),'unavailable');
replay.cancel();replay.info({currentTime:300,playerState:1,duration:400});assert.deepEqual(commands,[115]);
console.log('PASS capture validation, video binding, ready/arrival/expired DVR/timeout/cancel');

const {saveProductIntros,readProductIntro,productIntroKey}=load('lib/productIntroServer.ts');
let rows=new Map(),fail=false;
const db={from(table){assert.equal(table,'settings');let op='read',values;const filters=[];
 const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},maybeSingle(){return q;},insert(v){op='insert';values=v;return q;},update(v){op='update';values=v;return q;},then(resolve,reject){
  if(fail)return Promise.resolve({error:{message:'offline'},data:null}).then(resolve,reject);
  const key=op==='insert'?values.key:filters.find(([k])=>k==='key')?.[1];let data=rows.get(key)||null,error=null;
  if(op==='insert'){if(data)error={code:'23505'};else {data=values;rows.set(key,values);}}
  if(op==='update'){if(data&&filters.every(([k,v])=>data[k]===v)){data={...data,...values};rows.set(key,data);}else data=null;}
  return Promise.resolve({data,error}).then(resolve,reject);
 }};return q;}};
await saveProductIntros(db,'bc',[{productId:'1',detailName:'MC-310'},{productId:'1',detailName:'MC-311'}],capture);
assert.equal(rows.size,2);
await saveProductIntros(db,'bc',[{productId:'1',detailName:'MC-310'}],{...capture,seconds:200,capturedAt:now+1000});
assert.equal((await readProductIntro(db,'bc',video,{productId:'1',detailName:'MC-310'})).seconds,200);
assert.equal((await readProductIntro(db,'bc',video,{productId:'1',detailName:'MC-311'})).seconds,115);
assert.equal(await readProductIntro(db,'bc','12345678901',{productId:'1',detailName:'MC-310'}),null);
assert.notEqual(productIntroKey('bc',video,{productId:'1',detailName:'MC-310'}),productIntroKey('bc2',video,{productId:'1',detailName:'MC-310'}));
fail=true;await assert.rejects(()=>saveProductIntros(db,'bc',[{productId:'1',detailName:'MC-310'}],capture));
console.log('PASS independent product/detail records, replacement, broadcast/video isolation, persistence failure');

let visible=true,broadcastVideo=video,statusOn='ON';fail=false;
const publicLoad=createUiLoader({
 'next/server':{NextResponse:{json:(data,init)=>new Response(JSON.stringify(data),init)}},
 '@/lib/youtube':{getServiceClient:()=>({from:table=>table==='broadcasts'?{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{status:statusOn,youtube_live_url:`https://www.youtube.com/watch?v=${broadcastVideo}`},error:null})}:db.from(table)})},
 '@/lib/liveChatProductCommandServer':{loadChatCommandProducts:async()=>visible?[{productId:'1',detailName:'MC-310'}]:[]},
});
const bc='00000000-0000-0000-0000-000000000001';
await saveProductIntros(db,bc,[{productId:'1',detailName:'MC-310'}],capture);
const get=async()=>{const response=await publicLoad('app/api/live-chat/product-intro/route.ts').GET({nextUrl:new URL(`https://example.com/api/live-chat/product-intro?bc=${bc}&video=${video}&product=1&detail=MC-310`)});return response.json();};
assert.equal((await get()).intro.seconds,115);
visible=false;assert.equal((await get()).intro,null);visible=true;
broadcastVideo='12345678901';assert.equal((await get()).intro,null);broadcastVideo=video;
statusOn='OFF';assert.equal((await get()).intro,null);
console.log('PASS real public GET visible catalog/current video/live broadcast gates');

const {introTargetForOptions}=load('lib/productIntro.ts');
assert.deepEqual(introTargetForOptions({productId:'77',parentId:'77',detail:'',color:'MC-310 블랙',hasAxes:false,hasCombo:true}),{productId:'77',detailName:'MC-310 블랙'});
assert.deepEqual(introTargetForOptions({productId:'77',parentId:'77',detail:'MC-311',color:'블랙',hasAxes:true,hasCombo:true}),{productId:'77',detailName:'MC-311'});
assert.deepEqual(introTargetForOptions({productId:'88',parentId:'77',detail:'MC-312',color:'블랙',hasAxes:true,hasCombo:true}),{productId:'88',detailName:''});
assert.deepEqual(introTargetForOptions({productId:'77',parentId:'77',detail:'',color:'블랙',hasAxes:false,hasCombo:false}),{productId:'77',detailName:''});
// An older request completing last must not erase the latest deliberate introduction.
statusOn='ON';
await saveProductIntros(db,bc,[{productId:'1',detailName:'MC-310'}],{...capture,seconds:300,capturedAt:now+2000});
await saveProductIntros(db,bc,[{productId:'1',detailName:'MC-310'}],{...capture,seconds:200,capturedAt:now+1000});
assert.equal((await readProductIntro(db,bc,video,{productId:'1',detailName:'MC-310'})).seconds,300);
console.log('PASS legacy combo/axes/source target mapping and reverse-completion protection');
await Promise.all([
 saveProductIntros(db,bc,[{productId:'1',detailName:'MC-310'}],{...capture,seconds:400,capturedAt:now+3000}),
 saveProductIntros(db,bc,[{productId:'1',detailName:'MC-310'}],{...capture,seconds:500,capturedAt:now+4000}),
]);
assert.equal((await readProductIntro(db,bc,video,{productId:'1',detailName:'MC-310'})).seconds,500);
await Promise.all([
 saveProductIntros(db,bc,[{productId:'9',detailName:''}],{...capture,seconds:600,capturedAt:now+5000}),
 saveProductIntros(db,bc,[{productId:'9',detailName:''}],{...capture,seconds:700,capturedAt:now+6000}),
]);
assert.equal((await readProductIntro(db,bc,video,{productId:'9',detailName:''})).seconds,700);
console.log('PASS overlapping read/update CAS and duplicate insert retry');
