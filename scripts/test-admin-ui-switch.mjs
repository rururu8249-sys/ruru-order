// [2026-10-21 a1-3] 관리자 새 색 미리보기 스위치 — ?preview=a1 켬 / ?preview=off 끔 / 저장값 / 기본값
import assert from 'node:assert/strict';
import { resolveAdminUiPreview, ADMIN_PREVIEW_DEFAULTS, adminPreviewStorageKey, readAdminUiPreview } from '../lib/adminUiSwitch.ts';

assert.equal(ADMIN_PREVIEW_DEFAULTS.a1, true, 'a1 is on by default (2026-10-21 a1-4) — ?preview=off turns it off per browser');
assert.equal(adminPreviewStorageKey('a1'), 'ruru_admin_preview_a1');
assert.deepEqual(resolveAdminUiPreview('a1', null, 'a1', false), { store: '1', on: true }, '?preview=a1 turns on and remembers');
assert.deepEqual(resolveAdminUiPreview('off', '1', 'a1', false), { store: '0', on: false }, '?preview=off turns off and remembers');
assert.deepEqual(resolveAdminUiPreview(null, '1', 'a1', false), { store: null, on: true }, 'remembered on');
assert.deepEqual(resolveAdminUiPreview(null, '0', 'a1', true), { store: null, on: false }, 'remembered off beats default on');
assert.deepEqual(resolveAdminUiPreview(null, null, 'a1', false), { store: null, on: false }, 'no value → default off');
assert.deepEqual(resolveAdminUiPreview(null, null, 'a1', true), { store: null, on: true }, 'no value → default on (after switch)');
assert.deepEqual(resolveAdminUiPreview('s3', 'garbage', 'a1', false), { store: null, on: false }, 'customer stage / junk stored value ignored');

// 브라우저 읽기: 주소 → 저장, 저장소 오류 → 기본값
const store = new Map();
globalThis.window = { location: { search: '?preview=a1' }, localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
assert.equal(readAdminUiPreview('a1'), true); assert.equal(store.get('ruru_admin_preview_a1'), '1');
window.location.search = ''; assert.equal(readAdminUiPreview('a1'), true, 'reload without query keeps it on');
window.location.search = '?preview=off'; assert.equal(readAdminUiPreview('a1'), false); assert.equal(store.get('ruru_admin_preview_a1'), '0');
window.localStorage = { getItem() { throw new Error('blocked'); }, setItem() {} };
assert.equal(readAdminUiPreview('a1'), true, 'storage blocked → default (on)');
// [2026-10-21 a2-2] 상품 등록 폼 새 배치 — 기본 꺼짐, ?preview=a2 켬(a1 은 안 건드림)
assert.equal(ADMIN_PREVIEW_DEFAULTS.a2, true, 'a2 is the default since 2026-10-21 a2-2b (?preview=off turns it off per browser)');
assert.equal(adminPreviewStorageKey('a2'), 'ruru_admin_preview_a2');
assert.deepEqual(resolveAdminUiPreview('a2', null, 'a2', false), { store: '1', on: true });
assert.deepEqual(resolveAdminUiPreview('a2', '1', 'a1', true), { store: null, on: true }, '?preview=a2 leaves a1 as it was');
assert.deepEqual(resolveAdminUiPreview(null, null, 'a2', false), { store: null, on: false });
console.log('admin ui switch passed');
