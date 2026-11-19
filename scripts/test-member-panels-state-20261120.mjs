import assert from 'node:assert/strict';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const load = createUiLoader();
const Points = load('components/admin-live/AdminLiveCustomerPointPanel.tsx').default;
const Access = load('components/admin-live/MemberAccessHistory.tsx').default;
const flatten = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : node?.children ? flatten(node.children) : '';
const text = tree => flatten(tree.toJSON());
const button = (tree, label) => tree.root.findAllByType('button').find(node => flatten(node.children) === label);
let reply, requests = [];
globalThis.fetch = async (url, init = {}) => {
  assert.equal(init.method || 'GET', 'GET', 'read-only fixtures must never submit an action');
  assert.match(String(url), /^\/api\/admin-live\/(customer-points|customer-access)\?/);
  requests.push(String(url));
  return {ok: reply.ok, json: async () => reply};
};

reply = {ok: true, current_points: 3390, current_points_text: '3,390원', ledger: [
  {id: 'test-ledger', amount: 1200, balance_after: 3390, change_type: 'grant', reason: '검증용 적립', created_at: '2026-11-19T02:00:00Z'},
]};
let tree;
await act(async () => {tree = Renderer.create(React.createElement(Points, {customer: {phone: '01000000001', nickname: '검증회원', name: '테스트'}}));});
assert.match(text(tree), /3,390\s?P/, 'point balance is formatted from numeric points, not a legacy currency string');
assert.match(text(tree), /\+1,200\s?P/, 'point ledger uses the same point unit');
assert.doesNotMatch(text(tree), /3,390원|1,200원/);
reply = {ok: false, message: '검증용 조회 실패'};
await act(async () => button(tree, '새로고침').props.onClick());
assert.doesNotMatch(text(tree), /3,390\s?P|아직 포인트 이력이 없습니다/, 'failed refresh does not show stale balance or empty-history success');
reply = {ok: true, current_points: 0, ledger: []};
await act(async () => button(tree, '새로고침').props.onClick());
assert.match(text(tree), /0\s?P/);
assert.match(text(tree), /포인트 이력이 없습니다/);
await act(async () => tree.unmount());

reply = {ok: false, message: '검증용 접속 조회 실패'};
await act(async () => {tree = Renderer.create(React.createElement(Access, {kakaoId: '101'}));});
assert.equal(tree.root.findAllByProps({role: 'alert'}).length, 1, 'failed access read is an error, not empty history');
assert.ok(button(tree, '다시 조회'), 'access history can recover without reopening the member');
reply = {ok: true, records: [{at: '2026-11-19T02:00:00Z', ip: '192.0.2.1', region: '검증 지역'}]};
await act(async () => button(tree, '다시 조회').props.onClick());
assert.match(text(tree), /검증 지역/);
assert.match(text(tree), /참고/);
assert.match(text(tree), /실제 거주지/);
await act(async () => tree.unmount());
console.log(`PASS member panels: point units, failed/empty states and access retry (${requests.length} fixture reads, zero writes)`);
