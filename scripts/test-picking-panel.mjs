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
// [2026-10-23] 물건챙기기 옆 창 — 상품별·고객별 두 보기, 지난 주문은 같은 상품·옵션 줄 안에 「지난 주문 1개 포함」
const mod = load(path.join(root, 'components/admin-live/LivePickingPanel.tsx'));
const Panel = mod.default;
const it = (id, qty, color, size, extra = {}) => ({id: String(id), productId: '', productName: '알로 부츠컷팬츠', color, size, optionText: '', qty, amount: 10000, ...extra});
const order = (id, status, items, extra = {}) => ({id: String(id), groupId: String(id), nickname: '고객' + id, name: '이름' + id, phone: '', createdAt: '2026-10-22T11:00:00Z', paymentStatus: status, items, ...extra});
// 1=결제 레드S 3 · 2=결제 레드S 1(다른 손님) · 3=미결제 레드S 2 · 4=취소 · 5=지난 주문(넘겨받음) 레드S 1 · 6=원래 주문 중 다른 출고로 넘긴 줄(빼야 함)
rows.set(4, {id:4, picked_at:null}); rows.set(5, {id:5, picked_at:null}); rows.set(6, {id:6, picked_at:null}); rows.set(7,{id:7,picked_at:null});
const orders = [
  order(1, 'paid', [it(1, 3, '레드', 'S')]),
  order(2, 'paid', [it(2, 1, '레드', 'S')]),
  order(3, 'unpaid', [it(3, 2, '레드', 'S')]),
  order(4, 'canceled', [it(4, 9, '레드', 'S')]),
  order('G9#pull:bcB22', 'paid', [it(5, 1, '레드', 'S')], {groupId: 'G9', createdAt: '2026-10-11T12:00:00+09:00', pickPull: {pulledFor: '2026-10-22', pulledAt: null, reason: '늦게 입고', broadcastId: 'B22', target: '10.22(목) 남녀공용의류', originalOrderId: 'G9'}}),
  order(6, 'paid', [it(6, 1, '블랙', 'M', {pickPulledFor: '2026-10-25', pickPulledAt: '2026-10-23T00:00:00Z'}), it(7, 1, '블랙', 'M')]),
];
// 순수 함수
const built = mod.buildPickRows(orders, 'scope');
assert.equal(built.movedAway, 1, '다른 출고로 넘긴 줄은 빼고 센다');
assert.deepEqual(built.rows.map(r => r.id).sort(), ['1','2','3','5','7']);
const red = built.rows.filter(r => r.color === '레드');
assert.equal(mod.includedNote(red), '미결제 2 · 지난 주문 1개 포함');
assert.equal(built.rows.find(r => r.id === '5').tag, '지난 주문 10.11(일)');
// 추가 작업(서버): 범위 밖 늦은 입금 줄 + 범위 안 줄과 겹치는 줄은 한 번만
const extra = mod.buildPickRows([order(8, 'paid', [it(8, 1, '레드', 'S')], {createdAt: '2026-10-20T10:00:00Z', paidAtFull: '2026-10-23T10:00:00Z'}), order(1, 'paid', [it(1, 3, '레드', 'S')])], 'extra');
const merged = mod.mergePickRows(built.rows, extra.rows);
assert.equal(merged.filter(r => r.id === '1').length, 1, '겹치는 줄 중복 없음');
assert.equal(merged.find(r => r.id === '8').kind, 'late');

// 화면
let tree;
await act(async () => { tree = Renderer.create(React.createElement(Panel, {orders, filterLabel: '방송: 10.22 남녀공용의류', onClose() {}})); });
await act(async () => { await new Promise(r => setTimeout(r, 0)); });
const flat = (n) => n == null ? '' : typeof n === 'string' ? n : Array.isArray(n) ? n.map(flat).join('') : flat(n.children);
const text = () => flat(tree.toJSON());
const tabs = tree.root.findAll(n => n.type === 'button' && n.props.role === 'tab');
assert.deepEqual(tabs.map(t => t.children.join('')), ['상품별', '고객별'], '보기는 두 개뿐');
assert.ok(text().includes('미결제 2 · 지난 주문 1개 포함'), '같은 상품·옵션 줄 안에 지난 주문 포함 표시');
assert.ok(text().includes('다른 출고로 넘긴 상품 1개는 여기서 뺐어요'));
assert.ok(!text().includes('넘겨받'), '어색한 「넘겨받음」 문구 없음');
// 챙길 = 결제완료 3+1+1(지난)+1(블랙M 7) = 6
assert.ok(text().includes('남은 6개') && text().includes('챙긴 0 / 전체 6'), '머리는 «남은 N개»가 크게');
assert.ok(text().includes('남은 5개 챙김'), '옵션 줄 한 번에 챙기기(결제완료·안 챙긴 것만)');
const nodeText = (n) => typeof n === 'string' ? n : (n.children || []).map(nodeText).join('');
const rowBtn = nick => tree.root.findAll(n => n.type === 'button' && n.props['aria-pressed'] !== undefined && nodeText(n).includes(nick))[0];
await act(async () => { await rowBtn('고객1').props.onClick(); });
assert.equal(writes.at(-1).ids.map(String).join(), '1', 'picked_at 저장은 그 줄만');
assert.ok(rows.get(1).picked_at, '서버 값이 바뀐 뒤 완료 표시');
assert.equal(rowBtn('고객1').props['aria-pressed'], true);
// 미결제 줄도 사장님 판단으로 챙길 수 있음(2026-10-21 규칙 유지)
await act(async () => { await rowBtn('고객3').props.onClick(); });
assert.equal(writes.at(-1).ids.map(String).join(), '3');
// 고객별 보기
await act(async () => tabs[1].props.onClick());
assert.ok(text().includes('고객9') || text().includes('지난 주문 10.11(일)'), '고객별에도 지난 주문 표시');
// 모두 챙김 = 결제완료·안 챙긴 것만
writes.length = 0;
const all = tree.root.findAll(n => n.type === 'button' && n.children.join('') === '모두 챙김')[0];
await act(async () => { await all.props.onClick(); });
assert.deepEqual(writes.at(-1).ids.map(String).sort(), ['2','5','7'], '미결제(3)·이미 챙긴(1) 제외');
// 환불 이슈 걸린 줄 — 숫자에서 빠지고 「환불 · 챙기지 마세요」
const issueRows = mod.buildPickRows([order(11, 'paid', [it(21, 1, '레드', 'S'), it(22, 1, '블랙', 'M')], {returnStatus: '반품(환불)', returnReason: '[반품(환불)] 대상: 알로 부츠컷팬츠(블랙/M)×1'})], 'scope').rows;
assert.equal(issueRows.find(r => r.id === '22').skip, true);
assert.equal(issueRows.find(r => r.id === '21').skip, undefined, '대상 아닌 줄은 그대로');
assert.equal(mod.includedNote(issueRows.filter(r => r.color === '블랙')), '환불 1개 빼고');
// 옵션 「남은 n개 챙김」 → 그 옵션의 결제완료·안 챙긴 줄만 저장, 다 챙긴 상품은 한 줄로 접힘
await act(async () => tabs[0].props.onClick());
// 블랙/M 상품은 다 챙겨서 한 줄로 접혀 있다 → 눌러 펼치고 고객6 체크를 풀었다가 옵션 버튼으로 다시
assert.ok(text().includes('6개 다 챙김'), '다 챙긴 상품은 한 줄로 접힘');
await act(async () => tree.root.findAll(n => n.type === 'button' && nodeText(n).includes('6개 다 챙김'))[0].props.onClick());
await act(async () => { await rowBtn('고객6').props.onClick(); });
const optBtn = tree.root.findAll(n => n.type === 'button' && nodeText(n) === '남은 1개 챙김')[0];
await act(async () => { await optBtn.props.onClick(); });
assert.deepEqual(writes.at(-1).ids.map(String), ['7']);
console.log('test-picking-panel: ok');
