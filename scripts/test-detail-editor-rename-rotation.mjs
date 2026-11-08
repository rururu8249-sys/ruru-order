// [2026-11-08 사장님 「MC-315 상품명 수정했더니 순환에서 사라짐」] 세부상품 «창»(수정 → 적용 → 저장)에서 이름을 바꿔도
//   위젯 순환 목록 이름 맞추기(renameRotationDetail)를 부르는지. 표 인라인 수정만 부르고 창은 안 부르던 버그.
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window={innerWidth:1200,addEventListener(){},removeEventListener(){},dispatchEvent(){},location:{search:''},localStorage:{getItem:()=>null,setItem(){}}};
globalThis.document={addEventListener(){},removeEventListener(){}};
const fetches=[];
globalThis.fetch=async(url,init)=>{fetches.push({url,body:JSON.parse(init?.body||'null')});return {ok:true,json:async()=>({ok:true})};};
const {default:Form}=createUiLoader({'@/lib/supabase':{supabase:{}},'@/lib/adminCatalogWrite':{adminCatalogWrite:async()=>({data:{id:9001},error:null})},'@/lib/adminToast':{showAdminToast(){}},'@/lib/adminConfirm':{showAdminConfirm:async()=>true}})('components/admin-live/quick-product/QuickProductFastForm.tsx');
const product={id:9001,__catalog_edit_version:'a'.repeat(32),product_name:'브랜드',price:1000,stock:0,color_options:['A','B'],product_note:JSON.stringify({brand_group:{enabled:true,detail_options:{A:{colors:[],sizes:['M'],variants:[]},B:{colors:[],sizes:['S'],variants:[]}}},combo_mode:true,combo_detail_values:['A','B'],option_axes:[{key:'detail',label:'종류',values:['A','B']}]})};
let renderer;
await act(async()=>{renderer=TestRenderer.create(React.createElement(Form,{activeBroadcastId:null,initialProduct:product,initialDetailName:'A'}));});
const buttons=()=>renderer.root.findAllByType('button');
const text=node=>node.children.map(child=>typeof child==='string'?child:typeof child==='object'?text(child):'').join('');
const dialog=renderer.root.findByProps({'aria-label':'세부상품 수정'});
const nameInput=dialog.findAllByType('input').find(i=>i.props.value==='A');
assert.ok(nameInput,'detail name input found');
await act(async()=>nameInput.props.onChange({target:{value:'A2'}}));
await act(async()=>dialog.findAllByType('button').find(b=>text(b)==='적용').props.onClick());
await act(async()=>buttons().find(b=>text(b)==='저장').props.onClick());
const call=fetches.find(f=>f.body?.action==='renameRotationDetail');
assert.ok(call,'saving after a rename in the detail editor must ask the widget rotation to follow');
assert.deepEqual(call.body.renames,[{from:'A',to:'A2'}]);
assert.equal(String(call.body.productId),'9001');
await act(async()=>renderer.unmount());
console.log('PASS detail editor rename → renameRotationDetail');
