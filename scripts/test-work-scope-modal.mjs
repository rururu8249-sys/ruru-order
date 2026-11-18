import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const Component=createUiLoader({})('components/admin-live/WorkScopePickerModal.tsx').default;
const BC='11111111-1111-1111-1111-111111111111';
const createdAt='2026-11-18T12:30:00Z';
const mk=(id,status,extra={})=>({id:String(id),groupId:String(id),createdAt,submittedAt:createdAt,
  broadcastId:BC,broadcastName:'',paymentStatus:status,items:[{id:String(id),productName:'옷',qty:1}],...extra});
const eleven=[...Array.from({length:8},(_,i)=>mk(i+1,'paid')),mk(9,'canceled'),mk(10,'canceled'),mk(11,'canceled')];
const bcOptions=[{id:BC,dateKey:'2026-11-18',label:'11.18(수) 해외명품고퀄의류11'}];
const flatten=(node)=>typeof node==='string'?node:Array.isArray(node)?node.map(flatten).join(''):node?.children?.map(flatten).join('')||'';
const render=(props)=>Renderer.create(React.createElement(Component,{
  work:'picking',allOrders:eleven,currentOrders:eleven,selectedOrders:[],broadcasts:bcOptions,shopDates:[],
  currentLabel:'11.18 해외명품고퀄의류11',onConfirm:()=>{},onClose:()=>{},...props}));
const input=(tree,type,value)=>tree.root.findAll(n=>n.type==='input'&&n.props.type===type&&(value===undefined||n.props.name===value));
const buttons=tree=>tree.root.findAll(n=>n.type==='button');
let got=null,tree;
await act(async()=>{tree=render({onConfirm:v=>got=v});});
const html=()=>flatten(tree.toJSON());
assert.ok(html().includes('정상 주문서 8건'));
assert.ok(!html().includes('전체 11건'));
assert.ok(html().includes('결제완료8건')&&html().includes('미결제·확인대기0건')&&html().includes('주문취소 3건'));
assert.ok(html().includes('챙길 주문서8건'));
assert.ok(html().includes('11.18 해외명품고퀄의류11'));
assert.ok(html().includes('미결제 포함 보기'));
assert.ok(html().includes('결제완료만 보기'));
assert.equal(input(tree,'radio','work-scope').length,3);
await act(async()=>{input(tree,'radio','work-scope')[1].props.onChange();}); // broadcast
assert.ok(html().includes('정상 주문서 8건'));
await act(async()=>{input(tree,'checkbox')[0].props.onChange();});
assert.ok(html().includes('챙길 주문서8건'));
await act(async()=>{input(tree,'radio','picking-payment-view')[0].props.onChange();}); // paid only
const confirm=()=>buttons(tree).find(b=>flatten(b).includes('선택 완료'));
await act(async()=>{confirm().props.onClick();});
assert.equal(got.orders.length,8);
assert.equal(got.includeUnpaid,false);
assert.equal(got.kind,'broadcast');

let mixedGot=null;const mixed=[mk(1,'paid'),mk(2,'unpaid'),mk(3,'canceled')];
let mixedTree;
await act(async()=>{mixedTree=render({allOrders:mixed,currentOrders:mixed,onConfirm:v=>mixedGot=v});});
await act(async()=>{input(mixedTree,'radio','picking-payment-view')[0].props.onChange();});
assert.ok(flatten(mixedTree.toJSON()).includes('챙길 주문서2건'));
await act(async()=>{buttons(mixedTree).find(b=>flatten(b).includes('선택 완료')).props.onClick();});
assert.equal(mixedGot.orders.length,2,'unpaid remains in data so picker can reveal it later');
assert.equal(mixedGot.includeUnpaid,false);
assert.equal(mixedGot.orders.find(o=>o.paymentStatus==='unpaid')?.id,'2');

let invoiceGot=null,invoiceTree;
await act(async()=>{invoiceTree=render({work:'invoice',onConfirm:v=>invoiceGot=v});});
assert.ok(flatten(invoiceTree.toJSON()).includes('송장 출력할 주문서8건'));
assert.ok(flatten(invoiceTree.toJSON()).includes('다음 단계에서'));
await act(async()=>{buttons(invoiceTree).find(b=>flatten(b).includes('선택 완료')).props.onClick();});
assert.equal(invoiceGot.orders.length,8);
console.log('PASS real React picker: same current/broadcast 11/8/3, paid-only vs unpaid retained, invoice options, shop/current labels');
