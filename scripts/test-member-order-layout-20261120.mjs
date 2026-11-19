import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const rows=[
  {id:1,order_group_id:'group-a',order_lookup_code:'RURU-TEST-ORDER-A',kakao_id:'101',customer_phone:'01011112222',created_at:'2026-06-02T12:20:00Z',product_name:'긴 상품 이름 A',color:'베이지',size:'M',qty:1,product_price:90000,final_amount:90000,order_manage_status:'입금확인'},
  {id:2,order_group_id:'group-a',order_lookup_code:'RURU-TEST-ORDER-A',kakao_id:'101',customer_phone:'01011112222',created_at:'2026-06-02T12:20:00Z',product_name:'같은 주문의 상품 B',size:'S',qty:1,product_price:35000,shipping_fee:4000,final_amount:39000,order_manage_status:'입금확인',address:'검증 배송지'},
  {id:3,order_group_id:'legacy-b',order_lookup_code:'',kakao_id:'',customer_phone:'01011112222',created_at:'2026-05-19T13:54:00Z',product_name:'과거 주문 상품 C',qty:1,product_price:59000,point_used_amount:1000,final_amount:59000,order_manage_status:'입금확인'},
  {id:4,order_group_id:'other-account',order_lookup_code:'OTHER',kakao_id:'202',customer_phone:'01011112222',created_at:'2026-06-03T00:00:00Z',product_name:'다른 계정 상품',final_amount:99999,order_manage_status:'입금확인'},
];
const supabase={from(table){assert.equal(table,'orders');const q={select(){return q;},or(){return q;},eq(){return q;},in(){return q;},order(){return q;},range(){return Promise.resolve({data:rows,error:null});}};return q;}};
const History=createUiLoader({'@/lib/supabase':{supabase}})('components/admin-live/CustomerFullOrderHistory.tsx').default;
const text=node=>typeof node==='string'?node:(node?.children||[]).map(text).join('');
let tree,stats;
await act(async()=>{tree=Renderer.create(React.createElement(History,{kakaoId:'101',phone:'01011112222',onStats:value=>{stats=value;}}));});
try {
  assert.equal(stats.all,2,'Same Kakao and permitted legacy orders keep their original groups');
  assert.equal(stats.paidAmount,188000,'Presentation does not change payment totals');
  const articles=()=>tree.root.findAllByType('article');
  assert.equal(articles().length,2,'Every order has its own semantic boundary');
  assert.ok(text(articles()[0]).includes('RURU-TEST-ORDER-A'),'Order number is visible while collapsed');
  assert.ok(!text(tree.root).includes('OTHER'),'Explicit other-account orders remain excluded');
  const first=articles()[0].findByType('button');
  await act(async()=>first.props.onClick());
  assert.ok(text(articles()[0]).includes('같은 주문의 상품 B'));
  assert.ok(!text(articles()[0]).includes('과거 주문 상품 C'),'Expanded contents remain inside their own order');
  assert.ok(text(articles()[0]).includes('배송비 4,000원'));
  const second=articles()[1].findByType('button');
  await act(async()=>second.props.onClick());
  assert.equal(articles()[0].findByType('button').props['aria-expanded'],false);
  assert.equal(articles()[1].findByType('button').props['aria-expanded'],true);
  assert.ok(text(articles()[1]).includes('1,000P'),'Point use keeps point units');
  assert.ok(!text(articles()[1]).includes('RURU-'),'A legacy order without a code gets no invented identifier');
  console.log('PASS order boundaries, visible identity, expanding one order, preserved legacy/amount/point contracts');
} finally {await act(async()=>tree.unmount());}
