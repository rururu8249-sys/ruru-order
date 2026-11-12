import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const pending=[];let events,unsubscribed=0;const timers=new Map();let seq=0;
globalThis.window={setTimeout:f=>{timers.set(++seq,f);return seq;},clearTimeout:id=>timers.delete(id),setInterval:()=>99,clearInterval(){}};
globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
globalThis.fetch=(url)=>{assert.match(String(url),/^\/api\/live-watch\/featured\?bc=/);return new Promise(resolve=>pending.push({url:String(url),resolve}));};
const load=createUiLoader({
 './supabase':{supabase:{}},'./liveEvents':{subscribeLiveEvents:(_,handlers)=>{events=handlers;return()=>unsubscribed++;}},
 './useWidgetRotationIndex':{useWidgetRotationIndex:()=>0},
});
const {useLiveFeaturedProducts}=load('lib/useLiveFeaturedProducts.ts');
const items=[{id:'1',name:'첫 상품',priceText:'10원',imageUrl:'',soldOut:false},{id:'2',name:'다음 상품',priceText:'20원',imageUrl:'',soldOut:true}];
let result;function Probe(p){result=useLiveFeaturedProducts(p.id,items,p.enabled);return null;}
let tree;await act(async()=>{tree=Renderer.create(React.createElement(Probe,{id:'A',enabled:true}));});
const last=()=>pending[pending.length-1];
const fire=()=>{events.onCatalog({});const n=pending.length;for(const [id,f] of [...timers]){timers.delete(id);f();}assert.equal(pending.length-n,2,'소식 뒤 바로 + 1.5초 뒤 두 번 물음');assert.match(last().url,/&fresh=1&r=/,'소식 뒤엔 캐시 거치지 않음');};
const ok=(body)=>({ok:true,json:async()=>body});
const response=(request,product,extra={})=>request.resolve(ok({ok:true,enabled:true,config:{mode:'selected',paused:false,targets:[]},targets:[{productId:product,detailName:''}],pinned:false,siteCardOff:false,...extra}));
assert.equal(result.current,null);
await act(async()=>tree.update(React.createElement(Probe,{id:'B',enabled:true})));
await act(async()=>response(pending[0],'1'));assert.equal(result.current,null,'old broadcast response cannot display an old product');
// 서버(위젯 기준)가 고른 상품은 손님 목록에서 품절로 보여도 그대로 표시 — 위젯과 같은 상품
await act(async()=>response(pending[1],'2'));assert.equal(result.current.id,'2');
await act(async()=>fire());
await act(async()=>last().resolve({ok:false,json:async()=>({ok:false})}));assert.equal(result.current,null,'failed refresh cannot leave a stale card');
await act(async()=>fire());
await act(async()=>response(last(),'1',{siteCardOff:true}));assert.equal(result.current.id,'1');assert.equal(result.siteCardOff,true);
await act(async()=>tree.update(React.createElement(Probe,{id:'B',enabled:false})));assert.equal(result.current,null);assert.equal(result.products.length,0);
await act(async()=>tree.update(React.createElement(Probe,{id:'B',enabled:true})));assert.equal(result.current,null,'re-enable waits for fresh state');
await act(async()=>response(last(),'2'));assert.equal(result.current.id,'2');
// 목록에 없는 상품(손님 화면에서 숨긴 세부상품)은 다른 상품으로 대신하지 않는다
await act(async()=>fire());
await act(async()=>response(last(),'999'));assert.equal(result.current,null);
await act(async()=>tree.unmount());assert.equal(unsubscribed>0,true);
console.log('live featured hook: server list, stale response, failure, missing target OK');
