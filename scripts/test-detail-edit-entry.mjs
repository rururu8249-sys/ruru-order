import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const events = new EventTarget();
globalThis.window = Object.assign(events, { innerWidth: 1200 });
globalThis.document = new EventTarget();
globalThis.fetch = async () => ({ json: async () => ({ ok: true, items: [] }) });
const writes = [];
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = spec => {
    if (spec === '@/lib/supabase') return { supabase: { from() { throw new Error('Unexpected database access'); } } };
    if (spec === '@/lib/adminCatalogWrite') return { adminCatalogWrite: (...args) => { writes.push(args); throw new Error('Unexpected save'); } };
    if (spec === '@/lib/adminToast') return { showAdminToast() {} };
    if (spec === './compressProductImage') return {};
    if (spec === './ProductImageNoticeToggle') return { default: () => null };
    if (spec.startsWith('@/') || spec.startsWith('.')) {
      const base = spec.startsWith('@/') ? path.resolve(spec.slice(2)) : path.resolve(path.dirname(filename), spec);
      return load([base, base + '.ts', base + '.tsx'].find(p => fs.existsSync(p) && fs.statSync(p).isFile()));
    }
    return require(spec);
  };
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename })(localRequire, module, module.exports);
  return module.exports;
}
const Form = load(path.resolve('components/admin-live/quick-product/QuickProductFastForm.tsx')).default;
const note = {
  brand_group: { enabled: true, brand_ko: '에르메스', detail_options: {
    'HM-100': { colors: [], sizes: ['36', '38', '40'], variants: ['36', '38', '40'].map(size => ({ color: '없음', size })) },
    'HM-101': { colors: ['블랙'], sizes: ['S'], variants: [{ color: '블랙', size: 'S' }] },
  }, detail_categories: { 'HM-100': '상의' } },
  option_axes: [{ key: 'detail', values: ['HM-100', 'HM-101'] }],
  option_pricing: { 'HM-100': 240000, 'HM-101': 0 },
  detail_photo_sets: { 'HM-100': ['https://example.com/hm100.jpg', 'https://example.com/hm100-back.jpg'], 'HM-101': ['https://example.com/hm101.jpg'] },
};
const product = { id: 'brand-1', product_name: '에르메스', price: 119000, product_note: JSON.stringify(note) };
let tree;
await act(async () => { tree = Renderer.create(React.createElement(Form, { activeBroadcastId: null, initialProduct: product, initialDetailName: 'HM-100' })); });
const dialogs = tree.root.findAll(node => node.props.role === 'dialog' && node.props['aria-label'] === '세부상품 수정');
assert.equal(dialogs.length, 1, 'A detail row edit must open its existing detail editor directly');
const fields = dialogs[0].findAllByType('input');
assert.ok(fields.some(node => node.props.value === 'HM-100'), 'Must edit the requested detail, not another detail');
assert.ok(fields.some(node => node.props.value === '36, 38, 40'), 'Must preserve detail sizes');
assert.ok(fields.some(node => node.props.value === '359,000'), 'Must restore the sale price, not the parent minimum or surcharge alone');
assert.ok(dialogs[0].findAllByType('img').some(node => node.props.src.includes('hm100.jpg')), 'Must preserve the correct detail photo');
assert.ok(dialogs[0].findAllByType('img').some(node => node.props.src.includes('hm100-back.jpg')), 'Must preserve additional detail photos');
assert.equal(writes.length, 0, 'Opening an editor must not save or alter a product');
await act(async () => dialogs[0].findAllByType('button').find(node => node.children.join('') === '취소').props.onClick());
assert.equal(tree.root.findAll(node => node.props.role === 'dialog' && node.props['aria-label'] === '세부상품 수정').length, 0, 'Cancel must keep the detail editor closed');
await act(async () => tree.unmount());
await act(async () => { tree = Renderer.create(React.createElement(Form, { activeBroadcastId: null, initialProduct: product })); });
assert.equal(tree.root.findAll(node => node.props.role === 'dialog' && node.props['aria-label'] === '세부상품 수정').length, 0, 'Parent edit must not open a random detail');
await act(async () => tree.unmount());
const Drawer = load(path.resolve('components/admin-live/AdminLiveQuickProductDrawer.tsx')).default;
await act(async () => { tree = Renderer.create(React.createElement(Drawer, { activeBroadcastId: null })); });
await act(async () => window.dispatchEvent(new CustomEvent('ruru-edit-quick-product-detail', { detail: { product, detailName: 'HM-101' } })));
let dialog = tree.root.find(node => node.props.role === 'dialog' && node.props['aria-label'] === '세부상품 수정');
assert.ok(dialog.findAllByType('input').some(node => node.props.value === 'HM-101'), 'Drawer must forward the selected detail');
assert.ok(dialog.findAllByType('input').some(node => node.props.value === '블랙'), 'Drawer must not reuse another detail colors');
await act(async () => window.dispatchEvent(new CustomEvent('ruru-edit-quick-product-detail', { detail: { product, detailName: 'HM-100' } })));
dialog = tree.root.find(node => node.props.role === 'dialog' && node.props['aria-label'] === '세부상품 수정');
assert.ok(dialog.findAllByType('input').some(node => node.props.value === 'HM-100'), 'Same parent, different detail must reset the editor');
await act(async () => window.dispatchEvent(new CustomEvent('ruru-edit-quick-product', { detail: product })));
assert.equal(tree.root.findAll(node => node.props.role === 'dialog' && node.props['aria-label'] === '세부상품 수정').length, 0, 'Parent editing must clear the previous detail selection');
assert.equal(writes.length, 0);
await act(async () => tree.unmount());
console.log('Detail edit entry: exact target, options/photo, cancel, event routing, switch target, parent edit and no writes passed');
