// [2026-10-21 a2-2] 상품 등록 폼 새 배치(?preview=a2) — 그려지는지 + 같은 상품을 저장하면 기존 화면과 «같은 값»이 저장되는지.
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const store = new Map();
globalThis.window = {innerWidth:1200,addEventListener(){},removeEventListener(){},dispatchEvent(){},location:{search:''},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}};
globalThis.document = {addEventListener(){},removeEventListener(){}};
let saved;
const {default:Form} = createUiLoader({'@/lib/supabase':{supabase:{}},'@/lib/adminCatalogWrite':{adminCatalogWrite:async payload=>{saved=payload;return {data:{id:9100},error:null};}},'@/lib/adminToast':{showAdminToast(){}},'@/lib/adminConfirm':{showAdminConfirm:async()=>true}})('components/admin-live/quick-product/QuickProductFastForm.tsx');
const text=node=>node.children.map(child=>typeof child==='string'?child:typeof child==='object'?text(child):'').join('');
const product = {id:9100,__catalog_edit_version:'b'.repeat(32),product_name:'스웨이드 로퍼',price:59000,stock:3,color_options:['블랙','베이지'],size_options:['240','250'],
  product_note:JSON.stringify({stock_management_enabled:true,stock_mode:'option',category:'신발',spec_chips:['소가죽'],color_swatches:{'블랙':'#111111'},suggestion_keywords:['로퍼'],purchase_limit_enabled:true,purchase_limit_qty:2,order_notice_mode:'instant',
    stock_variants:[{color:'블랙',size:'240',stock:1},{color:'블랙',size:'250',stock:1},{color:'베이지',size:'240',stock:1},{color:'베이지',size:'250',stock:0}]}),badge_types:['direct','special']};
async function saveWith(search){
  window.location.search = search; saved = undefined;
  let r; await act(async()=>{r=TestRenderer.create(React.createElement(Form,{activeBroadcastId:null,initialProduct:product}));});
  const isV2 = r.root.findAllByProps({id:'v2-product-name'}).length>0;
  const save = r.root.findAllByType('button').find(b=>text(b)==='저장');
  await act(async()=>save.props.onClick());
  await act(async()=>r.unmount());
  return {isV2, values:saved.values};
}
const v1 = await saveWith('?preview=off');
const v2 = await saveWith('?preview=a2');
assert.equal(v1.isV2,false,'?preview=off renders the existing form');
assert.equal(v2.isV2,true,'?preview=a2 renders the new layout for a single product');
assert.deepEqual(v2.values, v1.values, 'same product must save exactly the same values from either layout (hidden fields kept)');
console.log('PASS v2 layout renders and saves the same payload as the existing form');

// 새 배치에서 고친 값이 그대로 저장되는지(상품명·가격)
window.location.search='?preview=a2';
let r; await act(async()=>{r=TestRenderer.create(React.createElement(Form,{activeBroadcastId:null,initialProduct:product}));});
await act(async()=>r.root.findByProps({id:'v2-product-name'}).props.onChange({target:{value:'새 이름'}}));
await act(async()=>r.root.findByProps({id:'v2-product-price'}).props.onChange({target:{value:'61000'}}));
await act(async()=>r.root.findAllByType('button').find(b=>text(b)==='저장').props.onClick());
assert.equal(saved.values.product_name,'새 이름'); assert.equal(Number(saved.values.price),61000);
const more = r.root.findAllByType('button').find(b=>text(b).startsWith('더 보기'));
assert.equal(more.props['aria-expanded'],false,'더 보기 starts closed');
await act(async()=>more.props.onClick());
assert.ok(r.root.findAllByType('button').some(b=>text(b)==='바로구매 가능'),'더 보기 shows instant-order choice');
await act(async()=>r.unmount());
console.log('PASS v2 edits name/price through existing state and toggles 더 보기');

// 브랜드 묶음 상품은 새 배치에서도 기존 화면
const brand = {id:9101,__catalog_edit_version:'c'.repeat(32),product_name:'브랜드',price:100,product_note:JSON.stringify({brand_group:{enabled:true,detail_options:{A:{colors:[],sizes:['M']}}}})};
await act(async()=>{r=TestRenderer.create(React.createElement(Form,{activeBroadcastId:null,initialProduct:brand}));});
assert.equal(r.root.findAllByProps({id:'v2-product-name'}).length,0,'brand group keeps the existing form');
await act(async()=>r.unmount());
console.log('PASS brand group product keeps the existing form under ?preview=a2');
