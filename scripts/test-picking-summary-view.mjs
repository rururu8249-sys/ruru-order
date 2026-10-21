import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let failExceptions=false;
let exportSnapshot=[], exportAdditional=[],exportExceptions=[];
globalThis.fetch=async()=>({ok:!failExceptions,json:async()=>({ok:!failExceptions,orders:exportSnapshot,additionalOrders:exportAdditional,exceptions:exportExceptions,message:'고객이슈 조회 실패'})});
const require = createRequire(import.meta.url);
const root = path.resolve('.');
const rows = new Map([[1, {id: 1, picked_at: null, collected_at: 'legacy'}], [2, {id: 2, picked_at: null}], [3, {id:3, picked_at:null}]]);
const writes = [], toasts = [], exportsMade = [];
let gate = null, deny = false, readGate = null;
let productRows = [];
const db = { from(table) {
  return {
    select() { return { async in(_, ids) {
      const data = table === 'products' ? productRows.filter(row => ids.map(String).includes(String(row.id))) : ids.map(id => rows.get(Number(id))).filter(Boolean).map(row => ({...row}));
      if (readGate) await readGate;
      return { data, error: null };
    } }; },
    update(payload) { const chain = { is() { return chain; }, in(_, ids) { if ('picking_list_printed_at' in payload) {writes.push({payload,ids}); return Promise.resolve({error:null});} return { async select() {
      writes.push({payload, ids});
      if (gate) await gate;
      if (deny) return {data: [], error: null};
      for (const id of ids) Object.assign(rows.get(id), payload);
      return {data: ids.map(id => rows.get(id)), error: null};
    } }; } }; return chain; },
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
    if (spec === './adminLiveOrderExcelExport') return {exportLiveOrdersForPicking: async (orders,meta,pickedIds) => {exportsMade.push({orders,meta,pickedIds});}};
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
const orders = [order(1, 'paid', [item(1, 3)]), order(2, 'card_paid', [item(2, 1, '')], {paidAtFull:'2026-10-01T10:05:00Z'}), order(3, 'unpaid', [item(3, 7)]), order(4, 'canceled', [item(4, 9)]), order(5, 'paid', [item(5, 11)], {excludeFromPicking: true})];

// [2026-10-22] 물건챙기기 「요약」 — 전체 수량·상품 줄(총수량)·옵션별 수량+체크(그 옵션 줄 전부 picked_at)
const sumOrders = [
  order(11, 'paid', [{...item(11, 2, 'M'), color:'블랙', optionText:'블랙 / M', productName:'바람막이', unitPrice:25000}]),
  order(12, 'paid', [{...item(12, 1, 'M'), color:'블랙', optionText:'블랙 / M', productName:'바람막이', unitPrice:25000}, {...item(13, 3, 'L'), color:'베이지', optionText:'베이지 / L', productName:'바람막이', unitPrice:25000}]),
  order(14, 'unpaid', [{...item(14, 4, 'L'), color:'베이지', optionText:'베이지 / L', productName:'바람막이', unitPrice:25000}]),
];
for (const id of [11,12,13,14]) rows.set(id, {id, picked_at:null});
let tree;
await act(async () => { tree = Renderer.create(React.createElement(Modal, {orders: sumOrders, filterLabel: '방송: 요약검수', onClose() {}})); });
const btn = label => tree.root.findAllByType('button').find(node => node.children.join('') === label);
const nodeText = node => node.children.map(child => typeof child === 'string' ? child : nodeText(child)).join('');
await act(async () => btn('요약').props.onClick());
const totals = tree.root.findByProps({'aria-label':'요약 합계'});
assert.match(nodeText(totals), /전체 수량6개/, 'top total = paid qty (2+1+3)');
assert.match(nodeText(totals), /상품1개/);
assert.match(nodeText(totals), /남은 수량6개/);
const table = tree.root.findByProps({'aria-label':'상품별 수량 요약'});
assert.match(nodeText(table), /바람막이/);
assert.match(nodeText(table), /25,000원/);
const optList = tree.root.findByProps({'aria-label':'바람막이 옵션별 수량'});
const items = optList.findAllByType('li');
assert.equal(items.length, 2, 'two option lines');
assert.match(nodeText(items[0]) + nodeText(items[1]), /블랙 \/ 사이즈 M3개/);
assert.match(nodeText(items[0]) + nodeText(items[1]), /베이지 \/ 사이즈 L3개/);
assert.doesNotMatch(nodeText(optList), /미결제/, '결제완료만 보기에선 미결제 줄 숨김');
// 블랙/M 체크 → 줄 11·12 저장
writes.length = 0;
const blackCheck = optList.findAll(node => node.type === 'button' && node.props.role === 'checkbox').find(node => node.props['aria-label'].includes('블랙'));
await act(async () => blackCheck.props.onClick());
const saved = writes.filter(w => 'picked_at' in w.payload);
assert.deepEqual(saved.flatMap(w => w.ids).map(String).sort(), ['11','12'], 'option check saves every row of that option');
assert.ok(rows.get(11).picked_at && rows.get(12).picked_at && !rows.get(13).picked_at);
assert.match(nodeText(tree.root.findByProps({'aria-label':'요약 합계'})), /남은 수량3개/, 'remaining drops by 3');
// 다시 누르면 해제
await act(async () => tree.root.findByProps({'aria-label':'바람막이 옵션별 수량'}).findAll(node => node.type === 'button' && node.props.role === 'checkbox').find(node => node.props['aria-label'].includes('블랙')).props.onClick());
assert.ok(!rows.get(11).picked_at && !rows.get(12).picked_at, 'second click unpicks');
await act(async () => btn('전체').props.onClick());
assert.match(nodeText(tree.root.findByProps({'aria-label':'바람막이 옵션별 수량'})), /베이지 \/ 사이즈 L3개미결제 4/, '전체 보기: 미결제는 따로 표시(총수량엔 안 넣음)');
assert.match(nodeText(tree.root.findByProps({'aria-label':'요약 합계'})), /전체 수량6개/);
console.log('PASS picking summary view: totals, per-product total, per-option qty + check/uncheck saves picked_at only');
