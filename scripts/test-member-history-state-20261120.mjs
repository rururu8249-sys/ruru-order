import assert from 'node:assert/strict';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let reply = {data: null, error: {message: 'fixture read failed'}};
let queries = [];
const sb = {from(table) {
  const record = {table, orders: []}; queries.push(record);
  const q = {select(){return q;}, or(){return q;}, eq(){return q;}, in(){return q;},
    order(field){record.orders.push(field); return q;}, range(){return Promise.resolve(reply);}};
  return q;
}};
const History = createUiLoader({'@/lib/supabase': {supabase: sb}})('components/admin-live/CustomerFullOrderHistory.tsx').default;
const text = tree => JSON.stringify(tree.toJSON());
let stats = [], tree;
await act(async () => {tree = Renderer.create(React.createElement(History, {kakaoId: '101', phone: '01011112222', onStats: s => stats.push(s)}));});
assert.equal(stats.at(-1), null, 'failed history must not publish a zero balance/order count');
assert.doesNotMatch(text(tree), /전 기간 0|입금완료 0|결제완료 0/, 'failed fetch must not look like an empty history');
const retry = tree.root.findAllByType('button').find(b => b.children.join('') === '다시 조회');
assert.ok(retry, 'failed history has a reachable retry');
reply = {data: [{id: 1, order_group_id: 'one', kakao_id: '101', final_amount: 35000, order_manage_status: 'paid'}], error: null};
await act(async () => retry.props.onClick());
assert.equal(stats.at(-1).all, 1);
assert.equal(stats.at(-1).paidAmount, 35000);
assert.ok(queries.at(-1).orders.includes('id'), 'history paging has a unique tie-breaker');
await act(async () => tree.unmount());

reply = {data: [], error: null}; stats = [];
await act(async () => {tree = Renderer.create(React.createElement(History, {kakaoId: '202', phone: '01033334444', onStats: s => stats.push(s)}));});
assert.equal(stats.at(-1).all, 0, 'successfully read empty history is still zero');
await act(async () => tree.unmount());
console.log('PASS member history: failed/empty reads differ, retry restores real stats, deterministic paging');
