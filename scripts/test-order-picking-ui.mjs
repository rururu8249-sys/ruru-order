import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const root = path.resolve('.');
const rows = new Map([[1, {id: 1, picked_at: null, collected_at: 'legacy'}], [2, {id: 2, picked_at: null}]]);
const writes = [], toasts = [];
let gate = null, deny = false, readGate = null;
const db = { from(table) {
  return {
    select() { return { async in(_, ids) {
      const data = table === 'products' ? [] : ids.map(id => rows.get(Number(id))).filter(Boolean).map(row => ({...row}));
      if (readGate) await readGate;
      return { data, error: null };
    } }; },
    update(payload) { return { in(_, ids) { return { async select() {
      writes.push({payload, ids});
      if (gate) await gate;
      if (deny) return {data: [], error: null};
      for (const id of ids) Object.assign(rows.get(id), payload);
      return {data: ids.map(id => rows.get(id)), error: null};
    } }; } }; },
  };
} };
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = {exports: {}};
  cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText;
  const localRequire = spec => {
    if (spec === '@/lib/supabase') return {supabase: db};
    if (spec === '@/lib/adminToast') return {showAdminToast: (...args) => toasts.push(args)};
    if (spec === '@/lib/adminConfirm') return {showAdminConfirm: async () => true};
    if (spec === './adminLiveOrderExcelExport') return {exportLiveOrdersForPicking: async () => {}};
    if (spec.startsWith('@/') || spec.startsWith('.')) {
      const base = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(filename), spec);
      const target = [base, base + '.ts', base + '.tsx'].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      return load(target);
    }
    return require(spec);
  };
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', {filename})(localRequire, module, module.exports);
  return module.exports;
}
const Modal = load(path.join(root, 'components/admin-live/LiveOrderPickingModal.tsx')).default;
const item = (id, qty, size = 'S/36') => ({id: String(id), productId: '', productName: 'MIU-2', color: '', size, optionText: '원본 옵션', qty, amount: 10000});
const order = (id, status, items, extra = {}) => ({id: String(id), groupId: String(id), nickname: '고객' + id, name: '받는분' + id, phone: '', createdAt: '2026-10-01T10:00:00Z', paymentStatus: status, items, ...extra});
const orders = [order(1, 'paid', [item(1, 3)]), order(2, 'card_paid', [item(2, 1, '')]), order(3, 'unpaid', [item(3, 7)]), order(4, 'canceled', [item(4, 9)]), order(5, 'paid', [item(5, 11)], {excludeFromPicking: true})];
let tree;
await act(async () => { tree = Renderer.create(React.createElement(Modal, {orders, filterLabel: '방송: 검수', onClose() {}})); });
const checks = () => tree.root.findAll(node => node.type === 'button' && node.props.role === 'checkbox');
const check = nickname => checks().find(node => node.props["aria-label"].startsWith(nickname + " "));
const button = text => tree.root.findAllByType('button').find(node => node.children.join('') === text);
const text = () => JSON.stringify(tree.toJSON());
assert.equal(checks().length, 2, 'only paid, non-canceled, included orders');
assert.equal(check("고객1").props['aria-checked'], false, 'legacy collected must not imply completion');
assert.ok(text().includes('원본 옵션'), 'optionText-only legacy orders must keep their option');
let release;
gate = new Promise(resolve => {release = resolve;});
let pending;
await act(async () => { pending = check("고객1").props.onClick(); check("고객1").props.onClick(); });
assert.equal(writes.length, 1, 'rapid duplicate clicks cannot race');
assert.equal(check("고객1").props['aria-checked'], false, 'not completed until server confirms');
assert.equal(check("고객2").props.disabled, true, 'overlapping writes blocked');
await act(async () => { release(); await pending; });
gate = null;
assert.equal(check("고객1").props['aria-checked'], true);
assert.equal(checks().length, 2, 'completed row remains visible for checking');
await act(async () => button('고객별').props.onClick());
assert.equal(check("고객1").props['aria-checked'], true, 'customer view sees product-view completion');
await act(async () => { await check("고객1").props.onClick(); });
await act(async () => button('상품별').props.onClick());
assert.equal(check("고객1").props['aria-checked'], false, 'product view sees customer-view undo');
deny = true;
await act(async () => { await check("고객1").props.onClick(); });
assert.equal(check("고객1").props['aria-checked'], false, 'denied update never appears complete');
assert.ok(toasts.some(args => args[1] === 'error'));
deny = false;
await act(async () => { await check("고객2").props.onClick(); });
await act(async () => button('안 챙김만').props.onClick());
assert.equal(checks().length, 1, 'same incomplete filter uses saved completion');
await act(async () => tree.unmount());
await act(async () => { tree = Renderer.create(React.createElement(Modal, {orders, filterLabel: '검수', onClose() {}})); });
assert.equal(check("고객2").props['aria-checked'], true, 'reopen reloads persisted state');
await act(async () => tree.root.findByType('input').props.onChange({target: {value: 'miu2'}}));
assert.equal(checks().length, 2, 'separator-free search works in picking');
// Existing IDs can change through Dashboard realtime updates from another admin.
rows.get(2).picked_at = null;
const refreshed = orders.map(order => ({...order, items: order.items.map(item => ({...item, pickedAt: null}))}));
await act(async () => tree.update(React.createElement(Modal, {orders: refreshed, filterLabel: '검수', onClose() {}})));
assert.equal(check('고객2').props['aria-checked'], false, 'same-ID realtime undo refreshes open modal');
// Scope refresh that started before a write must never overwrite its confirmed result.
let releaseRead;
readGate = new Promise(resolve => {releaseRead = resolve;});
rows.set(6, {id: 6, picked_at: null});
const expanded = [...refreshed, order(6, 'paid', [item(6, 1)])];
await act(async () => tree.update(React.createElement(Modal, {orders: expanded, filterLabel: '검수', onClose() {}})));
// Loading scope must block a check until the read is authoritative.
assert.equal(check('고객1').props.disabled, true);
await act(async () => { releaseRead(); });
readGate = null;
let releaseSave;
gate = new Promise(resolve => {releaseSave = resolve;});
let saving;
await act(async () => {saving = check('고객1').props.onClick();});
rows.set(7, {id: 7, picked_at: null});
readGate = new Promise(resolve => {releaseRead = resolve;});
await act(async () => tree.update(React.createElement(Modal, {orders: [...expanded, order(7, 'paid', [item(7, 1)])], filterLabel: '검수', onClose() {}})));
await act(async () => {releaseSave(); await saving;});
gate = null;
await act(async () => {releaseRead();});
readGate = null;
assert.equal(check('고객1').props['aria-checked'], true, 'scope refresh cannot undo a confirmed save');
assert.ok(rows.get(1).picked_at);
await act(async () => tree.unmount());
assert.ok(writes.every(write => Object.keys(write.payload).join() === 'picked_at'), 'no payment/order/collected writes');
console.log('picking UI integration passed: scope, legacy options, save gate, rapid clicks, both-view check/undo, failure, filter, reopen, search');
