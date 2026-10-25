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
assert.deepEqual(tabs.map(t => t.children.join('')), ['상품별', '손님별'], '보기는 상품별·손님별 두 개뿐');
assert.equal(tabs[0].props['aria-selected'], true, '기본 = 상품별');
const nodeText = (n) => typeof n === 'string' ? n : (n.children || []).map(nodeText).join('');
const btn = (f) => tree.root.findAll(n => n.type === 'button' && f(n));
const byText = (t) => btn(n => nodeText(n) === t)[0];
const byLabel = (l) => btn(n => n.props['aria-label'] === l)[0];
const counter = () => nodeText(byLabel('전체 목록'));
// 머리: 결제완료 3+1+1(지난)+1(블랙M 7) = 6, 미결제는 따로
assert.ok(text().includes('챙겨야 할 남은 수량 6개') && text().includes('챙긴 0 / 총 주문수량 6'));
assert.ok(text().includes('미결제 2개 따로 · 보기'), '미결제는 한 줄로 따로');
assert.ok(!text().includes('고객3'), '기본엔 미결제 손님 안 보임');
assert.ok(!text().includes('요약') && !text().includes('안 챙긴 것만') && !text().includes('접기'), '옛 요약·안 챙긴 것만·접기 없음');
assert.ok(text().includes('다른 출고로 넘긴 상품 1개는 여기서 뺐어요'));
assert.equal(counter(), '상품 1 / 1전체 목록', '상품별 한 장 = 상품 하나');
await act(async () => btn(n => nodeText(n).startsWith('미결제 2개 따로'))[0].props.onClick());
assert.ok(text().includes('고객3') && text().includes('입금 확인 전엔 챙기지 마세요'), '보기 누르면 미결제 섞여 보임 + 경고');
assert.ok(text().includes('미결제 2 · 지난 주문 1개 포함'), '같은 옵션 줄 안에 지난 주문 포함 표시');
assert.ok(!text().includes('넘겨받'), '어색한 「넘겨받음」 문구 없음');
// 줄 체크는 □ 칸만 — 줄은 눌러도 아무 일 없음
const rowBtn = nick => btn(n => (n.props['aria-label'] === '챙김' || n.props['aria-label'] === '챙김 해제') && nodeText(n.parent).includes(nick))[0];
assert.equal(rowBtn('고객1').parent.props.onClick, undefined);
await act(async () => { await rowBtn('고객1').props.onClick(); });
assert.equal(writes.at(-1).ids.map(String).join(), '1', 'picked_at 저장은 그 줄만');
assert.equal(rowBtn('고객1').props['aria-pressed'], true);
await act(async () => { await rowBtn('고객3').props.onClick(); });
assert.equal(writes.at(-1).ids.map(String).join(), '3', '미결제 줄도 사장님 판단으로 직접 체크 가능');
// 큰 버튼 = 이 상품의 결제완료·안 챙긴 것만(미결제·이미 챙긴 것 제외)
const pageBtn = () => btn(n => /^이 (상품|손님) 남은 \d+개 다 챙김$/.test(nodeText(n)))[0];
assert.equal(nodeText(pageBtn()), '이 상품 남은 3개 다 챙김');
await act(async () => { await pageBtn().props.onClick(); });
assert.deepEqual(writes.at(-1).ids.map(String).sort(), ['2','5','7']);
assert.ok(text().includes('✓ 다 챙겼어요'), '다 챙기면 그 장에 남아 「다 챙겼어요」');
// 손님별 = 한 장에 손님 하나, 끝없이 돈다
await act(async () => tabs[1].props.onClick());
assert.equal(counter(), '손님 1 / 5전체 목록');
await act(async () => byLabel('이전').props.onClick());
assert.equal(counter(), '손님 5 / 5전체 목록', '처음에서 이전 = 마지막');
await act(async () => byLabel('다음').props.onClick());
assert.equal(counter(), '손님 1 / 5전체 목록', '마지막에서 다음 = 처음');
// 전부 해제 — 확인 뒤 챙긴 줄만 false
await act(async () => { await byText('전부 해제').props.onClick(); });
assert.equal(writes.at(-1).payload.picked_at, null, '해제 = picked_at 비움');
// 손님 다 챙김 → 다음 «남은» 손님 장으로
assert.equal(nodeText(pageBtn()), '이 손님 남은 3개 다 챙김', '고객1 3개');
await act(async () => { await pageBtn().props.onClick(); });
assert.deepEqual(writes.at(-1).ids.map(String), ['1']);
assert.equal(counter(), '손님 2 / 5전체 목록', '다 챙기면 다음 장으로');
// 전체 목록 → 눌러서 그 장으로
await act(async () => byLabel('전체 목록').props.onClick());
assert.ok(text().includes('전체 목록 · 손님 5명'));
const listItem = btn(n => nodeText(n).startsWith('4고객6'))[0];
await act(async () => listItem.props.onClick());
assert.equal(counter(), '손님 4 / 5전체 목록', '목록에서 누르면 그 장');
// 모두 챙김 = 결제완료·안 챙긴 것만
await act(async () => { await byText('모두 챙김').props.onClick(); });
assert.deepEqual(writes.at(-1).ids.map(String).sort(), ['2','5','7'], '미결제(3)·이미 챙긴(1) 제외');
// 환불 이슈 걸린 줄 — 숫자에서 빠지고 「환불 · 챙기지 마세요」
const issueRows = mod.buildPickRows([order(11, 'paid', [it(21, 1, '레드', 'S'), it(22, 1, '블랙', 'M')], {returnStatus: '반품(환불)', returnReason: '[반품(환불)] 대상: 알로 부츠컷팬츠(블랙/M)×1'})], 'scope').rows;
assert.equal(issueRows.find(r => r.id === '22').skip, true);
assert.equal(issueRows.find(r => r.id === '21').skip, undefined, '대상 아닌 줄은 그대로');
assert.equal(mod.includedNote(issueRows.filter(r => r.color === '블랙')), '환불 1개 빼고');
console.log('test-picking-panel: ok');
