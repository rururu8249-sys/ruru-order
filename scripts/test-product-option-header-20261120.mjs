/** Real CustomerBottomSheet, with only browser layout/observer IO replaced.
 * The 86.59375 -> 77 geometry was measured in production at 400 x 737.
 * This does not claim to emulate an Android browser; deployment still needs UI QA.
 * Run: node scripts/test-product-option-header-20261120.mjs [case ...]
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import ts from 'typescript';
import { createUiLoader } from './admin-ui-test-loader.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const longTitle = '[💥단순변심·새상품 5천원할인] MIU-201 초코바나나 가디건🔥 38·40 사이즈 각 1개씩';

// Execute the real caller's props and scroll handler, without mounting its DB/player subscriptions.
const orderSource = ts.createSourceFile('page.tsx', fs.readFileSync('app/order/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let optionOpening;
function findOptionOpening(node) {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(orderSource) === 'CustomerBottomSheet' && node.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(orderSource) === 'bodyDataAttr' && prop.initializer?.text === 'data-registered-option-scroll')) optionOpening = node;
  ts.forEachChild(node, findOptionOpening);
}
findOptionOpening(orderSource);
assert.ok(optionOpening, 'option sheet integration was not found');
const callerPropsSource = ['stabilizeHeaderHeight', 'headerHeightKey', 'onBodyScroll'].map(name => {
  const attr = optionOpening.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(orderSource) === name);
  const value = !attr ? 'undefined' : !attr.initializer ? 'true' : ts.isJsxExpression(attr.initializer) ? attr.initializer.expression.getText(orderSource) : attr.initializer.getText(orderSource);
  return `${name}: (${value})`;
}).join(',');
const callerBody = ts.transpileModule(`return ({${callerPropsSource}});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const callerProps = new Function('registeredOptionSelectProduct', 'registeredOptionHeroCollapsed', 'setRegisteredOptionHeroCollapsed', callerBody);

async function mount({ enabled = true, title = longTitle, naturalHeight = 86.59375, observer = true } = {}) {
  const listeners = new Map(), observers = [];
  let historyPushes = 0, closes = 0, photos = 0, scrolls = 0;
  const dispatch = (type, event) => { for (const callback of listeners.get(type) || []) callback(event); };
  globalThis.window = {
    location: { href: 'https://example.test/order' },
    history: { state: null, pushState(state) { this.state = state; historyPushes++; }, replaceState(state) { this.state = state; },
      back() { this.state = null; dispatch('popstate', { state: null }); } },
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
  };
  globalThis.ResizeObserver = observer ? class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(node) { this.node = node; }
    disconnect() { this.disconnected = true; }
  } : undefined;
  // Boundary double: browser returns natural size constrained by the actual min-height written by the component.
  const header = { style: {}, naturalHeight, getBoundingClientRect() { return { height: Math.max(this.naturalHeight, Number.parseFloat(this.style.minHeight) || 0) }; } };
  const { default: Sheet } = createUiLoader()('components/customer/CustomerBottomSheet.tsx');
  let props = { open: true, title, tone: 'v2', stabilizeHeaderHeight: enabled, headerHeightKey: 'product-A',
    onClose: () => { closes++; }, onBodyScroll: () => { scrolls++; }, bodyDataAttr: 'data-option-test',
    subtitle: React.createElement('span', null, '방송 접수 없이 바로 구매 가능! 130,000원'),
    children: React.createElement('button', null, '38 · 1개 남음'), footer: React.createElement('button', { disabled: true }, '사이즈를 선택해 주세요') };
  let tree;
  const element = () => React.createElement(Sheet, props);
  await act(async () => { tree = Renderer.create(element(), { createNodeMock: () => header }); });
  const headerNode = () => tree.root.findAll(node => node.type === 'div' && node.props.style?.padding === '0 16px 12px')[0];
  const height = () => header.getBoundingClientRect().height;
  const resize = async value => { header.naturalHeight = value; await act(async () => { for (const item of observers) if (!item.disconnected) item.callback([{ target: header }]); }); };
  const update = async next => { props = { ...props, ...next }; await act(async () => tree.update(element())); };
  return { tree, header, observers, height, headerNode, resize, update,
    get historyPushes() { return historyPushes; }, get closes() { return closes; }, get photos() { return photos; }, get scrolls() { return scrolls; },
    async compact() { header.naturalHeight = 77; await update({ headerLeft: React.createElement('button', { 'aria-label': '사진 크게', onClick: () => { photos++; }, style: { width: 64, height: 64 } }, '사진'), subtitle: '130,000원' }); await resize(77); },
    async dispose() { await act(async () => tree.unmount()); },
  };
}

const cases = {
  async order_page_integration() {
    const transitions = [];
    let props = callerProps({ id: 'product-A' }, false, value => transitions.push(value));
    const ui = await mount({ enabled: props.stabilizeHeaderHeight === true });
    try {
      await ui.compact();
      assert.equal(ui.height(), 86.59375, 'real order page did not enable header stabilization');
      assert.equal(props.headerHeightKey, 'product-A');
      props.onBodyScroll({ currentTarget: { scrollTop: 200 } });
      assert.deepEqual(transitions, [], 'header collapsed before passing the existing boundary');
      props.onBodyScroll({ currentTarget: { scrollTop: 201.5 } });
      assert.deepEqual(transitions, [true]);
      props = callerProps({ id: 'product-B' }, true, value => transitions.push(value));
      props.onBodyScroll({ currentTarget: { scrollTop: 220 } });
      assert.deepEqual(transitions, [true]);
      props.onBodyScroll({ currentTarget: { scrollTop: 190 } });
      assert.deepEqual(transitions, [true, false], 'real upward scroll no longer restores the expanded header');
      assert.equal(props.headerHeightKey, 'product-B');
    } finally { await ui.dispose(); }
  },
  async bottom_boundary() {
    const ui = await mount();
    try {
      const before = ui.height();
      assert.equal(before, 86.59375);
      await ui.compact();
      assert.equal(ui.height(), before, 'compact header shrank and enlarged the scroll viewport');
      // Production content=653, expanded viewport=451.40625, bottom=201.59375.
      const viewportAfter = 451.40625 + before - ui.height();
      assert.equal(653 - viewportAfter, 201.59375, 'layout correction moved bottom back below the 200px boundary');
      await ui.resize(86.59375);
      assert.equal(ui.height(), before, 'expanding shifted the viewport back');
    } finally { await ui.dispose(); }
  },
  async growth_and_fractional_border_box() {
    const ui = await mount();
    try {
      assert.equal(ui.headerNode().props.style.boxSizing, 'border-box', 'measured border-box must match min-height sizing');
      await ui.resize(109.8125);
      for (let i = 0; i < 8; i++) await ui.resize(77);
      assert.equal(ui.height(), 109.8125, 'content growth was lost, rounded down, or padding repeatedly accumulated');
    } finally { await ui.dispose(); }
  },
  async reopen_and_product_change() {
    const ui = await mount();
    try {
      await ui.resize(112);
      ui.header.naturalHeight = 53;
      const pushes = ui.historyPushes;
      await ui.update({ headerHeightKey: 'product-B', title: '짧은 상품' });
      assert.equal(ui.height(), 53, 'another product inherited stale maximum header height');
      assert.equal(ui.historyPushes, pushes, 'height reset remounted the sheet/history');
      await ui.resize(99);
      await ui.update({ open: false });
      assert.ok(ui.observers.every(item => item.disconnected), 'closed sheet retained a resize observer');
      ui.header.naturalHeight = 53;
      await ui.update({ open: true });
      assert.equal(ui.height(), 53, 'reopened sheet inherited the previous height');
    } finally { await ui.dispose(); }
  },
  async opt_out_unchanged() {
    const ui = await mount({ enabled: false });
    try {
      await ui.compact();
      assert.equal(ui.height(), 77, 'ordinary sheets must retain their original layout');
      assert.equal(ui.observers.length, 0, 'opt-out sheet installed a new observer');
    } finally { await ui.dispose(); }
  },
  async disable_and_cleanup() {
    const ui = await mount();
    await ui.compact();
    await ui.update({ stabilizeHeaderHeight: false });
    assert.equal(ui.height(), 77, 'disabling left the minimum height attached');
    assert.ok(ui.observers.every(item => item.disconnected), 'disabling leaked an observer');
    await ui.dispose();
  },
  async short_title_and_actions() {
    const ui = await mount({ title: '가디건', naturalHeight: 53 });
    try {
      await ui.compact();
      await ui.resize(53);
      assert.equal(ui.height(), 77, 'short title switched back to a smaller header');
      const titleNode = ui.tree.root.findAll(node => node.type === 'div' && node.props.id?.startsWith('cs-sheet-title-'))[0];
      assert.equal(titleNode.props.style.whiteSpace, 'nowrap');
      await act(async () => ui.tree.root.findByProps({ 'aria-label': '사진 크게' }).props.onClick());
      assert.equal(ui.photos, 1, 'thumbnail photo action was lost');
      await act(async () => ui.tree.root.findByProps({ 'data-option-test': 'true' }).props.onScroll({ currentTarget: { scrollTop: 190 } }));
      assert.equal(ui.scrolls, 1, 'scroll handler was intercepted');
      await act(async () => ui.tree.root.findByProps({ 'aria-label': '닫기' }).props.onClick());
      assert.equal(ui.closes, 1, 'existing close callback was lost');
    } finally { await ui.dispose(); }
  },
  async initial_measure_without_observer() {
    const ui = await mount({ observer: false });
    try { await ui.compact(); assert.equal(ui.height(), 86.59375, 'initial measurement must work without ResizeObserver'); }
    finally { await ui.dispose(); }
  },
};

for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(cases)) {
  assert.ok(cases[name], 'Unknown case ' + name);
  await cases[name]();
  console.log('PASS product option header: ' + name);
}
