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
