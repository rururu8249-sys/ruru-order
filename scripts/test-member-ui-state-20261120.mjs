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
    constructor(props = {}) { this.props = props; }
    isConnected = true;
    style = {};
    focus() { document.activeElement = this; }
    getClientRects() { return [{}]; }
    closest() { return null; }
    querySelectorAll() { return []; }
    querySelector() { return null; }
    contains(node) { return node === this; }
    getBoundingClientRect() { return {left:100,right:320,top:100,bottom:144,width:220,height:44}; }
    scrollIntoView() {}
  }
  globalThis.HTMLElement = Element;
  globalThis.document = {
    activeElement: new Element(), body: { style: { overflow: 'auto' } },
    addEventListener(key, fn) { const set = handlers.get(key) || new Set(); set.add(fn); handlers.set(key, set); },
    removeEventListener(key, fn) { handlers.get(key)?.delete(fn); },
  };
  globalThis.window = {
    innerWidth: 1280, innerHeight: 800,
    addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
    requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout,
  };
  return {
    createNodeMock: node => new Element(node.props),
    async dispatchKey(key) {
      const event = { key, preventDefault() {}, stopPropagation() {} };
      await act(async () => { for (const handler of [...(handlers.get('keydown') || [])]) handler(event); });
    },
  };
}

function makeEnvironment({ profiles = [fixtures.a, fixtures.b], blocks = [], blockError = false, blockWait, tableReady = true, byProfile, historyError = '', modules = {} } = {}) {
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
      if (blockWait) await blockWait;
      payload = (typeof blockError === 'function' ? blockError() : blockError) ? { ok: false, message: 'fixture block read failure' } : { ok: true, blocks, tableReady };
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
  async block_failure() {
    let failed=true;
    const env = makeEnvironment({blockError:()=>failed});
    await withTree(env, async tree => {
      assert.ok(textOf(tree.root).includes('차단 정보를 확인하지 못했습니다.'), 'Block read failure must not be rendered as a successful empty block list');
      assert.ok(buttonText(tree, '다시 조회'), 'Block failure has a usable retry');
      await openMember(tree, fixtures.a.youtube_nickname);
      assert.ok(textOf(memberDialog(tree)).includes('차단 상태 확인 필요'), 'Unknown block state is not described as normal');
      assert.equal(memberDialog(tree).findAllByType('button').find(n => textOf(n) === '차단').props.disabled, true, 'Unknown state cannot trigger a block action');
      await click(memberDialog(tree).findAllByProps({ role: 'tab' }).find(n => textOf(n) === '주문 이력'), '주문 이력');
      assert.ok(textOf(memberDialog(tree)).includes('등록된 주문 이력이 없습니다.'), 'Independent order history remains readable when block state fails');
      await closeMember(tree);
      const search = tree.root.findAllByType('input').find(n => n.props['aria-label'] === '고객 검색');
      await act(async () => search.props.onChange({ target: { value: '검증회원B' } }));
      assert.ok(textOf(tree.root).includes('검증회원B') && !textOf(tree.root).includes('검증회원A'), 'Search remains usable during a block read failure');
      await act(async () => search.props.onChange({ target: { value: '' } }));
      failed=false;
      await click(buttonText(tree, '다시 조회'), '차단 조회 재시도');
      assert.ok(textOf(tree.root).includes('검색결과 2명'), 'Retry actually re-reads block state and restores the member list');
    });
    await withTree(makeEnvironment({tableReady:false}), async tree=>{
      assert.ok(textOf(tree.root).includes('차단 정보를 확인하지 못했습니다.'),'HTTP 200 tableReady=false is not a successful zero');
    });
  },
  async filter_contracts() {
    let release;
    const blockWait=new Promise(resolve=>{release=resolve;});
    const env=makeEnvironment({profiles:[{...fixtures.a,is_blocked:true},fixtures.b],blocks:[
      // Existing successful API writes both profile A and its phone-block entry.
      // A profile flag alone is not a new source of truth for this UI test.
      {phone:fixtures.a.customer_phone,reason:'직접 입력'},
      {phone:fixtures.b.customer_phone,reason:'직접 입력'}, {phone:'01099990000',reason:'직접 입력'},
    ],blockWait});
    await withTree(env,async tree=>{
      assert.ok(textOf(tree.root).includes('차단 정보를 확인하는 중…'));
      const blockList=()=>tree.root.findAllByType('button').find(n=>textOf(n).startsWith('차단 목록'));
      assert.equal(blockList().props.disabled,true,'Incomplete block read cannot open an empty successful block list');
      assert.ok(textOf(blockList()).includes('…'));
      const statusGroup=()=>tree.root.findByProps({role:'group','aria-label':'회원 상태'});
      assert.equal(statusGroup().findAllByType('button').find(n=>textOf(n).startsWith('정상')).props.disabled,true);
      await openMember(tree, fixtures.a.youtube_nickname);
      assert.ok(textOf(memberDialog(tree)).includes('차단 상태 확인 중'), 'Details can open while an independent block read is pending');
      await act(async()=>release());
      assert.equal(memberDialog(tree).findAllByType('button').filter(n=>textOf(n)==='차단해제').length,1,'An already open detail receives the completed block state');
      assert.ok(!textOf(memberDialog(tree)).includes('정상 회원'),'A late blocked result never leaves a false normal label in the drawer');
      await closeMember(tree);
      const blockedChip=statusGroup().findAllByType('button').find(n=>textOf(n).startsWith('차단'));
      assert.equal(textOf(blockedChip),'차단2','Profile and phone-blocked members belong in the member count');
      assert.equal(blockedChip.props['aria-label'],undefined,'Visible count remains part of the accessible button name');
      assert.ok(textOf(blockList()).endsWith('3'),'Standalone phone belongs only in the management count');
      const selectAll=tree.root.findAllByType('input').find(n=>n.props['aria-label']==='이 페이지 전체 선택');
      await act(async()=>selectAll.props.onChange());
      assert.ok(textOf(tree.root).includes('2명 선택'));
      await click(statusGroup().findAllByType('button').find(n=>textOf(n).startsWith('정상')),'정상 필터');
      await click(buttonText(tree,'초기화'),'필터 초기화');
      assert.ok(textOf(tree.root).includes('2명 선택'),'Reset preserves selected members for bulk actions');
      await click(blockList(),'차단 목록');
      assert.ok(textOf(tree.root).includes('010-9999-0000'),'Standalone phone remains accessible in management');
    });
  },
  async mobile_management() {
    const env=makeEnvironment({blocks:[{phone:fixtures.b.customer_phone,reason:'직접 입력'}]});
    await withTree(env,async tree=>{
      const filterButton=tree.root.findAllByType('button').find(n=>n.props['aria-haspopup']==='dialog');
      const filterTrigger=filterButton.instance;
      filterTrigger.focus();
      await click(filterButton,'모바일 필터');
      const sheet=()=>tree.root.findAllByProps({role:'dialog','aria-label':'회원 필터'})[0];
      const blockList=()=>tree.root.findAllByProps({role:'dialog','aria-label':'차단 목록'})[0];
      const management=()=>sheet().findAllByType('button').find(n=>textOf(n).startsWith('차단 목록'));
      const managementTrigger=management().instance;
      managementTrigger.focus();
      await click(management(),'모바일 차단 목록');
      assert.ok(sheet() && blockList(),'Management stacks above the filter sheet so its return target stays mounted');
      assert.equal(document.activeElement.props['aria-label'],'차단 목록','New modal takes focus');
      assert.equal(document.body.style.overflow,'hidden','Nested management keeps the background locked');
      await env.rendererOptions.dispatchKey('Escape');
      assert.ok(sheet() && !blockList(),'Escape closes only the topmost management dialog');
      assert.equal(document.activeElement,managementTrigger,'Management close restores its sheet trigger');
      assert.equal(document.body.style.overflow,'hidden');
      await click(management(),'차단 목록 다시 열기');
      await click(blockList().findAllByType('button').find(n=>n.props['aria-expanded']===false && textOf(n).includes(fixtures.b.youtube_nickname)),'차단 회원 펼치기');
      await click(buttonText(tree,'회원 상세'),'차단 목록에서 회원 상세');
      assert.ok(memberDialog(tree) && sheet() && !blockList());
      assert.equal(document.activeElement.props['aria-label'],'회원 상세');
      await closeMember(tree);
      assert.equal(document.body.style.overflow,'hidden','Closing the member detail retains its underlying sheet lock');
      await env.rendererOptions.dispatchKey('Escape');
      assert.ok(!sheet());
      assert.equal(document.body.style.overflow,'auto','The final sheet close restores background scrolling');
      assert.equal(document.activeElement,filterTrigger,'The final close returns to the original filter button');
    });
  },
  async block_form_error() {
    let failed=false;
    const env=makeEnvironment({blockError:()=>failed});
    await withTree(env,async tree=>{
      await click(buttonText(tree,'전화번호 차단'),'전화번호 차단 폼 열기');
      const form=()=>tree.root.findByProps({'aria-label':'전화번호 차단 입력'});
      assert.equal(form().type,'fieldset','Native fieldset disables all nested input and button controls together');
      assert.equal(form().props.disabled,false);
      await act(async()=>form().findAllByType('input').find(n=>n.props.inputMode==='numeric').props.onChange({target:{value:'01055556666'}}));
      failed=true;
      await click(buttonText(tree,'새로고침'),'차단 정보 새로고침');
      assert.equal(form().props.disabled,true,'An already open form inherits the unavailable block state');
      assert.ok(form().findAllByType('input').some(n=>n.props.value==='01055556666'),'Temporarily disabling does not discard the operator draft');
      failed=false;
      await click(buttonText(tree,'다시 조회'),'차단 정보 재조회');
      assert.equal(form().props.disabled,false,'A successful retry restores the existing form');
      assert.equal(env.calls.filter(call=>call.url==='/api/admin-live/customer-block' && call.method==='POST').length,0,'No real or fixture block mutation is needed to check this state');
    });
  },
  async layout() {
    const env = makeEnvironment({ blocks: [{ phone: fixtures.b.customer_phone, reason: '직접 입력', updated_at: '2026-11-01T00:00:00Z' }] });
    await withTree(env, async tree => {
      await openMember(tree, fixtures.a.youtube_nickname);
      const closes = memberDialog(tree).findAllByType('button').filter(n => n.props['aria-label'] === '회원 상세 닫기' || textOf(n) === '닫기');
      assert.equal(closes.length, 1, 'Member detail has one close control, including on mobile');
      assert.equal(memberDialog(tree).findAllByType('footer').length, 0, 'Read-only member detail has no duplicate action footer');
      assert.equal(memberDialog(tree).findAllByType('button').filter(n => textOf(n) === '차단').length, 1, 'Overview has one block entry');
      for (const label of ['주문 이력', '접속·변경 기록']) {
        await click(memberDialog(tree).findAllByProps({ role: 'tab' }).find(n => textOf(n) === label), label);
        assert.equal(memberDialog(tree).findAllByType('button').filter(n => textOf(n) === '차단').length, 0, 'Read-only tabs do not pin a block action');
      }
      await click(buttonText(tree, '정보 수정'), '정보 수정');
      assert.equal(memberDialog(tree).findAllByType('footer').length, 1, 'Editing retains the fixed save footer');
      assert.ok(memberDialog(tree).findAllByType('button').some(n => textOf(n) === '저장'), 'Editing retains save');
      await click(buttonText(tree, '취소'), '수정 취소');
      assert.equal(memberDialog(tree).findAllByType('footer').length, 0, 'Cancel removes the edit footer');
      await closeMember(tree);
      await openMember(tree, fixtures.b.youtube_nickname);
      assert.equal(memberDialog(tree).findAllByType('button').filter(n => textOf(n) === '차단해제').length, 1, 'Blocked member has one unblock entry with its reason');
    });
  },
  async blocked() {
    const env = makeEnvironment({ blocks: [{ phone: fixtures.b.customer_phone, reason: '직접 입력', updated_at: '2026-11-01T00:00:00Z' }] });
    await withTree(env, async tree => {
      await openMember(tree, fixtures.b.youtube_nickname);
      assert.ok(textOf(memberDialog(tree)).includes('검증프로필B'), 'Fixture control: direct detail contains B profile');
      assert.ok(textOf(memberDialog(tree)).includes('검증배송지B'), 'Fixture control: direct detail contains B addresses');
      await closeMember(tree);
      await click(tree.root.findAllByType('button').find(n => textOf(n).startsWith('차단 목록')), '차단 목록');
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
      const select = tree.root.findAllByProps({role:'combobox'}).find(n => n.props['aria-label'] === '회원 정렬');
      assert.ok(textOf(select).includes('최근주문순'), 'recent order remains default');
      await click(select, '회원 정렬');
      assert.equal(tree.root.findAllByProps({role:'option'}).length, 8, 'all existing sort choices remain');
      await click(tree.root.findAllByProps({role:'option'}).find(n=>textOf(n)==='과거접속순 (오래 안 온 순)'), '과거접속순');
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
