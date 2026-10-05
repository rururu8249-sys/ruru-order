import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window={addEventListener(){},removeEventListener(){}};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
let mode='partial',requests=[],retry=false;
const broadcasts=[{id:'A',public_title:'방송 A',started_at:'2026-10-01T00:00:00Z'},{id:'B',public_title:'방송 B',started_at:'2026-10-02T00:00:00Z'}];
const supabase={from(table){let id='',start=0;const q={select(){return q},neq(){return q},not(){return q},order(){return q},eq(_k,v){id=v;return q},range(v){start=v;return q},in(){return q},limit(){return q},then(resolve,reject){
  if(table==='broadcasts')return Promise.resolve({data:broadcasts,error:null}).then(resolve,reject);
  if(table==='products')return Promise.resolve({data:[],error:null}).then(resolve,reject);
  if(mode==='partial')return Promise.resolve(start===0?{data:retry?[]:Array.from({length:1000},(_,i)=>({id:i})),error:null}:{data:null,error:{message:'second page failed'}}).then(resolve,reject);
  const d=deferred();requests.push({id,...d});return d.promise.then(resolve,reject);
}};return q;}};
const Component=createUiLoader({'@/lib/supabase':{supabase},'@/lib/adminToast':{showAdminToast(){}}})('components/admin-live/BroadcastReportPopup.tsx').default;
let tree;
const text=()=>JSON.stringify(tree.toJSON());
await act(async()=>{tree=Renderer.create(React.createElement(Component,{open:true,onClose(){},initialBroadcastId:'A',embedded:true}));});
assert.equal(text().includes('총 매출 (결제완료)'),false,'failed second page must not display a partial or healthy-zero aggregate');
assert(text().includes('리포트를 불러오지 못했습니다'));
const copy=()=>tree.root.findAllByType('button').find(b=>b.children.includes('📋 복사'));
assert.equal(copy().props.disabled,true,'failed report cannot be copied');
retry=true;
await act(async()=>tree.root.findAllByType('button').find(b=>b.children.includes('다시 불러오기')).props.onClick());
assert(text().includes('총 매출 (결제완료)'),'successful empty result must remain distinct from failure');
assert.equal(copy().props.disabled,false);
await act(async()=>tree.unmount());
mode='race';requests=[];
await act(async()=>{tree=Renderer.create(React.createElement(Component,{open:true,onClose(){},initialBroadcastId:'A',embedded:true}));});
assert.equal(requests[0].id,'A');
await act(async()=>tree.root.findByType('select').props.onChange({target:{value:'B'}}));
assert.equal(requests[1].id,'B');
await act(async()=>requests[0].resolve({data:[],error:null}));
assert(text().includes('불러오는 중'),'old response must not complete newer loading');
await act(async()=>requests[1].resolve({data:[],error:null}));
assert(text().includes('총 매출 (결제완료)'));
await act(async()=>tree.unmount());
// Supplied complete snapshot must render the real report without issuing another query.
const SnapshotComponent=createUiLoader({'@/lib/supabase':{supabase:{from(){throw new Error('duplicate report query');}}},'@/lib/adminToast':{showAdminToast(){}}})('components/admin-live/BroadcastReportPopup.tsx').default;
const suppliedSnapshot={broadcasts:[{id:'A',title:'방송 A',started_at:'2026-10-01T00:00:00Z'}],orders:[
 {id:100,order_group_id:'G1',broadcast_id:'A',product_name:'상의',qty:1,product_price:10000,total_price:10000,admin_order_status_v2:'입금확인'},
 {id:101,order_group_id:'G1',broadcast_id:'A',product_name:'하의',qty:1,product_price:20000,total_price:23000,shipping_fee:3000,admin_order_status_v2:'입금확인'},
],products:[]};
await act(async()=>{tree=Renderer.create(React.createElement(SnapshotComponent,{open:true,onClose(){},initialBroadcastId:'A',embedded:true,suppliedSnapshot}));});
assert(text().includes('33,000원'),'supplied snapshot preserves checkout amount');
assert(text().includes('30,000원'),'supplied snapshot preserves product amount');
assert.equal(text().includes('리포트를 불러오지 못했습니다'),false,'injected snapshot cannot make duplicate database calls');
await act(async()=>tree.unmount());
console.log('PASS real report: partial-page failure hides totals/copy, retry distinguishes empty success, stale broadcast response cannot end current loading');
