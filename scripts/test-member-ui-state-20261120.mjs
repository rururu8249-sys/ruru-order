/**
 * Read-only member UI reproductions. All network/database responses are fixtures.
 * Product code and repository tests are loaded, never written.
 *
 * Usage:
 *   node scripts/test-member-ui-state-20261120.mjs
 *   node scripts/test-member-ui-state-20261120.mjs blocked drafts profiles history
 *
 * Expected baseline c1e5b5ff: each case reproduces the defects described below.
 * A repaired implementation should PASS without changing the fixture semantics.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(repo);
const require = createRequire(path.join(repo, 'package.json'));
const React = require('react');
const Renderer = require('react-test-renderer');
const { act } = Renderer;
const { createUiLoader } = await import(pathToFileURL(path.join(repo, 'scripts/admin-ui-test-loader.mjs')).href);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const zeroStats = {
  all: 0, paid: 0, unpaid: 0, canceled: 0, paidAmount: 0,
  totalAmount: 0, latestOrderAt: '', manualNeededCount: 0,
};
const fixtures = {
  a: {
    id: 1, kakao_id: '1001', youtube_nickname: '검증회원A', customer_name: '검증A',
    customer_phone: '01011112222', created_at: '2026-01-01T00:00:00Z',
    kakao_nickname: '검증프로필A',
  },
  b: {
    id: 2, kakao_id: '1002', youtube_nickname: '검증회원B', customer_name: '검증B',
    customer_phone: '01033334444', created_at: '2026-01-02T00:00:00Z',
    kakao_nickname: '검증프로필B', last_login_at: '2026-11-01T00:00:00Z',
    shipping_addresses: [{ name: '검증배송지B', address: '검증주소B', detailAddress: '검증상세B', isDefault: true }],
    customer_history: [{ field: 'youtube_nickname', old_value: '전', new_value: '후', changed_at: '2026-10-01T00:00:00Z' }],
  },
  // A valid persisted Kakao profile whose editable contact/display fields are empty.
  // It still counts in the server's raw profiles.length audit.
  empty: {
    id: 3, kakao_id: '1003', youtube_nickname: '', customer_name: '', customer_phone: '',
    created_at: '2026-01-03T00:00:00Z',
  },
};

function installDom() {
  const handlers = new Map();
  class Element {
    isConnected = true;
    style = {};
    focus() { document.activeElement = this; }
    getClientRects() { return [{}]; }
    closest() { return null; }
    querySelectorAll() { return []; }
    scrollIntoView() {}
  }
  globalThis.HTMLElement = Element;
  globalThis.document = {
    activeElement: new Element(), body: { style: { overflow: 'auto' } },
    addEventListener(key, fn) { const set = handlers.get(key) || new Set(); set.add(fn); handlers.set(key, set); },
    removeEventListener(key, fn) { handlers.get(key)?.delete(fn); },
  };
  globalThis.window = {
    addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
    requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout,
  };
  return { createNodeMock: () => new Element() };
}

function makeEnvironment({ profiles = [fixtures.a, fixtures.b], blocks = [], byProfile, historyError = '', modules = {} } = {}) {
  const calls = [];
  const rendererOptions = installDom();
  const lifetime = byProfile || Object.fromEntries(profiles.map(p => [String(p.id), { ...zeroStats }]));
  const supabase = {
    from(table) {
      let fields = '';
      const query = {
        select(value) { fields = value; return query; },
        order() { return query; }, eq() { return query; }, in() { return query; }, or() { return query; },
        range(from, to) {
          calls.push({ kind: 'supabase', table, fields, from, to });
          if (table === 'customers') return Promise.resolve({ data: profiles.slice(from, to + 1), error: null });
          if (table === 'orders') return Promise.resolve({ data: historyError ? null : [], error: historyError ? { message: historyError } : null });
          throw new Error('Unexpected database read: ' + table);
        },
        limit() {
          calls.push({ kind: 'supabase', table, fields, rawProfile: true });
          if (table === 'customers') return Promise.resolve({ data: [], error: null });
          throw new Error('Unexpected database read: ' + table);
        },
      };
      return query;
    },
  };
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ kind: 'fetch', url: String(url), method });
    let payload;
    if (String(url).startsWith('/api/admin-live/customer-link-requests?') && method === 'GET') {
      payload = { ok: true, pendingCount: 0 };
    } else if (url === '/api/admin-live/customer-lifetime' && method === 'GET') {
      payload = {
        ok: true, version: 'full-history-v1', profileCount: profiles.length, orderRows: 4,
        unmatchedRows: 0, ambiguousRows: 0, byProfile: lifetime,
      };
    } else if (url === '/api/admin-live/customer-block' && method === 'GET') {
      payload = { ok: true, blocks };
    } else if (url === '/api/admin-live/customer-list-extra' && method === 'POST') {
      // This POST only reads batched display data; it is not a write endpoint.
      payload = { ok: true, points: {}, openIssues: {} };
    } else if (String(url).startsWith('/api/admin-live/customer-access?') && method === 'GET') {
      payload = { ok: true, records: [], message: '' };
    } else {
      throw new Error('Unexpected request; all real writes/network are blocked in this harness: ' + method + ' ' + url);
    }
    return { ok: true, status: 200, json: async () => payload };
  };
  const load = createUiLoader({ '@/lib/supabase': { supabase }, ...modules });
  return { load, calls, rendererOptions };
}

const textOf = node => typeof node === 'string' ? node : (node?.children || []).map(textOf).join('');
const buttonText = (tree, text) => tree.root.findAllByType('button').find(n => textOf(n) === text);
async function click(button, label) {
  assert.ok(button, 'Missing expected button: ' + label);
  assert.equal(typeof button.props.onClick, 'function', 'Missing click handler: ' + label);
  await act(async () => button.props.onClick({ target: null, currentTarget: null, stopPropagation() {}, preventDefault() {} }));
}
async function renderMembers(environment) {
  const Panel = environment.load('components/admin-live/AdminLiveCustomersPanel.tsx').default;
  let tree;
  await act(async () => { tree = Renderer.create(React.createElement(Panel, { embedded: true, orders: [] }), environment.rendererOptions); });
  return tree;
}
async function openMember(tree, nickname) {
  const button = tree.root.findAllByType('button').find(n => textOf(n).includes(nickname));
  if (button) return click(button, nickname);
  const card = tree.root.findAllByProps({ role: 'button' }).find(n => textOf(n).includes(nickname));
  await click(card, nickname);
}
function memberDialog(tree) {
  return tree.root.findAllByProps({ role: 'dialog' }).find(n => textOf(n).includes('회원 상세'));
}
async function closeMember(tree) {
  const dialog = memberDialog(tree);
  assert.ok(dialog, 'Member detail dialog should be open');
  const close = dialog.findAllByType('button').find(n => /닫기/.test(n.props['aria-label'] || '') || textOf(n) === '닫기' || textOf(n) === '✕');
  await click(close, '회원 상세 닫기');
}
async function withTree(environment, run) {
  const tree = await renderMembers(environment);
  try { await run(tree); }
  finally { await act(async () => tree.unmount()); }
}

const cases = {
  async blocked() {
    const env = makeEnvironment({ blocks: [{ phone: fixtures.b.customer_phone, reason: '직접 입력', updated_at: '2026-11-01T00:00:00Z' }] });
    await withTree(env, async tree => {
      await openMember(tree, fixtures.b.youtube_nickname);
      assert.ok(textOf(memberDialog(tree)).includes('검증프로필B'), 'Fixture control: direct detail contains B profile');
      assert.ok(textOf(memberDialog(tree)).includes('검증배송지B'), 'Fixture control: direct detail contains B addresses');
      await closeMember(tree);
      await click(tree.root.findAllByType('button').find(n => /^차단\s*\d/.test(textOf(n))), '차단 목록');
      await click(tree.root.findAllByType('button').find(n => n.props['aria-expanded'] === false && textOf(n).includes('검증회원B')), '차단 회원 펼치기');
      await click(buttonText(tree, '회원 상세'), '차단 목록 회원 상세');
      const details = textOf(memberDialog(tree));
      assert.ok(details.includes('검증프로필B'), 'Blocked-list detail must resolve the same Kakao profile as the normal list');
      assert.ok(details.includes('검증배송지B'), 'Blocked-list detail must retain registered shipping addresses');
    });
  },

  async drafts() {
    const env = makeEnvironment();
    await withTree(env, async tree => {
      await openMember(tree, fixtures.a.youtube_nickname);
      await click(buttonText(tree, '정보 수정'), 'A 정보 수정');
      const oldInputs = memberDialog(tree).findAllByType('input');
      assert.ok(oldInputs.some(n => n.props.value === fixtures.a.youtube_nickname), 'Fixture control: A edit fields loaded');
      await closeMember(tree);
      await openMember(tree, fixtures.b.youtube_nickname);
      const dialog = memberDialog(tree);
      assert.ok(textOf(dialog).includes(fixtures.b.youtube_nickname), 'Fixture control: selected customer is B');
      assert.ok(!dialog.findAllByType('input').some(n => n.props.value === fixtures.a.youtube_nickname), 'A draft must not survive in B detail');
      const edit = buttonText(tree, '정보 수정');
      if (edit) await click(edit, 'B 정보 수정');
      assert.ok(memberDialog(tree).findAllByType('input').some(n => n.props.value === fixtures.b.youtube_nickname), 'B edit must load B values');
    });
  },

  async profiles() {
    const aStats = { ...zeroStats, all: 4, paid: 4, paidAmount: 12345, totalAmount: 12345, latestOrderAt: '2026-11-01T00:00:00Z' };
    const env = makeEnvironment({
      profiles: [fixtures.a, fixtures.b, fixtures.empty],
      byProfile: { '1': aStats, '2': { ...zeroStats }, '3': { ...zeroStats } },
    });
    await withTree(env, async tree => {
      const text = textOf(tree.root);
      assert.ok(!text.includes('전체 회원 집계가 불완전'), 'A fully fetched display-empty profile must not invalidate the raw profile-count audit');
      assert.ok(text.includes('12,345원'), 'Verified full-history totals must remain visible when another profile has empty display fields');
    });
  },

  async sorting() {
    const c = {...fixtures.empty, youtube_nickname: '검증회원C'};
    const env = makeEnvironment({profiles: [fixtures.a, fixtures.b, c]});
    await withTree(env, async tree => {
      const select = tree.root.findAllByType('select').find(n => n.props.value === 'latest');
      assert.ok(select, 'recent order remains default');
      assert.equal(select.findAllByType('option').length, 8, 'all existing sort choices remain');
      await act(async () => select.props.onChange({target: {value: 'oldLogin'}}));
      const names = [...new Set(tree.root.findAllByType('button').map(textOf).map(n => n.match(/^검증회원[ABC]/)?.[0]).filter(Boolean))];
      assert.deepEqual(names, ['검증회원A', '검증회원C', '검증회원B'], 'missing login first, tied missing logins keep original order');
    });
  },

  async history() {
    const env = makeEnvironment({ historyError: 'fixture history read failure' });
    const History = env.load('components/admin-live/CustomerFullOrderHistory.tsx').default;
    const emitted = [];
    let tree;
    await act(async () => {
      tree = Renderer.create(React.createElement(History, { kakaoId: '1001', phone: '', onStats: stats => emitted.push(stats) }), env.rendererOptions);
    });
    try {
      assert.ok(env.calls.some(call => call.kind === 'supabase' && call.table === 'orders'), 'Fixture control: an order-history read was attempted');
      assert.match(textOf(tree.root), /fixture history read failure|조회 실패|불러오지 못했습니다/, 'Fixture control: the failed read reaches the actual UI');
      assert.ok(emitted.length > 0 && emitted.every(stats => stats === null), 'Failed full-history reads must never emit a zero-count/zero-KRW success summary: ' + JSON.stringify(emitted));
    } finally { await act(async () => tree.unmount()); }
  },
};

export { act, zeroStats, fixtures, makeEnvironment, textOf, buttonText, click, renderMembers, openMember, memberDialog, closeMember };

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const selected = process.argv.slice(2);
  const names = selected.length ? selected : Object.keys(cases);
  let failures = 0;
  for (const name of names) {
    assert.ok(cases[name], 'Unknown case: ' + name);
    try { await cases[name](); console.log('PASS ' + name); }
    catch (error) { failures += 1; console.error('FAIL ' + name + ': ' + (error?.message || error)); }
  }
  console.log(JSON.stringify({ cases: names.length, failures, writes: 0, realNetworkRequests: 0 }));
  process.exitCode = failures ? 1 : 0;
}
