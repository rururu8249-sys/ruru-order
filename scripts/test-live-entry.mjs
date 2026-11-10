import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const source=fs.readFileSync('app/order/page.tsx','utf8');
const state=source.match(/const \[liveBootCover, setLiveBootCover\] = useState\((true|false)\);/)[0];
const node=source.slice(source.indexOf('{liveBootCover && !liveWatchShown ? ('),source.indexOf('{liveBootCover && !liveWatchShown ? (')+1500);
const cover=node.slice(0,node.indexOf(') : null}')+10);
const snippet=`const {useState}=React; function Entry(){${state}const liveWatchShown=false;const liveBootSlow=false;return <main><p>홈 화면</p>${cover}</main>};module.exports=Entry;`;
const module={exports:{}};vm.runInNewContext(ts.transpileModule(snippet,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS}}).outputText,{React,module});
assert.match(renderToStaticMarkup(React.createElement(module.exports)),/방송 화면 여는 중|화면 준비 중/,'First server render must cover home before hydration');
assert.ok(source.indexOf('{liveBootCover && !liveWatchShown ? (')<source.indexOf('{hasSavedInfo && broadcastLoaded ? ('),'Cover must not wait for saved customer / broadcast content');
console.log('PASS initial server-rendered entry cover is outside broadcast/customer gate');
const {createLiveReadPrefetch}=createUiLoader()('lib/liveReadPrefetch.ts');
let calls=[],release;const request=()=>new Promise(r=>{release=r;});const loader=createLiveReadPrefetch(async url=>{calls.push(url);return request();});
loader.preload('/chat?bc=a');const first=loader.take('/chat?bc=a');assert.equal(calls.length,1);release({ok:true,messages:[1]});assert.deepEqual(await first,{ok:true,messages:[1]});
const next=loader.take('/chat?bc=a');assert.equal(calls.length,2,'Consumed preload must not become stale permanent cache');release({ok:true,messages:[2]});assert.deepEqual(await next,{ok:true,messages:[2]});
let n=0;const failure=createLiveReadPrefetch(async()=>{n++;if(n===1)throw Error('offline');return {ok:true};});failure.preload('/chat');await new Promise(r=>setImmediate(r));assert.deepEqual(await failure.take('/chat'),{ok:true});assert.equal(n,2);
let now=0;let count=0;const expiry=createLiveReadPrefetch(async url=>({url,count:++count}),()=>now);expiry.preload('/a');await new Promise(r=>setImmediate(r));now=20000;assert.equal((await expiry.take('/a')).count,2,'Expired snapshot must fetch again');expiry.preload('/b');assert.equal((await expiry.take('/c')).url,'/c','Broadcast/user URL must be isolated');
console.log('PASS preloaded reads reused once, failures retry, stale snapshots expire and URLs isolated');
// Execute the actual loadBroadcast prelude with held home settings: critical reads
// must start chat early, without executing Supabase's lazy builders twice.
const L=createUiLoader()('lib/liveWatch.ts');
const begin=source.indexOf('  const loadBroadcast = async () => {');const stop=source.indexOf('    setLiveWatchSetting(',begin);
const prelude=source.slice(begin,stop)+'return true; }; module.exports=loadBroadcast;';
let held=[],started=[],preloaded=[],watchSetting={audience:'all',firstView:'live'};const client={from(table){let key=table;const q={select(){return q;},eq(k,v){if(k==='key')key=v;return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},then(resolve,reject){started.push(key);let result=key==='broadcasts'?{data:{id:'b1',youtube_live_url:'https://youtube.com/watch?v=abcdefghijk'}}:key===L.LIVE_WATCH_KEY?{data:{value:JSON.stringify(watchSetting)}}:null;return (result?Promise.resolve(result):new Promise(r=>held.push(()=>r({data:{value:''}})))).then(resolve,reject);}};return q;}};
const ctx={module:{exports:{}},supabase:client,setProductListState(){},operatorTestAccount:null,LIVE_PAUSED_TEXT_KEY:'paused',...L,window:{sessionStorage:{getItem(){return null;}},localStorage:{getItem(){return 'fixture-user';}}},liveReadPrefetch:{current:{preload(url){preloaded.push(url);}}}};
vm.runInNewContext(ts.transpileModule(prelude,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);let finished=false;const pending=ctx.module.exports().then(()=>finished=true);await new Promise(r=>setImmediate(r));assert.equal(finished,false);assert.deepEqual(preloaded,['/api/live-chat/emoji?kakao_id=fixture-user']);assert.equal(started.filter(x=>x===L.LIVE_WATCH_KEY).length,1);assert.equal(started.filter(x=>x==='broadcasts').length,1);held.forEach(r=>r());await pending;
console.log('PASS actual broadcast loader prefetches before slower home settings; critical queries run once');

assert.ok(!source.includes('preload(`/api/live-chat?bc='),'History must not reuse an older snapshot taken before realtime starts');
console.log('PASS no pre-subscription chat history snapshot');

for(const setting of [{audience:'admin',firstView:'live',phones:[]},{audience:'off',firstView:'live'},{audience:'all',firstView:'shop'}]){watchSetting=setting;held=[];preloaded=[];const run=ctx.module.exports();await new Promise(r=>setImmediate(r));assert.equal(preloaded.length,0,'Excluded/shop viewers must not prefetch');held.forEach(r=>r());await run;}
console.log('PASS beta-excluded, feature-off and shop-first viewers make no speculative reads');
// Exercise the real cover-resolution effect while the operator read is pending.
const effectStart=source.indexOf('  useLayoutEffect(() => {\n    if (!liveBootCover || !broadcastLoaded) return;');
const effectEnd=source.indexOf('\n  useEffect(() => {',effectStart);
const effect=source.slice(effectStart,effectEnd);let released=false;
const roleContext={useLayoutEffect(fn){fn();},liveBootCover:true,broadcastLoaded:true,hasSavedInfo:true,isBroadcastOn:true,liveWatchVideoId:'abcdefghijk',liveWatchSetting:{audience:'admin'},liveWatchUsable:false,liveWatchShown:false,liveViewOn:null,liveViewerRolePhone:null,customerPhone:'01011112222',normalizePhone:v=>v,setLiveBootCover(v){released=!v;}};
vm.runInNewContext(effect,roleContext);assert.equal(released,false,'Pending operator eligibility must keep cover');
roleContext.liveViewerRolePhone=roleContext.customerPhone;vm.runInNewContext(effect,roleContext);assert.equal(released,true,'Confirmed excluded viewer must see home');
released=false;roleContext.liveWatchUsable=true;vm.runInNewContext(effect,roleContext);assert.equal(released,false,'Eligible viewer waits for live view selection');
roleContext.liveWatchShown=true;vm.runInNewContext(effect,roleContext);assert.equal(released,true,'Live view replaces cover');
console.log('PASS delayed operator eligibility, excluded viewer and live selection cover transitions');
