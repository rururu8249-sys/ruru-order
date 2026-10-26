// [2026-10-26] 재고 흐름 — 읽기 규칙·전후 비교·판매 판정·관리자 수정 기록(가짜 DB)
import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load = createUiLoader();
const F = load('lib/stockFlow.ts');
const S = load('lib/stockFlowServer.ts');

const note = (variants, extra = {}) => JSON.stringify({ stock_variants: variants, ...extra });
// 옵션 재고: 없음 → 빈칸, 같은 칸 합침
assert.deepEqual(F.stockMapFromProductRow({ product_note: note([{color:'블랙',size:'M',stock:'3'},{color:'블랙',size:'없음',stock:2},{color:'',size:'',stock:'1'}]) }),
  { '블랙|M': 3, '블랙|': 2, '|': 1 });
// 재고 관리 OFF → null
assert.equal(F.stockMapFromProductRow({ product_note: note([{color:'a',size:'',stock:1}], { stock_management_enabled: false }), stock: 5 }), null);
// 옵션 없는 상품 → 총재고
assert.deepEqual(F.stockMapFromProductRow({ product_note: '{}', stock: 7 }), { '|': 7 });
assert.equal(F.stockMapFromProductRow({ product_note: '{}', stock: null }), null);

// 전후 비교
assert.deepEqual(F.diffStockMaps({ 'a|M': 5, 'a|L': 2 }, { 'a|M': 12, 'a|S': 3 }).map(c=>[c.key,c.delta]).sort(), [['a|L',-2],['a|M',7],['a|S',3]]);
assert.deepEqual(F.diffStockMaps({ 'a|M': 5 }, { 'a|M': 5 }), []);

// 판매로 세는 주문
assert.equal(F.orderRowCountsAsSold({ qty: 1 }), true);
assert.equal(F.orderRowCountsAsSold({ inventory_deduction_status: 'skipped_direct_input' }), false);
assert.equal(F.orderRowCountsAsSold({ inventory_restored_at: '2026-10-26' }), false);
assert.equal(F.orderRowCountsAsSold({ is_deleted: true }), false);
assert.equal(F.orderRowCountsAsSold({ admin_order_status_v2: '주문서취소' }), false);

// 흐름: 시작 10 → +7 −2 → 판매 9 → 지금 6 (맞음)
let lines = F.buildStockFlowLines({ base: { '블랙|M': 10 }, now: { '블랙|M': 6 },
  edits: [{ color:'블랙', size:'M', change_qty: 7 }, { color:'블랙', size:'M', change_qty: -2 }],
  sold: [{ color:'블랙', size:'M', qty: 4 }, { color:'블랙', size:'M', qty: 5 }] });
assert.deepEqual(lines[0], { key:'블랙|M', color:'블랙', size:'M', base:10, added:7, removed:2, sold:9, now:6, diff:0 });
// 누락 1개 → 차이 −1
lines = F.buildStockFlowLines({ base: { '블랙|M': 10 }, now: { '블랙|M': 5 }, edits: [], sold: [{ color:'블랙', size:'M', qty: 4 }] });
assert.equal(lines[0].diff, -1);
// 옵션 없는 상품에 「없음」 붙은 주문 → 한 줄로
lines = F.buildStockFlowLines({ base: { '|': 5 }, now: { '|': 3 }, edits: [], sold: [{ color:'없음', size:'없음', qty: 2 }] });
assert.equal(lines.length, 1); assert.equal(lines[0].sold, 2); assert.equal(lines[0].diff, 0);
// 기준 뒤 새로 만든 옵션 → 시작 없음, 추가로 보임
lines = F.buildStockFlowLines({ base: { 'a|M': 1 }, now: { 'a|M': 1, 'a|L': 4 }, edits: [{ color:'a', size:'L', change_qty: 4 }], sold: [] });
assert.deepEqual(lines.map(l=>[l.key,l.base,l.added,l.diff]), [['a|M',1,0,0],['a|L',null,4,0]]);

assert.equal(F.stockFlowScopeKey('bc:abc-123'), 'stock_flow_base:bc:abc-123');
assert.equal(F.stockFlowScopeKey('day:2026-10-26'), 'stock_flow_base:day:2026-10-26');
assert.equal(F.stockFlowScopeKey('x; drop'), null);

// 서버: 저장 요청에서 상품 id·재고 칸 감지
assert.deepEqual(S.productIdsFromWrite([{ type:'eq', col:'id', val: 677 }], {}), ['677']);
assert.deepEqual(S.productIdsFromWrite([{ type:'in', col:'id', val: [1,2] }], {}), ['1','2']);
assert.deepEqual(S.productIdsFromWrite([], [{ id: 5, product_note: '{}' }]), ['5']);
assert.equal(S.writeTouchesStock({ product_note: '{}' }), true);
assert.equal(S.writeTouchesStock({ status: '숨김' }), false);
assert.equal(S.writeTouchesStock({ in_shop: false }), false);

// 가짜 DB — 관리자 수정 기록은 inventory_ledger 에만, 재고 표엔 쓰기 0
function fakeSb() {
  const writes = [];
  const settings = new Map();
  const products = new Map([['10', { id: 10, product_note: note([{color:'블랙',size:'M',stock:6}]), stock: 6 }]]);
  const chain = (table) => {
    const st = { table, filters: [] };
    const api = {
      select() { return api; }, limit() { return api; }, order() { return api; },
      eq(c, v) { st.filters.push([c, v]); return api; },
      in(c, v) { st.filters.push([c, v]); return api; },
      insert(v) { writes.push([table, 'insert', v]); if (table === 'settings') settings.set(v.key, v.value); return Promise.resolve({ error: null }); },
      update(v) { writes.push([table, 'update', v]); return { eq: (c, k) => { if (table === 'settings') settings.set(k, v.value); return Promise.resolve({ error: null }); } }; },
      then(res) {
        let data = [];
        if (table === 'products') data = [...products.values()];
        if (table === 'settings') { const k = st.filters.find(f => f[0] === 'key')?.[1]; data = settings.has(k) ? [{ key: k, value: settings.get(k) }] : []; }
        return Promise.resolve({ data, error: null }).then(res);
      },
    };
    return api;
  };
  return { sb: { from: chain }, writes, settings, products };
}
{
  const { sb, writes } = fakeSb();
  const before = new Map([['10', { id: 10, product_note: note([{color:'블랙',size:'M',stock:6}]) }]]);
  const after = new Map([['10', { id: 10, product_note: note([{color:'블랙',size:'M',stock:13},{color:'블랙',size:'L',stock:2}]) }]]);
  await S.logAdminStockEdits(sb, before, after, 'admin');
  const ins = writes.filter(w => w[1] === 'insert');
  assert.equal(ins.length, 1); assert.equal(ins[0][0], 'inventory_ledger');
  assert.deepEqual(ins[0][2].map(r => [r.color, r.size, r.change_qty, r.reason]).sort(), [['블랙','L',2,'admin_stock_edit'],['블랙','M',7,'admin_stock_edit']]);
  assert.ok(!writes.some(w => w[0] === 'products' || w[0] === 'product_inventory_variants'), '재고 표 쓰기 0');
}
{
  // 기준 찍기 — 처음 한 번만, 두 번째엔 그대로
  const { sb, writes, settings, products } = fakeSb();
  const b1 = await S.ensureStockFlowBase(sb, 'bc:B1', ['10']);
  assert.deepEqual(b1.items['10'].stock, { '블랙|M': 6 });
  products.get('10').product_note = note([{color:'블랙',size:'M',stock:1}]);
  const b2 = await S.ensureStockFlowBase(sb, 'bc:B1', ['10']);
  assert.deepEqual(b2.items['10'].stock, { '블랙|M': 6 }, '이미 찍은 기준은 안 바뀜');
  assert.ok(settings.has('stock_flow_base:bc:B1'));
  assert.ok(!writes.some(w => w[0] === 'products'), '상품 표 쓰기 0');
  // 실패해도 throw 안 함
  assert.equal(await S.ensureStockFlowBase({ from() { throw new Error('x'); } }, 'bc:B1', ['10']), null);
}
console.log('test-stock-flow OK');

// 화면: 창이 숫자를 그대로 보여 주는지(가짜 응답)
{
  const React = (await import('react')).default;
  const { default: Renderer, act } = await import('react-test-renderer');
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => ({ ok: true, live: true, products: {
    '10': { at: '2026-10-26T13:00:00Z', managed: true, soldBefore: 3, edits: [{ color:'블랙', size:'M', delta: 7, at: '2026-10-26T13:30:00Z' }],
      lines: [{ key:'블랙|M', color:'블랙', size:'M', base:10, added:7, removed:2, sold:9, now:5, diff:-1 }] },
  } }) });
  const Modal = load('components/admin-live/StockFlowModal.tsx').default;
  let tree;
  await act(async () => { tree = Renderer.create(React.createElement(Modal, { scope: 'bc:B1', title: '10.26 방송', products: [{ id: '10', name: '폴로 셔츠' }], onClose() {} })); });
  const txt = (inst) => inst.children.map((c) => typeof c === 'string' ? c : txt(c)).join('');
  const text = txt(tree.root);
  for (const s of ['재고 흐름', '폴로 셔츠', '기록 시작 전 이 방송 판매 3개', '차이 1줄', '추가 +7']) assert.ok(text.includes(s), `화면에 ${s}`);
  const tds = tree.root.findAllByType('td').map(txt);
  assert.equal(tds[0], '블랙 / M차이 -1');
  assert.deepEqual(tds.slice(1), ['10', '+7', '−2', '−9', '5']);
  await act(async () => tree.unmount());
}
console.log('test-stock-flow UI OK');
