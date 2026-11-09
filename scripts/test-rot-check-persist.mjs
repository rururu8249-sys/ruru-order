// [2026-11-09] 방송 상품 탭 줄 체크 — 「수정」으로 창이 닫혔다 다시 열려도 체크가 남고, 폼이 세부상품 이름을 바꾸면 체크 키도 따라간다
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const listeners=new Map();
globalThis.window={innerWidth:1200,addEventListener(t,f){(listeners.get(t)||listeners.set(t,new Set()).get(t)).add(f);},removeEventListener(t,f){listeners.get(t)?.delete(f);},dispatchEvent(e){for(const f of [...(listeners.get(e.type)||[])])f(e);return true;},localStorage:{getItem:()=>null,setItem(){}}};
globalThis.document={querySelector:()=>null};
globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options?.detail;}};
globalThis.Event=class {constructor(type){this.type=type;}};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async()=>{}}}});
const products=[{id:1,product_name:'브랜드',price:129000,product_note:{brand_group:{enabled:true,detail_options:{A:{sizes:['M']},B:{sizes:['M']}}}}}];
const makeQuery=table=>{let single=false;const q=new Proxy({}, {get:(_,key)=>key==='then'?(resolve=>Promise.resolve({data:table==='products'?products:table==='broadcast_products'?[{product_id:1,sort_order:0}]:table==='broadcasts'?(single?{widget_pin_mode:'auto'}:[{id:42,public_title:'검증 방송',status:'ON',started_at:'2026-10-05'}]):[],error:null}).then(resolve)):(()=>{if(key==='maybeSingle')single=true;return q;})});return q;};
let savedRotation=null;
globalThis.fetch=async(url,options)=>{if(String(url).includes('widget-library')&&options?.body){const b=JSON.parse(options.body);if(b.action==='saveRotation'){savedRotation=b.rotation;return {ok:true,json:async()=>({ok:true,rotation:b.rotation})};}}return {ok:true,json:async()=>String(url).includes('product-brand-catalog')?{links:[]}:{ok:true,history:[],rotation:{mode:'all',paused:false,targets:[]}}};};
const mod=createUiLoader({'./WidgetProductLibraryPanel.module.css':{default:{}},'@/lib/supabase':{supabase:{from:makeQuery}},'@/lib/adminToast':{showAdminToast(){}},'@/lib/adminCatalogWrite':{adminCatalogWrite:async payload=>({data:payload.values,error:null})},'./liveBroadcastController':{setBroadcastFeedNotice:async()=>{}}})('components/admin-live/AdminLiveProductManagePopup.tsx');
const Panel=mod.default;
const mount=async()=>{let t;await act(async()=>{t=Renderer.create(React.createElement(Panel,{embedded:true,initialTab:'broadcast',activeBroadcastId:42,onClose(){}}));});return t;};
const checks=(t)=>t.root.findAll(n=>n.type==='input'&&n.props.type==='checkbox'&&String(n.props['aria-label']||'').endsWith(' 체크'));
const checkOf=(t,label)=>checks(t).find(c=>c.props['aria-label']===label);
let tree=await mount();
// 묶음 펼치기(세부상품 줄 보이게) — 묶음 줄 버튼에 「펼치기」 역할이 있으면 누르고, 없으면 이미 펼쳐진 것
const expand=async(t)=>{const b=t.root.findAllByType('button').find(b=>String(b.props['aria-label']||'').endsWith('세부상품 펼치기'));if(b)await act(async()=>b.props.onClick({stopPropagation(){}}));};
await expand(tree);
assert.ok(checkOf(tree,'A 체크'),'detail A checkbox visible');
await act(async()=>checkOf(tree,'A 체크').props.onChange());
assert.equal(checkOf(tree,'A 체크').props.checked,true);
// 창 닫힘(수정 → onClose 로 언마운트) → 다시 열기
await act(async()=>tree.unmount());
tree=await mount();
await expand(tree);
assert.equal(checkOf(tree,'A 체크').props.checked,true,'check survives close/reopen');
// 폼이 A→A2 로 이름을 바꿨다고 알림 → 체크 키가 따라감
products[0].product_note.brand_group.detail_options={A2:{sizes:['M']},B:{sizes:['M']}};
await act(async()=>{window.dispatchEvent(new CustomEvent('ruru-widget-rotation-renamed',{detail:{productId:'1',renames:[{from:'A',to:'A2'}]}}));window.dispatchEvent(new Event('ruru-live-product-updated'));});
assert.equal(checkOf(tree,'A2 체크')?.props.checked,true,'renamed detail stays checked');
// 체크한 것만 순환 → 새 이름으로 저장
const btn=tree.root.findAllByType('button').find(b=>b.children.includes('이것만 순환')&&b.props.title?.includes('체크한'));
await act(async()=>btn.props.onClick({stopPropagation(){}}));
assert.deepEqual(savedRotation.targets,[{productId:'1',detailName:'A2'}]);
console.log('PASS rot check persists across reopen and follows renames');
