import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window={innerWidth:1200,addEventListener(){},removeEventListener(){},dispatchEvent(){},localStorage:{getItem:()=>null,setItem(){}}};
globalThis.document={querySelector:()=>null};
globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options?.detail;}};
let copied='',edited,chat,writes=[];
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{copied=value;}}}});
window.dispatchEvent=event=>{if(event.type.startsWith('ruru-edit'))edited=event;};
const products=[{id:1,product_name:'브랜드',price:129000,product_note:{brand_group:{enabled:true,detail_options:{OLD:{sizes:['M']}}}}},{id:2,product_name:'원본 임시',price:39000,image_url:'actual.jpg',stock:7,color_options:['베이지'],size_options:['S']}];
const links=[{sourceId:'2',parentId:'1',detailName:'NEW',originalName:'원본 임시',movedAt:'2026-10-05'}];
const makeQuery=table=>{let single=false;const q=new Proxy({}, {get:(_,key)=>key==='then'?(resolve=>Promise.resolve({data:table==='products'?products:table==='broadcast_products'?[{product_id:1,sort_order:0},{product_id:2,sort_order:1}]:table==='broadcasts'?(single?{widget_pin_mode:'auto'}:[{id:42,public_title:'검증 방송',status:'ON',started_at:'2026-10-05'}]):[],error:null}).then(resolve)):(()=>{if(key==='maybeSingle')single=true;return q;})});return q;};
globalThis.fetch=async(url,options)=>{if(String(url)==='/api/chat-orders/current')chat=JSON.parse(options.body);return {ok:true,json:async()=>String(url).includes('product-brand-catalog')?{links}:{ok:true,history:[],rotation:{mode:'all',paused:false,targets:[]}}};};
const Panel=createUiLoader({'./WidgetProductLibraryPanel.module.css':{default:{}},'@/lib/supabase':{supabase:{from:makeQuery}},'@/lib/adminToast':{showAdminToast(){}},'@/lib/adminCatalogWrite':{adminCatalogWrite:async payload=>{writes.push(payload);return {data:payload.values,error:null};}},'./liveBroadcastController':{setBroadcastFeedNotice:async()=>{}}})('components/admin-live/AdminLiveProductManagePopup.tsx').default;
let tree;
await act(async()=>{tree=Renderer.create(React.createElement(Panel,{embedded:true,initialTab:'broadcast',activeBroadcastId:42,initialSearch:'NEW',onClose(){}}));});
// [2026-11-09] 줄 = 「순환에 넣기」 주동작 + 「⋯」 더보기(소개·안내글만 복사·수정). 연결 세부상품 NEW 가 검색으로 보여야 한다.
const more=(label)=>tree.root.findAllByProps({'aria-label':`${label} 더보기`}).filter(n=>n.type==='button');
const openMore=async(label)=>{await act(async()=>more(label)[0].props.onClick({stopPropagation(){}}));return tree.root.findAllByProps({role:'menuitem'});};
const menuItem=(items,label)=>items.find(b=>b.children.includes(label));
assert.equal(more('NEW').length,1,'search must find linked detail through broadcast-contained brand');
// RowMoreMenu 는 fragment 라 버튼의 parent = 컴포넌트, 그 parent = 줄
const rowOf=(label)=>more(label)[0].parent.parent.parent;
// 「소개」는 ⋯ 안 — 고정 + 채팅 현재상품 + 안내문 복사(a2-6/a2-10 과 같은 broadcastOneClick)
let items=await openMore('NEW');
await act(async()=>menuItem(items,'소개').props.onClick({stopPropagation(){}}));
const pin=writes.find(write=>write.values?.widget_pin_mode==='pin');
assert.deepEqual(pin.values,{widget_pin_mode:'pin',widget_pin_product_id:'2',widget_pin_detail_name:null});
assert.deepEqual(chat,{productId:'2',productName:'NEW',detailName:''});
// 소개 중인 세부 줄은 목록에 남고 「소개 중」 배지, ⋯ 안에 「소개 끝」
assert.ok(rowOf('NEW').findAllByType('span').some(span=>span.children.includes('소개 중')),'pinned detail row shows 소개 중 badge');
items=await openMore('NEW');
assert.ok(menuItem(items,'소개 끝'),'pinned detail row offers 소개 끝 in menu');
await act(async()=>menuItem(items,'수정').props.onClick({stopPropagation(){}}));
assert.ok(copied.includes('39,000원'));assert.equal(copied.includes('129,000원'),false);
assert.equal(edited.detail.id,2);assert.equal(edited.detail.product_name,'원본 임시');
let savedRotation=null;
globalThis.fetch=async(url,options)=>{if(String(url)==='/api/chat-orders/current')chat=JSON.parse(options.body);if(String(url).includes('widget-library')&&options?.body){const b=JSON.parse(options.body);if(b.action==='saveRotation'){savedRotation=b.rotation;return {ok:true,json:async()=>({ok:true,rotation:b.rotation})};}}return {ok:true,json:async()=>String(url).includes('product-brand-catalog')?{links}:{ok:true,history:[],rotation:savedRotation??{mode:'all',paused:false,targets:[]}}};};
const btns=(label)=>tree.root.findAllByType('button').filter(button=>button.children.includes(label));
const checks=()=>tree.root.findAll(n=>n.type==='input'&&n.props.type==='checkbox'&&String(n.props['aria-label']||'').endsWith(' 체크'));
// 브랜드 줄 ⋯ 「이 브랜드만 순환」 = 부모 1 + 연결 세부상품 원래 id 2
items=await openMore('브랜드');
await act(async()=>menuItem(items,'이 브랜드만 순환').props.onClick({stopPropagation(){}}));
assert.deepEqual(savedRotation,{mode:'selected',paused:false,targets:[{productId:'1',detailName:''},{productId:'2',detailName:''}]},'brand-only = parent + linked source ids');
assert.ok(tree.root.findAll(n=>n.type==='span'&&n.children.join('')==='전부 순환 중').length>=1,'row shows 전부 순환 중');
// 세부상품 체크(이미 도는 중) → 띠 버튼은 「순환에서 빼기」
await act(async()=>{const c=checks();c[c.length-1].props.onChange();});
assert.equal(btns('순환에 넣기').filter(b=>b.props.title?.includes('체크한')).length,0,'checked-all-rotating shows 빼기, not 넣기');
await act(async()=>btns('순환에서 빼기').find(b=>b.props.style?.color==='var(--color-danger-tx)').props.onClick());
assert.deepEqual(savedRotation.targets,[{productId:'1',detailName:''}],'checked detail removed from rotation');
// 일부만 도는 중 → 체크 → 「순환에 넣기」 = 기존 목록 유지 + 더함
await act(async()=>{const c=checks();c[c.length-1].props.onChange();});
await act(async()=>btns('순환에 넣기').find(b=>b.props.title?.includes('체크한')).props.onClick());
assert.deepEqual(new Set(savedRotation.targets.map(t=>t.productId)),new Set(['1','2']),'add keeps existing and appends checked');
assert.equal(savedRotation.mode,'selected');
// 묶음 줄 체크 → 「이것만 순환」
await act(async()=>checks()[0].props.onChange());
await act(async()=>btns('이것만 순환').find(b=>b.props.title?.includes('체크한')).props.onClick());
assert.deepEqual(new Set(savedRotation.targets.map(t=>t.productId)),new Set(['1','2']),'checked-only replaces list');
// [2026-11-09] 고른 것만 돌 땐 띠에 「전체 상품 순환」 바로(펼치기 없음) · 칩 바로 보임
assert.ok(!tree.root.findAllByType('button').some(b=>String(b.children[0]).startsWith('순환 목록')),'순환 목록 펼치기 버튼 없음');
await act(async()=>btns('전체 상품 순환')[0].props.onClick());
assert.equal(savedRotation.mode,'all','전체 상품 순환 = all mode');
// [2026-11-09] 줄 주동작: 전부 도는 중 → 세부 줄 「이것만 순환」 = 그 줄만 저장 + 안내글 복사
copied='';
const rowBtn=(label)=>rowOf(label).findAllByType('button').find(b=>['순환에 넣기','순환에서 빼기','이것만 순환'].includes(b.children[0]));
assert.equal(rowBtn('NEW').children[0],'이것만 순환');
await act(async()=>rowBtn('NEW').props.onClick({stopPropagation(){}}));
assert.deepEqual(savedRotation.targets,[{productId:'2',detailName:''}],'row action saves only that detail');
assert.ok(copied.includes('39,000원'),'row action copies announce line');
assert.equal(rowBtn('NEW').children[0],'순환에서 빼기','row now shows 빼기');
await act(async()=>rowBtn('NEW').props.onClick({stopPropagation(){}}));
assert.equal(savedRotation.mode,'all','removing the only one → all');
await act(async()=>tree.unmount());
console.log('PASS rendered linked broadcast search, pin, chat, rotation targets and original editor identity');
// A stale list row must never initialize the stock editor: fetch row + version together.
const listeners=new Map();
window.addEventListener=(name,listener)=>listeners.set(name,listener);
window.removeEventListener=name=>listeners.delete(name);
const alerts=[];window.alert=message=>alerts.push(message);
let snapshotFailure=false;
globalThis.fetch=async()=>({ok:!snapshotFailure,json:async()=>snapshotFailure?{error:'최신 상태 없음'}:{product:{id:2,product_name:'원본 임시',stock:5},version:'a'.repeat(32),parent:products[0]}});
const Form=props=>React.createElement('editor-fixture',props);
const Drawer=createUiLoader({'./quick-product/QuickProductFastForm':{default:Form}})('components/admin-live/AdminLiveQuickProductDrawer.tsx').default;
await act(async()=>{tree=Renderer.create(React.createElement(Drawer,{activeBroadcastId:42}));});
await act(async()=>{listeners.get('ruru-edit-quick-product')({detail:products[1]});});
assert.equal(tree.root.findByType('editor-fixture').props.initialProduct.stock,5);
assert.equal(tree.root.findByType('editor-fixture').props.initialProduct.__catalog_edit_version,'a'.repeat(32));
assert.equal(tree.root.findByType('editor-fixture').props.initialProduct.__linked_brand_parent.id,1);
await act(async()=>{listeners.get('ruru-close-quick-product-panel')();});
snapshotFailure=true;
await act(async()=>{listeners.get('ruru-edit-quick-product')({detail:products[1]});});
assert.equal(tree.root.findAllByType('editor-fixture').length,0,'failed fresh read cannot fall back to stale stock');
assert.deepEqual(alerts,['최신 상태 없음']);
await act(async()=>tree.unmount());
assert.equal(listeners.size,0);
console.log('PASS rendered editor loads atomic fresh snapshot and fails closed');
