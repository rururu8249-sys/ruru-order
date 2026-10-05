import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
import {existsSync} from 'node:fs';
assert(existsSync('components/admin-live/SalesAnalysisPanel.tsx'),'unified read-only analysis panel must exist');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window={addEventListener(){},removeEventListener(){}};
let resolve;let pending=new Promise(r=>resolve=r);let loads=0;
const snapshot={broadcasts:[{id:'A',title:'방송 A',started_at:'2026-10-05'},{id:'B',title:'방송 B',started_at:'2026-10-04'}],orders:[
 {id:1,order_group_id:'G1',broadcast_id:'A',product_name:'상의',color:'베이지 / 화이트',size:'M',qty:2,product_price:10000,total_price:20000,admin_order_status_v2:'입금확인'},
 {id:2,order_group_id:'G1',broadcast_id:'A',product_name:'하의',qty:1,product_price:20000,total_price:23000,shipping_fee:3000,admin_order_status_v2:'입금확인'},
 {id:3,order_group_id:'G2',broadcast_id:'B',product_name:'기타',qty:1,product_price:5000,total_price:5000,admin_order_status_v2:'입금확인'},
 {id:4,order_group_id:'G3',broadcast_id:'A',product_name:'테스트제외',qty:1,total_price:999999,is_test_order:true,admin_order_status_v2:'입금확인'},
],products:[]};
const load=createUiLoader({'@/lib/supabase':{supabase:{from(){throw Error('duplicate query');}}},'@/lib/salesAnalysisLoader':{loadSalesAnalysisSnapshot(){loads++;return pending;}},'@/lib/adminToast':{showAdminToast(){}}});
const Panel=load('components/admin-live/SalesAnalysisPanel.tsx').default;
let tree;const text=()=>JSON.stringify(tree.toJSON());
await act(async()=>{tree=Renderer.create(React.createElement(Panel,{initialBroadcastId:'A'}));});
assert(text().includes('불러오는 중'));
await act(async()=>resolve(snapshot));
assert(text().includes('48,000원'),'one snapshot gives correct grouped checkout total');
assert(text().includes('45,000원'),'product summary must include quantity, without checkout shipping');
assert(text().includes('40,000원'),'selected report product amount must agree with item amounts');
assert.equal(text().includes('테스트제외'),false);
assert(text().includes('품목 수'),'item count is not mislabeled as orders');
assert(text().includes('베이지 / 화이트'),'original option must remain readable');
assert.equal(loads,1,'opening details cannot load the same orders twice');
await act(async()=>tree.root.findAllByType('button').find(b=>b.props['aria-label']==='방송 B 분석').props.onClick());
assert.equal(loads,1,'broadcast switch uses the loaded snapshot');
assert(text().includes('방송 B'));
pending=Promise.reject(new Error('refresh failure'));
await act(async()=>tree.root.findAllByType('button').find(b=>b.children.includes('새로고침')).props.onClick());
assert(text().includes('불러오지 못했습니다'));
assert.equal(text().includes('48,000원'),false,'failed refresh cannot keep apparently-current totals');
await act(async()=>tree.unmount());
pending=Promise.resolve({...snapshot,orders:[
 {id:10,order_group_id:'same',broadcast_id:'A',created_at:'2026-10-05',product_name:'출고상품',qty:2,product_price:10000,adjusted_product_price:18000,total_price:18000,admin_order_status_v2:'출고완료',shipped_prev_status:'수동입금확인'},
 {id:11,order_group_id:'same',broadcast_id:null,created_at:'2026-10-05',product_name:'쇼핑몰상품',qty:1,product_price:5000,total_price:5000,refund_amount:1000,admin_order_status_v2:'입금확인'},
 {id:12,order_group_id:'cancel',broadcast_id:'A',created_at:'2026-10-05',product_name:'취소상품',qty:1,total_price:999999,admin_order_status_v2:'주문취소'},
]});
await act(async()=>{tree=Renderer.create(React.createElement(Panel,{initialBroadcastId:'A'}));});
assert(text().includes('22,000원'),'shipping previous paid status and shop net refund total retained');
assert(text().includes('23,000원'),'adjusted product row amount is not multiplied by quantity again');
assert(text().includes('2건'),'same group key across channels remains two checkouts');
assert(text().includes('2줄')&&text().includes('3개'),'checkout, item rows and units are distinct');
assert.equal(text().includes('취소상품'),false);
await act(async()=>tree.root.findByProps({'aria-label':'판매 경로'}).props.onChange({target:{value:'shop'}}));
assert(text().includes('4,000원'),'shop filter uses net payment');
assert.equal(text().includes('출고상품'),false,'filtered-out selection does not retain old detail');
await act(async()=>tree.unmount());
console.log('PASS unified analysis grouped amounts, option identity, no duplicate reads, failed refresh');
