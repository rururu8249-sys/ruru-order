import assert from 'node:assert/strict';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const blank=()=>{};
const store={getItem:()=> '1',setItem:blank,removeItem:blank};
globalThis.window={location:{origin:'https://example.com'},innerHeight:844,innerWidth:390,localStorage:store,sessionStorage:store,addEventListener:blank,removeEventListener:blank,setTimeout:()=>1,clearTimeout:blank,setInterval:()=>1,clearInterval:blank};
globalThis.document={addEventListener:blank,removeEventListener:blank,hidden:false};globalThis.localStorage=store;
let verifications=0;const rpsArgs=[];
const game={state:null,player:null,admin:false,verified:false,winners:[],error:'',busy:false,now:0,action:async()=>{throw Error('unverified must not run an admin action');},verify:()=>verifications++,refresh:async()=>{}};
const load=createUiLoader({
// [2026-11-26] LiveWatchView → useManualAutomationChat 가 진짜 supabase 를 불러 시험용 저장소('1')로 세션 검사를 끝없이 돌던 것 → 가짜 supabase
 '@/lib/supabase':{supabase:{channel(){const c={on(){return c;},subscribe(){return c;}};return c;},removeChannel:async()=>{},from(){const q={select(){return q;},eq(){return q;},in(){return q;},order(){return q;},limit(){return q;},maybeSingle:async()=>({data:null}),then(r){return Promise.resolve({data:[]}).then(r);}};return q;}}},
 '@/components/customer/KakaoExternalOpen':{openOrderInExternalBrowser:blank},
 '@/lib/useIsDesktop':{useIsDesktop:()=>false},
 '@/lib/useLiveFeaturedProducts':{useLiveFeaturedProducts:()=>({products:[],current:null})},
 '@/lib/useReplayProductCard':{useReplayProductCard:()=>({replay:false,products:[],current:null})},
 '@/lib/useLiveGreeting':{useLiveGreeting:()=>({open:false,dismiss:blank})},
 '@/lib/useChatAutoScroll':{useChatAutoScroll:()=>({boxRef:{current:null},contentRef:{current:null},atBottom:true,followLatest:blank})},
 '@/lib/useLiveResume':{useLiveResume:()=>({onAction:blank,returnToLive:blank})},
 '@/lib/useProductIntroPlayer':{useProductIntroPlayer:()=>({})},
 '@/lib/productIntroCatalogClient':{loadProductIntroCatalog:async()=>[],invalidateProductIntroCatalog:blank},
 '@/components/rps/RpsWidget':{RpsWidget:()=>React.createElement('div',{'data-test-rps':true},'game')},
 '@/components/rps/useRpsGame':{useRpsGame:(...args)=>{rpsArgs.push(args);return game;}},
 './rps.css':{},
});
const View=load('components/customer/LiveWatchView.tsx').default;
const props={videoId:'abcdefghijk',title:'test',broadcastId:'A',paused:false,pausedText:'',pinned:null,items:[],cartCount:0,cartTotalText:'0',orderToasts:[],onOpenProduct:blank,onOpenCart:blank,onSwitchToShop:blank,menu:[{key:'me',label:'내정보',onClick:blank}],chat:{messages:[],notice:'',canWrite:true,canModerate:true,canGrant:true,canPin:true,pinned:null,emojis:[],onVerifyIdentity:blank,onModerate:async()=>({ok:true}),onSend:async()=>({ok:true})}};
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?.map(text).join('')??'';
let tree;await act(async()=>{tree=Renderer.create(React.createElement(View,props),{createNodeMock:el=>el.type==='iframe'?{clientWidth:390,clientHeight:700,offsetLeft:0,offsetTop:0}:null});});
const button=label=>tree.root.findAllByType('button').find(b=>text(b)===label);
await act(async()=>tree.root.findAllByType('button').find(b=>/^더보기/.test(b.props['aria-label']||'')).props.onClick()); // [2026-11-26 VER3] 더보기 = 위 오른쪽 ⋮(글자 없음)
// [2026-11-27 사장님 결정] 가위바위보 게임 뺌 — 더보기에 게임 메뉴 없음, 방송 화면은 게임 상태를 묻지 않음(useRpsGame enabled=false)
assert.ok(!button('게임 · 가위바위보'),'game entry removed from More');
assert.ok(button('내정보'));
assert.ok(!button('내 채팅 본인 확인'),'remove duplicate identity item from More');
assert.ok(rpsArgs.length>0 && rpsArgs.every(a=>a[1]===false),'LiveWatchView must call useRpsGame with enabled=false');
await act(async()=>tree.unmount());

// 실제 useRpsGame: enabled=false 면 /api/rps 요청·실시간 구독 0, enabled=true(위젯 등)는 예전처럼 요청
const fetched=[];let channels=0;
globalThis.fetch=async(url)=>{fetched.push(String(url));return {ok:true,headers:{get:()=>null},json:async()=>({ok:false})};};
const hookLoad=createUiLoader({
 '@/lib/supabase':{supabase:{channel(){channels++;const c={on(){return c;},subscribe(){return c;}};return c;},removeChannel:async()=>{}}},
 '@/lib/useLiveChatPrivate':{chatIdentityHeaders:()=>({})},
});
const {useRpsGame}=hookLoad('components/rps/useRpsGame.ts');
function Probe({enabled}){useRpsGame(false,enabled);return null;}
let probe;await act(async()=>{probe=Renderer.create(React.createElement(Probe,{enabled:false}));});
await act(async()=>{await new Promise(r=>setTimeout(r,20));});
assert.equal(fetched.length,0,'disabled hook must not fetch');assert.equal(channels,0,'disabled hook must not subscribe');
await act(async()=>probe.unmount());
await act(async()=>{probe=Renderer.create(React.createElement(Probe,{enabled:true}));});
await act(async()=>{await new Promise(r=>setTimeout(r,20));});
assert.ok(fetched.some(u=>u.includes('/api/rps/state')),'enabled hook still loads state (widget)');assert.equal(channels,1);
await act(async()=>probe.unmount());
console.log('PASS game entry removed, live view does not poll rps, widget hook unchanged');
