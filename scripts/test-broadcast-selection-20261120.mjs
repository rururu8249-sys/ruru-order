/** Actual broadcast-management UI; only external IO is replaced by fixtures.
 * Catches selected-row promotion, disappearing filter exceptions and stale product reads.
 * Run: node scripts/test-broadcast-selection-20261120.mjs [case ...]
 */
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { createUiLoader } from './admin-ui-test-loader.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const day = 86400000;
const date = daysAgo => new Date(Date.now() - daysAgo * day).toISOString();
const baseBroadcasts = [
  { id: 'A', public_title: '방송 A', status: 'ON', started_at: date(1) },
  { id: 'B', public_title: '방송 B', status: 'OFF', started_at: date(2) },
  { id: 'C', public_title: '방송 C', status: 'OFF', started_at: date(3) },
];
const old = { id: 'OLD', public_title: '지난 방송', status: 'OFF', started_at: date(130) };
const draft = { id: 'DRAFT', public_title: '준비 방송', status: 'OFF', started_at: null };
const products = ['A', 'B', 'C', 'OLD', 'DRAFT', 'NEW'].map((name, i) => ({ id: i + 1, product_name: '상품 ' + name, price: 10000 }));
const productIds = { A: 1, B: 2, C: 3, OLD: 4, DRAFT: 5, NEW: 6 };
const textOf = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(textOf).join('');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function mount({ broadcasts = baseBroadcasts, hidden = [], active = 'A', onWrite, onCreate, catalogRead, pins = {}, linked = {} } = {}) {
  const events = new Map();
  const add = (name, fn) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); };
  const remove = (name, fn) => events.get(name)?.delete(fn);
  globalThis.window = { innerWidth: 1200, addEventListener: add, removeEventListener: remove,
    dispatchEvent(event) { for (const fn of events.get(event.type) || []) fn(event); },
    localStorage: { getItem: () => null, setItem() {} }, setInterval: () => 1, clearInterval() {} };
  globalThis.document = { querySelector: () => null, visibilityState: 'visible', addEventListener: add, removeEventListener: remove };
  const queue = new Map(), calls = [], writes = [], notices = [];
  const links = id => linked[id] || [{ product_id: productIds[id], sort_order: 0 }];
  const database = { from(table) {
    let columns = '', broadcastId = '', isHidden = false, single = false;
    const query = {
      select(value) { columns = value; return query; },
      eq(key, value) { if (key === 'broadcast_id' || (table === 'broadcasts' && key === 'id')) broadcastId = String(value); if (key === 'is_deleted') isHidden = value === true; return query; },
      neq() { return query; }, order() { return query; }, limit() { return query; }, range() { return query; },
      maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        calls.push({ table, columns, broadcastId });
        let result;
        if (table === 'products') result = catalogRead ? catalogRead() : { data: products, error: null };
        else if (table === 'broadcasts') result = { data: single ? (pins[broadcastId] || { widget_pin_mode: 'auto', widget_pin_product_id: null, widget_pin_detail_name: null }) : isHidden ? hidden : broadcasts, error: null };
        else if (table === 'broadcast_products' && columns === 'product_id, sort_order') {
          const next = queue.get(broadcastId)?.shift();
          result = next || { data: links(broadcastId), error: null };
        } else if (table === 'broadcast_products' && columns === 'product_id') result = { data: links(broadcastId), error: null };
        else throw new Error('Unexpected database read: ' + table + '/' + columns);
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  } };
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(options.method || 'GET', 'GET', 'selection must not issue a write');
    let payload;
    if (url === '/api/admin-live/product-brand-catalog') payload = { links: [] };
    else if (String(url).startsWith('/api/admin-live/widget-library')) payload = { ok: true, history: [], rotation: { mode: 'all', paused: false, targets: [] } };
    else throw new Error('Unexpected HTTP read: ' + url);
    return { ok: true, json: async () => payload };
  };
  const Panel = createUiLoader({
    './WidgetProductLibraryPanel.module.css': { default: {} },
    '@/lib/supabase': { supabase: database },
    '@/lib/adminToast': { showAdminToast: (...args) => notices.push(args) },
    '@/lib/adminCatalogWrite': { adminCatalogWrite: args => { writes.push(args); if (onWrite) return onWrite(args); throw new Error('Unexpected database write'); } },
    './liveBroadcastController': { createDraftBroadcast: title => { if (onCreate) return onCreate(title); throw new Error('Unexpected broadcast creation'); } },
  })('components/admin-live/AdminLiveProductManagePopup.tsx').default;
  let tree;
  await act(async () => { tree = Renderer.create(React.createElement(Panel, { embedded: true, initialTab: 'broadcast', activeBroadcastId: active, onClose() {} })); });
  const rows = () => tree.root.findAll(n => n.type === 'button' && n.props.className === 'group');
  const titles = () => rows().map(n => n.findAllByType('span').map(textOf).find(t => broadcasts.some(b => b.public_title === t)));
  const visibleProducts = () => tree.root.findAll(n => n.type === 'button' && /^상품 .+ 더보기$/.test(n.props['aria-label'] || '')).map(n => n.props['aria-label']);
  const click = async label => {
    const button = tree.root.findAll(n => n.type === 'button' && textOf(n) === label)[0];
    assert.ok(button, 'Missing button: ' + label);
    await act(async () => { button.props.onClick(); });
  };
  const select = async title => {
    const button = rows().find(n => n.findAllByType('span').some(s => textOf(s) === title));
    assert.ok(button, 'Missing broadcast: ' + title);
    await act(async () => { button.props.onClick(); });
  };
  const search = async value => { await act(async () => { tree.root.findByProps({ placeholder: '방송 이름 검색' }).props.onChange({ target: { value } }); }); };
  return { tree, titles, visibleProducts, click, select, search, writes, notices, calls,
    enqueue(id, value) { if (!queue.has(id)) queue.set(id, []); queue.get(id).push(value); },
    result(id) { return { data: links(id), error: null }; },
    async refresh() { await act(async () => window.dispatchEvent(new Event('ruru-broadcast-list-updated'))); },
    async close() { await act(async () => tree.unmount()); if (!onWrite) assert.deepEqual(writes, [], 'read interactions changed persisted data'); },
  };
}

const cases = {
  async stationary() {
    const ui = await mount();
    try {
      assert.deepEqual(ui.titles(), ['방송 A', '방송 B', '방송 C']);
      for (const id of ['C', 'B', 'A', 'C']) {
        await ui.select('방송 ' + id);
        assert.deepEqual(ui.titles(), ['방송 A', '방송 B', '방송 C'], 'click moved a broadcast row');
        assert.deepEqual(ui.visibleProducts(), ['상품 ' + id + ' 더보기']);
      }
    } finally { await ui.close(); }
  },
  async filters() {
    const ui = await mount({ broadcasts: [draft, ...baseBroadcasts, old] });
    try {
      assert.deepEqual(ui.titles(), ['방송 A', '준비 방송', '방송 B', '방송 C']);
      await ui.click('전체'); await ui.select('지난 방송'); await ui.click('최근 30일');
      const expected = ['방송 A', '준비 방송', '방송 B', '방송 C', '지난 방송'];
      assert.deepEqual(ui.titles(), expected, 'selected old broadcast should remain in its original position');
      await ui.select('방송 B');
      assert.deepEqual(ui.titles(), expected, 'click removed a retained filter exception');
      await ui.click('최근 30일');
      assert.deepEqual(ui.titles(), expected, 'reclicking the active filter moved rows');
      await ui.refresh();
      assert.deepEqual(ui.titles(), expected, 'refresh discarded current filter context');
      await ui.search('방송 C');
      assert.deepEqual(ui.titles(), ['방송 A', '방송 B', '방송 C']);
      await ui.select('방송 C');
      assert.deepEqual(ui.titles(), ['방송 A', '방송 B', '방송 C']);
      await ui.search('없는 제목');
      assert.deepEqual(ui.titles(), ['방송 A', '방송 C']);
    } finally { await ui.close(); }
  },
  async initial_old() {
    const ui = await mount({ broadcasts: [old], active: null });
    try { assert.deepEqual(ui.titles(), ['지난 방송']); assert.deepEqual(ui.visibleProducts(), ['상품 OLD 더보기']); }
    finally { await ui.close(); }
  },
  async fallback_empty() {
    const broadcasts = [...baseBroadcasts, old];
    const ui = await mount({ broadcasts });
    try {
      await ui.select('방송 B');
      broadcasts.splice(0, broadcasts.length, old);
      await ui.refresh();
      assert.deepEqual(ui.titles(), ['지난 방송']);
      assert.deepEqual(ui.visibleProducts(), ['상품 OLD 더보기']);
      broadcasts.splice(0); await ui.refresh();
      assert.deepEqual(ui.titles(), []); assert.deepEqual(ui.visibleProducts(), []);
    } finally { await ui.close(); }
  },
  async create_preferred() {
    const broadcasts = [...baseBroadcasts]; let created = 0;
    const ui = await mount({ broadcasts, onCreate: async title => {
      created++; assert.equal(title, '새 준비');
      broadcasts.push({ id: 'NEW', public_title: title, started_at: null, status: 'OFF' });
      return { id: 'NEW' };
    } });
    try {
      await ui.search('없는 제목'); await ui.click('+ 새 방송');
      await act(async () => ui.tree.root.findByProps({ placeholder: '예: 0617 저녁 라이브' }).props.onChange({ target: { value: '새 준비' } }));
      await ui.click('만들기');
      assert.equal(created, 1); assert.equal(broadcasts[0].status, 'ON');
      assert.deepEqual(ui.titles(), ['방송 A', '새 준비']);
      assert.deepEqual(ui.visibleProducts(), ['상품 NEW 더보기']);
      await ui.select('방송 A'); assert.deepEqual(ui.titles(), ['방송 A', '새 준비']);
    } finally { await ui.close(); }
  },
  async restore_preferred() {
    const broadcasts = [...baseBroadcasts], hidden = [old];
    const ui = await mount({ broadcasts, hidden, onWrite: async args => {
      assert.deepEqual(args, { table: 'broadcasts', op: 'update', values: { is_deleted: false }, filters: [{ type: 'eq', col: 'id', val: 'OLD' }] });
      broadcasts.push(hidden.pop()); return { data: null, error: null };
    } });
    try {
      await ui.search('없는 제목'); await ui.click('숨긴 방송 1개 보기'); await ui.click('되살리기');
      assert.equal(ui.writes.length, 1);
      assert.deepEqual(ui.titles(), ['방송 A', '지난 방송']);
      assert.deepEqual(ui.visibleProducts(), ['상품 OLD 더보기']);
      await ui.select('방송 A'); assert.deepEqual(ui.titles(), ['방송 A', '지난 방송']);
    } finally { await ui.close(); }
  },
  async rename_preferred() {
    const broadcasts = [{ ...draft }, ...baseBroadcasts];
    const ui = await mount({ broadcasts, onWrite: async args => {
      assert.deepEqual(args, { table: 'broadcasts', op: 'update', values: { public_title: '다른 제목' },
        filters: [{ type: 'eq', col: 'id', val: 'DRAFT' }, { type: 'eq', col: 'public_title', val: '준비 방송' }, { type: 'eq', col: 'status', val: 'OFF' }], select: 'id,public_title', single: true });
      broadcasts[0].public_title = '다른 제목'; return { data: { id: 'DRAFT', public_title: '다른 제목' }, error: null };
    } });
    try {
      await ui.select('준비 방송'); await ui.search('준비'); await ui.click('방송명 수정');
      await act(async () => ui.tree.root.findByProps({ 'aria-label': '준비 방송 제목 수정' }).props.onChange({ target: { value: '다른 제목' } }));
      await ui.click('저장'); assert.equal(ui.writes.length, 1);
      assert.deepEqual(ui.titles(), ['방송 A', '다른 제목']);
      assert.deepEqual(ui.visibleProducts(), ['상품 DRAFT 더보기']);
      await ui.select('방송 A'); assert.deepEqual(ui.titles(), ['방송 A', '다른 제목']);
    } finally { await ui.close(); }
  },
  async external_rename_selected() {
    const broadcasts = [{ ...draft }, ...baseBroadcasts];
    const ui = await mount({ broadcasts });
    try {
      await ui.search('준비'); await ui.select('준비 방송');
      broadcasts[0].public_title = '다른 화면에서 수정'; await ui.refresh();
      assert.deepEqual(ui.titles(), ['방송 A', '다른 화면에서 수정'], 'external rename hid the selected broadcast');
      assert.deepEqual(ui.visibleProducts(), ['상품 DRAFT 더보기']);
      await ui.select('방송 A');
      assert.deepEqual(ui.titles(), ['방송 A', '다른 화면에서 수정'], 'click after external rename removed a visible row');
    } finally { await ui.close(); }
  },
  async custom_dates() {
    const ui = await mount({ broadcasts: [draft, ...baseBroadcasts, old] });
    try {
      await ui.click('전체'); await ui.select('지난 방송'); await ui.click('기간 선택');
      await act(async () => ui.tree.root.findAll(n => n.type === 'input' && n.props.type === 'date')[0].props.onChange({ target: { value: '2100-01-01' } }));
      await act(async () => ui.tree.root.findAll(n => n.type === 'input' && n.props.type === 'date')[1].props.onChange({ target: { value: '2199-12-31' } }));
      assert.deepEqual(ui.titles(), ['방송 A', '준비 방송', '지난 방송']);
      await ui.select('준비 방송'); assert.deepEqual(ui.titles(), ['방송 A', '준비 방송', '지난 방송']);
      await act(async () => ui.tree.root.findAll(n => n.type === 'input' && n.props.type === 'date')[1].props.onChange({ target: { value: '2198-12-31' } }));
      assert.deepEqual(ui.titles(), ['방송 A', '준비 방송']);
    } finally { await ui.close(); }
  },
  async optimistic_reorder_late_refresh() {
    const write = deferred(), read = deferred();
    const ui = await mount({ linked: { A: [{ product_id: 1, sort_order: 0 }, { product_id: 4, sort_order: 1 }] }, onWrite: args => {
      assert.deepEqual(args, { table: 'broadcast_products', op: 'update', values: { sort_order: 0 }, filters: [{ type: 'eq', col: 'broadcast_id', val: 'A' }, { type: 'eq', col: 'product_id', val: '4' }] });
      return write.promise;
    } });
    try {
      const dragRows = () => ui.tree.root.findAll(n => n.type === 'div' && typeof n.props.onDragStart === 'function');
      await act(async () => dragRows()[0].props.onDragStart());
      await act(async () => dragRows()[1].props.onDrop({ preventDefault() {} }));
      assert.deepEqual(ui.visibleProducts(), ['상품 OLD 더보기', '상품 A 더보기'], 'optimistic reorder was lost');
      assert.equal(ui.writes.length, 1);
      ui.enqueue('B', read.promise); await ui.select('방송 B');
      const aReads = ui.calls.filter(c => c.table === 'broadcast_products' && c.columns === 'product_id, sort_order' && c.broadcastId === 'A').length;
      await act(async () => write.resolve({ data: null, error: { message: 'delayed save failure' } }));
      assert.equal(ui.calls.filter(c => c.table === 'broadcast_products' && c.columns === 'product_id, sort_order' && c.broadcastId === 'A').length, aReads, 'old save started a stale read');
      await act(async () => read.resolve(ui.result('B')));
      assert.deepEqual(ui.visibleProducts(), ['상품 B 더보기'], 'old mutation invalidated latest selected read');
    } finally { await act(async () => { write.resolve({ error: { message: 'fixture cleanup' } }); read.resolve(ui.result('B')); }); await ui.close(); }
  },
  async pending() {
    const ui = await mount(); const gate = deferred();
    try {
      ui.enqueue('B', gate.promise); await ui.select('방송 B');
      assert.deepEqual(ui.visibleProducts(), [], 'previous broadcast actions remained while B was loading');
      assert.ok(ui.tree.root.findAll(n => n.props.role === 'status' && textOf(n).includes('상품')).length, 'loading must be distinct from an empty broadcast');
      const add = ui.tree.root.findAll(n => n.type === 'button' && textOf(n) === '+ 담기')[0];
      assert.equal(add.props.disabled, true, 'adding before membership is known could duplicate links');
    } finally { await act(async () => gate.resolve(ui.result('B'))); await ui.close(); }
  },
  async stale_response() {
    const ui = await mount(); const gate = deferred();
    try {
      ui.enqueue('B', gate.promise); await ui.select('방송 B'); await ui.select('방송 C');
      assert.deepEqual(ui.visibleProducts(), ['상품 C 더보기']);
      await act(async () => gate.resolve(ui.result('B')));
      assert.deepEqual(ui.visibleProducts(), ['상품 C 더보기'], 'late B response replaced selected C');
    } finally { await act(async () => gate.resolve(ui.result('B'))); await ui.close(); }
  },
  async same_id_revision() {
    const ui = await mount(); const gate = deferred();
    try {
      ui.enqueue('B', gate.promise); await ui.select('방송 B'); await ui.select('방송 C');
      ui.enqueue('B', { data: [], error: null }); await ui.select('방송 B');
      assert.deepEqual(ui.visibleProducts(), []);
      await act(async () => gate.resolve(ui.result('B')));
      assert.deepEqual(ui.visibleProducts(), [], 'earlier B request replaced a newer B result');
    } finally { await act(async () => gate.resolve(ui.result('B'))); await ui.close(); }
  },
  async failed_read() {
    const ui = await mount();
    try {
      ui.enqueue('B', { data: null, error: { message: 'fixture read failed' } }); await ui.select('방송 B');
      assert.deepEqual(ui.visibleProducts(), []);
      assert.ok(ui.tree.root.findAll(n => n.props.role === 'alert' && textOf(n).includes('상품')).length, 'failed query was presented as an empty broadcast');
      await ui.click('다시 불러오기');
      assert.deepEqual(ui.visibleProducts(), ['상품 B 더보기']);
    } finally { await ui.close(); }
  },
  async returning_selection_pending() {
    const ui = await mount(); const b = deferred(), a = deferred();
    try {
      ui.enqueue('B', b.promise); await ui.select('방송 B');
      ui.enqueue('A', a.promise); await ui.select('방송 A');
      assert.deepEqual(ui.visibleProducts(), [], 'reselected A exposed cached actions before the new selection read');
      assert.ok(ui.tree.root.findAll(n => n.props.role === 'status' && textOf(n).includes('상품')).length);
      await act(async () => a.resolve({ data: [], error: null }));
      assert.deepEqual(ui.visibleProducts(), []);
      await act(async () => b.resolve(ui.result('B')));
      assert.deepEqual(ui.visibleProducts(), []);
    } finally { await act(async () => { a.resolve({ data: [], error: null }); b.resolve(ui.result('B')); }); await ui.close(); }
  },
  async catalog_pending_error_retry() {
    const gate = deferred(); let answer = gate.promise;
    const ui = await mount({ catalogRead: () => answer });
    try {
      assert.deepEqual(ui.visibleProducts(), []);
      assert.ok(ui.tree.root.findAll(n => n.props.role === 'status' && textOf(n).includes('상품')).length, 'pending catalog was reported as no broadcast products');
      assert.equal(ui.tree.root.findAll(n => n.type === 'button' && textOf(n) === '+ 담기')[0].props.disabled, true);
      await act(async () => gate.resolve({ data: null, error: { message: 'catalog unavailable' } }));
      assert.ok(ui.tree.root.findAll(n => n.props.role === 'alert' && textOf(n).includes('상품')).length, 'failed catalog was reported as no broadcast products');
      answer = { data: products, error: null }; await ui.click('다시 불러오기');
      assert.deepEqual(ui.visibleProducts(), ['상품 A 더보기']);
    } finally { await act(async () => gate.resolve({ data: products, error: null })); await ui.close(); }
  },
  async pin_membership_pending_error() {
    const gate = deferred();
    const ui = await mount({ pins: { B: { widget_pin_mode: 'pin', widget_pin_product_id: '2', widget_pin_detail_name: null } } });
    try {
      ui.enqueue('B', gate.promise); await ui.select('방송 B');
      assert.equal(textOf(ui.tree.toJSON()).includes('이 방송 상품 목록에 없는 상품'), false, 'unknown membership was reported as absent');
      assert.equal(ui.tree.root.findAll(n => n.type === 'button' && textOf(n) === '소개 끝').length, 0, 'pin actions appeared before product membership loaded');
      await act(async () => gate.resolve({ data: null, error: { message: 'link unavailable' } }));
      assert.equal(textOf(ui.tree.toJSON()).includes('이 방송 상품 목록에 없는 상품'), false);
      assert.equal(ui.tree.root.findAll(n => n.type === 'button' && textOf(n) === '소개 끝').length, 0);
      await ui.click('다시 불러오기');
      assert.equal(ui.tree.root.findAll(n => n.type === 'button' && textOf(n) === '소개 끝').length, 1);
      assert.equal(textOf(ui.tree.toJSON()).includes('이 방송 상품 목록에 없는 상품'), false);
    } finally { await act(async () => gate.resolve(ui.result('B'))); await ui.close(); }
  },
};

let failures = 0;
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(cases)) {
  try { assert.ok(cases[name], 'Unknown case ' + name); await cases[name](); console.log('PASS', name); }
  catch (error) { failures++; console.error('FAIL', name, error.stack); }
}
if (failures) process.exitCode = 1;
