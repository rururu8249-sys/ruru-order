import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { createUiLoader } from './admin-ui-test-loader.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// The real picking panel already has its own behavior regression suite.
// Only its pure row-builder is replaced in this focused scope-picker rendering test.
const buildPickRows = (orders) => ({rows:orders.flatMap((o) =>
  o.paymentStatus === 'canceled' || o.excludeFromPicking === true ? [] :
    (o.items || []).filter((it) => !it.pickPulledFor).map((it) => ({
      id:String(it.id), qty:Number(it.qty) || 1,
      paid:['paid','auto_paid','manual_paid','card_paid'].includes(o.paymentStatus),
      skip:Boolean(it.skip),
    }))
),movedAway:0});
const Component = createUiLoader({'./LivePickingPanel':{buildPickRows}})('components/admin-live/WorkScopePickerModal.tsx').default;
const BC = '11111111-1111-1111-1111-111111111111';
const createdAt = '2026-11-18T12:30:00Z';
const mk = (id,status,qty=1,extra={})=>({id:String(id),groupId:String(id),createdAt,submittedAt:createdAt,
  broadcastId:BC,broadcastName:'',paymentStatus:status,items:[{id:String(id),productName:'옷',qty}],...extra});
const orders = [mk(1,'paid',4),...Array.from({length:7},(_,i)=>mk(i+2,'paid')),
  mk(9,'canceled',100),mk(10,'canceled',100),mk(11,'canceled',100)];
const bcOptions = [{id:BC,dateKey:'2026-11-18',label:'11.18(수) 해외명품고퀄의류11'}];
const flatten = (n)=>typeof n==='string'?n:Array.isArray(n)?n.map(flatten).join(''):n?.children?.map(flatten).join('')||'';
const render = (props)=>Renderer.create(React.createElement(Component,{
  work:'picking',allOrders:orders,currentOrders:orders,selectedOrders:[],broadcasts:bcOptions,shopDates:[],
  currentLabel:'11.18(수) 해외명품고퀄의류11',onConfirm:()=>{},onClose:()=>{},...props,
}));
const input = (tree,type,name)=>tree.root.findAll(n=>n.type==='input'&&n.props.type===type&&(name===undefined||n.props.name===name));
const button = (tree,label)=>tree.root.findAll(n=>n.type==='button'&&flatten(n).includes(label))[0];
let chosen=null,tree;
await act(async()=>{tree=render({onConfirm:(v)=>{chosen=v;}});});
const text = ()=>flatten(tree.toJSON());
assert.ok(text().includes('총 챙길 물건 11개'),'8 valid order forms contain 11 physical items');
assert.ok(text().includes('결제완료 11개')&&text().includes('미결제 0개'),'payment quantities must use item units');
assert.ok(text().includes('취소 주문서 3건 별도 제외'),'canceled orders are separated');
assert.ok(!text().includes('311개'),'canceled products must not inflate total');
assert.ok(text().includes('현재 필터')&&text().includes('방송별 선택')&&text().includes('쇼핑몰 날짜별'),'all scope options are available');
assert.equal(tree.root.findAll(n=>n.type==='h2').length,1,'single concise header');
assert.equal(input(tree,'radio','work-scope').length,3);
assert.equal(input(tree,'radio','picking-payment-view').length,2);
assert.ok(text().includes('물건 11개 보기'));
// Switch to broadcast, then pick the broadcast; quantity must match current scope.
await act(async()=>{input(tree,'radio','work-scope')[1].props.onChange();});
assert.ok(text().includes('11개'));
await act(async()=>{input(tree,'checkbox')[0].props.onChange();});
assert.ok(text().includes('총 챙길 물건 11개'));
await act(async()=>{input(tree,'radio','picking-payment-view')[0].props.onChange();});
assert.ok(text().includes('물건 11개 보기'));
await act(async()=>{button(tree,'물건 11개 보기').props.onClick();});
assert.equal(chosen.orders.length,8,'canceled order forms absent from picker payload');
assert.equal(chosen.kind,'broadcast');
assert.equal(chosen.includeUnpaid,false);
assert.equal(chosen.canceledCount,3);

const mixed = [mk(1,'paid',2),mk(2,'unpaid',3),mk(3,'canceled',999)];
let mixedResult=null,mixedTree;
await act(async()=>{mixedTree=render({allOrders:mixed,currentOrders:mixed,onConfirm:(v)=>{mixedResult=v;}});});
const mixedText=()=>flatten(mixedTree.toJSON());
assert.ok(mixedText().includes('총 챙길 물건 5개')&&mixedText().includes('결제완료 2개')&&mixedText().includes('미결제 3개'));
assert.ok(mixedText().includes('물건 5개 보기'));
await act(async()=>{input(mixedTree,'radio','picking-payment-view')[0].props.onChange();});
assert.ok(mixedText().includes('총 챙길 물건 5개'),'display toggle never changes physical item total');
assert.ok(mixedText().includes('물건 2개 보기'),'paid-only controls displayed items');
await act(async()=>{button(mixedTree,'물건 2개 보기').props.onClick();});
assert.equal(mixedResult.orders.length,2,'unpaid must remain in selected payload for in-panel toggle');
assert.equal(mixedResult.includeUnpaid,false);
assert.equal(mixedResult.canceledCount,1);

// A broadcast with only canceled orders must not appear as a valid work choice.
const canceledOnly = [mk(4,'canceled',77)];
let noneTree;
await act(async()=>{noneTree=render({allOrders:canceledOnly,currentOrders:canceledOnly});});
assert.ok(flatten(noneTree.toJSON()).includes('총 챙길 물건 0개'));
assert.ok(button(noneTree,'물건 0개 보기').props.disabled);
await act(async()=>{input(noneTree,'radio','work-scope')[1].props.onChange();});
assert.ok(flatten(noneTree.toJSON()).includes('챙길 상품이 있는 방송이 없습니다.'));

// Invoice flow retains order-form counts and the original confirmation payload.
let invoiceResult=null,invoiceTree;
await act(async()=>{invoiceTree=render({work:'invoice',onConfirm:(v)=>{invoiceResult=v;}});});
assert.ok(flatten(invoiceTree.toJSON()).includes('송장 대상 8건'));
assert.ok(flatten(invoiceTree.toJSON()).includes('송장 옵션 보기 · 8건'));
await act(async()=>{button(invoiceTree,'송장 옵션 보기').props.onClick();});
assert.equal(invoiceResult.orders.length,8);
console.log('PASS compact picker: 11 item qty / 8 active forms / 3 canceled, paid-unpaid toggle, broadcast, invoice, empty range');
