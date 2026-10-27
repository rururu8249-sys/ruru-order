// [2026-10-27] 주문상세 상품 수정 — 색상·사이즈를 그 상품 재고표에서 고르기(옛 이름·오타 저장 방지)
import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const C = createUiLoader()('lib/orderItemOptionChoices.ts');
const note = (v, extra = {}) => JSON.stringify({ stock_variants: v, ...extra });
const HEART = [{color:'블랙 핑크하트',size:'M',stock:3},{color:'차콜 핑크하트',size:'M',stock:2},{color:'차콜 핑크하트',size:'S',stock:2}];
const ch = C.readOrderItemOptionChoices({ product_note: note(HEART) });
assert.deepEqual(ch.colors, ['블랙 핑크하트','차콜 핑크하트']);
assert.deepEqual(C.sizesForColor(ch, '차콜 핑크하트').map(r => [r.size, r.stock]), [['M',2],['S',2]]);
assert.equal(C.choiceExists(ch, '차콜 핑크셔츠', 'M'), false);
assert.equal(C.choiceExists(ch, '차콜 핑크하트', 'M'), true);
// 색상 없음(사이즈만) 상품
const sz = C.readOrderItemOptionChoices({ product_note: note([{color:'없음',size:'230',stock:1},{color:'',size:'240',stock:0}]) });
assert.equal(sz.hasColor, false); assert.equal(C.choiceExists(sz, '없음', '230'), true);
// 직접 입력으로 남기는 상품
assert.equal(C.readOrderItemOptionChoices({ product_note: note(HEART, { brand_group: { enabled: true } }) }), null);
assert.equal(C.readOrderItemOptionChoices({ product_note: note(HEART, { combo_mode: true }) }), null);
assert.equal(C.readOrderItemOptionChoices({ product_note: note(HEART, { stock_management_enabled: false }) }), null);
assert.equal(C.readOrderItemOptionChoices({ product_note: note([]) }), null);
console.log('choices OK');

// 화면
const React = (await import('react')).default;
const { default: Renderer, act } = await import('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const saved = [];
const fakeSb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 793, product_note: note(HEART) } }) }) }) }) };
const load = createUiLoader({
  '@/lib/supabase': { supabase: fakeSb },
  './useLiveOrderItemEdit': {
    createInitialLiveOrderItemEditForm: (item) => ({ productName: item.productName, color: item.color || '', size: item.size || '', qty: String(item.qty), unitPrice: String(item.unitPrice) }),
    useLiveOrderItemEdit: () => ({ savingItemId: null, saveItem: async ({ form }) => { saved.push(form); return true; } }),
  },
});
const Card = load('components/admin-live/LiveOrderItemEditCard.tsx').default;
const item = { id: '1', productId: '793', productName: '꼼데 가디건', color: '차콜 핑크셔츠', size: 'M', qty: 1, unitPrice: 55000, amount: 55000, inventoryDeductionStatus: 'deducted_option' };
let tree;
await act(async () => { tree = Renderer.create(React.createElement(Card, { item, index: 0 })); });
const txt = (n) => (n.children || []).map((c) => typeof c === 'string' ? c : txt(c)).join('');
const btn = (label) => tree.root.findAll((n) => n.type === 'button' && txt(n).trim() === label)[0];
await act(async () => { btn('수정').props.onClick(); });
await act(async () => {});
let text = txt(tree.root);
assert.ok(text.includes('지금 옵션 「색상 차콜 핑크셔츠 · 사이즈 M」은 상품에 없어요') || text.includes('은 상품에 없어요'), '옛 옵션 경고');
let selects = tree.root.findAllByType('select');
assert.equal(selects.length, 2);
assert.deepEqual(selects[0].findAllByType('option').map(txt), ['색상을 고르세요', '블랙 핑크하트', '차콜 핑크하트']);
const saveBtn = () => btn('저장') || tree.root.findAll((n) => n.type === 'button' && /저장/.test(txt(n)))[0];
assert.equal(saveBtn().props.disabled, true, '옛 옵션 그대로면 저장 막힘');
await act(async () => { selects[0].props.onChange({ target: { value: '차콜 핑크하트' } }); });
selects = tree.root.findAllByType('select');
assert.deepEqual(selects[1].findAllByType('option').map(txt), ['사이즈를 고르세요', 'M · 재고 2', 'S · 재고 2']);
assert.equal(selects[1].props.value, 'M', '같은 사이즈 유지');
assert.equal(saveBtn().props.disabled, false);
await act(async () => { await saveBtn().props.onClick(); });
assert.deepEqual([saved[0].color, saved[0].size], ['차콜 핑크하트', 'M']);
// 직접 입력 전환
await act(async () => { btn('수정').props.onClick(); });
await act(async () => {});
await act(async () => { btn('직접 입력').props.onClick(); });
assert.equal(tree.root.findAllByType('select').length, 0);
assert.ok(btn('목록에서 고르기'));
console.log('test-order-item-option-pick OK');
