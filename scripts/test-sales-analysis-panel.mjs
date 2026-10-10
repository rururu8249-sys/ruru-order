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
assert.equal(tree.root.findAllByType('table').length,1,'primary product/option breakdown is a structured table');
const productName=tree.root.findAllByType('span').find(node=>node.children.includes('상의'));
assert(productName.props.className.includes('min-w-0')&&productName.props.className.includes('[overflow-wrap:anywhere]'),'mobile product name must shrink and wrap unbroken product codes');
assert(text().includes('구매 옵션별 수량'),'color and size quantities are grouped, not repeated order rows');
const optionUnits=tree.root.findAllByProps({'aria-label':'사이즈 M, 수량 2개'});
assert.equal(optionUnits.length,1,'each size and quantity is a separately labeled option unit');
assert.equal(optionUnits[0].findAllByType('strong')[0].children.join(''),'2개');
assert.equal(optionUnits[0].type,'dl','option and quantity have explicit term/value relationships');
assert.equal(optionUnits[0].findByType('dt').children.join(''),'M');
assert.equal(tree.root.findAllByProps({'aria-label':'사이즈별 수량'}).length,1,'only products with sizes have a size heading');
assert.equal(tree.root.findAllByProps({'aria-label':'옵션별 수량'}).length,1,'a product without sizes shows quantity without a fictitious size');
assert.equal(tree.root.findByProps({'aria-label':'옵션 없음, 수량 1개'}).findByType('dt').children.join(''),'수량');
assert.equal(tree.root.findAllByType('details').length,0,'buyers are not appended underneath products');
await act(async()=>tree.root.findAllByType('button').find(b=>b.children.includes('구매자별')).props.onClick());
assert.equal(tree.root.findAllByType('table').length,0,'buyer view replaces product view rather than stacking pages');
assert(tree.root.findAllByType('details').every(node=>node.props.open===undefined),'buyer items are disclosed only when requested');
assert.equal(loads,1,'switching analysis view does not query again');
await act(async()=>tree.root.findAllByType('button').find(b=>b.children.includes('상품·옵션별')).props.onClick());
await act(async()=>tree.root.findAllByType('button').find(b=>b.props['aria-label']==='방송 B 분석').props.onClick());
assert.equal(loads,1,'broadcast switch uses the loaded snapshot');
assert(text().includes('방송 B'));
await act(async()=>tree.root.findByProps({'aria-label':'분석할 방송 선택'}).props.onChange({target:{value:'A'}}));
assert.equal(loads,1,'compact mobile selector reuses the same snapshot');
assert(text().includes('40,000원'),'mobile selection updates the selected broadcast detail');
pending=Promise.reject(new Error('refresh failure'));
await act(async()=>tree.root.findAllByType('button').find(b=>b.children.includes('새로고침')).props.onClick());
assert(text().includes('불러오지 못했습니다'));
assert.equal(text().includes('48,000원'),false,'failed refresh cannot keep apparently-current totals');
pending=Promise.resolve(snapshot);
await act(async()=>tree.root.findAllByType('button').find(b=>b.children.includes('다시 불러오기')).props.onClick());
assert(text().includes('48,000원'),'retry recovers the complete snapshot');
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
pending=Promise.resolve({...snapshot,orders:[
 {id:20,order_group_id:'catA',broadcast_id:'A',product_id:'clothing',product_name:'동일 이름',color:'그린',size:'XL',qty:2,product_price:10000,adjusted_product_price:18000,total_price:18000,admin_order_status_v2:'입금확인'},
 {id:21,order_group_id:'catB',broadcast_id:'A',product_id:'bags',product_name:'동일 이름',color:'탄',qty:1,product_price:10000,total_price:10000,admin_order_status_v2:'입금확인'},
],products:[{id:'clothing',image_url:'https://example.com/clothing.jpg',product_note:{category:'의류'}},{id:'bags',product_note:{category:'가방'}}]});
await act(async()=>{tree=Renderer.create(React.createElement(Panel,{initialBroadcastId:'A'}));});
assert.equal(tree.root.findAllByType('tbody')[0].findAllByType('tr').length,2,'same name and price across catalog identities are not merged');
const photoButton=tree.root.findAllByType('button').find(b=>b.props['aria-label']==='동일 이름 상품 사진 확대');
assert(photoButton,'photo enlargement is an in-page action, not a new-tab link');
await act(async()=>photoButton.props.onClick());
assert.equal(tree.root.findAllByType('dialog').length,1,'photo opens in current-page modal');
assert.equal(tree.root.findByType('dialog').findByType('img').props.src,'https://example.com/clothing.jpg');
await act(async()=>tree.root.findByProps({'aria-label':'사진 확대 닫기'}).props.onClick());
assert.equal(tree.root.findAllByType('dialog').length,0,'close returns to analysis');
await act(async()=>photoButton.props.onClick());
await act(async()=>tree.root.findByType('dialog').props.onCancel({preventDefault(){}}));
assert.equal(tree.root.findAllByType('dialog').length,0,'Escape dismisses photo');
const categoryButtons=tree.root.findByProps({'aria-label':'상품 분류 필터'}).findAllByType('button');
assert(categoryButtons.some(b=>b.children.join('')==='의류 · 2개 · 18,000원')&&categoryButtons.some(b=>b.children.join('')==='가방 · 1개 · 10,000원'),'category totals retain original row attribution');
await act(async()=>categoryButtons.find(b=>b.children.join('').startsWith('가방 ·')).props.onClick());
assert.equal(tree.root.findAllByType('tbody')[0].findAllByType('tr').length,1,'category filter displays only selected catalog category');
assert(text().includes('28,000원'),'full selected-broadcast total does not become filtered product subtotal');
await act(async()=>tree.unmount());
console.log('PASS unified analysis grouped amounts, option identity, no duplicate reads, failed refresh');
