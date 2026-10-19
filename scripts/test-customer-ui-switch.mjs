// [㉜] 손님 기본값 v2 전환 — 새 브라우저=새 모양, ?ui=v1=예전 모양(기억), ?ui=v2=새 모양, 기본값 false 로 되돌리면 예전 동작.
import assert from 'node:assert/strict';
import { resolveCustomerUiV2 } from '../lib/customerUiSwitch.ts';

// 기본값 true(현재)
assert.deepEqual(resolveCustomerUiV2(null, null, true), { store: null, v2: true }, 'fresh browser → v2');
assert.deepEqual(resolveCustomerUiV2('v1', null, true), { store: '0', v2: false }, '?ui=v1 → old look, remembered');
assert.deepEqual(resolveCustomerUiV2(null, '0', true), { store: null, v2: false }, 'remembered v1 stays old');
assert.deepEqual(resolveCustomerUiV2('v2', '0', true), { store: '1', v2: true }, '?ui=v2 turns back on');
assert.deepEqual(resolveCustomerUiV2(null, '1', true), { store: null, v2: true }, 'earlier ?ui=v2 testers stay v2');
assert.equal(resolveCustomerUiV2('xyz', null, true).v2, true, 'unknown value ignored');
assert.equal(resolveCustomerUiV2(null, 'garbage', true).v2, true, 'unknown stored value → default');

// 기본값 false(되돌리기) — 예전 동작과 같음
assert.equal(resolveCustomerUiV2(null, null, false).v2, false, 'revert: fresh browser → old look');
assert.equal(resolveCustomerUiV2(null, '1', false).v2, true, 'revert: ?ui=v2 testers keep v2');
assert.equal(resolveCustomerUiV2('v1', '1', false).v2, false);
console.log('customer ui switch passed');

// [㉜ 3~5단계] 단계별 미리보기
import { resolveCustomerUiPreview, UI_PREVIEW_DEFAULTS } from '../lib/customerUiSwitch.ts';
assert.equal(UI_PREVIEW_DEFAULTS.s3, true, 's3 is the customer default since 2026-10-18');
assert.equal(UI_PREVIEW_DEFAULTS.s4, true, 's4 is the customer default since 2026-10-18');
assert.equal(UI_PREVIEW_DEFAULTS.s5, true, 's5 is the customer default since 2026-10-18');
assert.equal(UI_PREVIEW_DEFAULTS.s6, true, 's6 is the customer default since 2026-10-20');
assert.deepEqual(resolveCustomerUiPreview(null, null, 's3', false), { store: null, v2: false }, 'normal customer: no change');
assert.deepEqual(resolveCustomerUiPreview('s3', null, 's3', false), { store: '1', v2: true }, '?preview=s3 turns on');
assert.deepEqual(resolveCustomerUiPreview(null, '1', 's3', false), { store: null, v2: true }, 'remembered');
assert.deepEqual(resolveCustomerUiPreview('s4', null, 's3', false), { store: null, v2: false }, 'other stage does not turn s3 on');
assert.deepEqual(resolveCustomerUiPreview('off', '1', 's3', false), { store: '0', v2: false }, '?preview=off turns off');
assert.equal(resolveCustomerUiPreview(null, null, 's3', true).v2, true, 'after switching default on');
assert.equal(resolveCustomerUiPreview(null, '0', 's3', true).v2, false, 'off stays off');
console.log('customer ui preview passed');
