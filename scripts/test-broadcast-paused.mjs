// [2026-11-09] 방송 「잠시 쉬는 중」 판정 — ON + paused_at 이 이번 방송 시작 뒤일 때만
import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';
const mod = createUiLoader({ '@/lib/supabase': { supabase: {} }, '@/lib/adminCatalogWrite': { adminCatalogWrite: async () => ({ data: null, error: null }) } })('components/admin-live/liveBroadcastController.ts');
const fn = mod.isBroadcastPausedNow;
assert.equal(fn(null), false);
assert.equal(fn({ status: 'ON', paused_at: null }), false);
assert.equal(fn({ status: 'OFF', paused_at: '2026-11-09T03:00:00Z' }), false, 'OFF 면 무관');
assert.equal(fn({ status: 'ON', paused_at: '2026-11-09T03:00:00Z', started_at: '2026-11-08T23:41:49Z' }), true);
assert.equal(fn({ status: 'ON', paused_at: '2026-11-01T03:00:00Z', started_at: '2026-11-08T23:41:49Z' }), false, '옛 방송에 남은 값 무시');
assert.equal(fn({ status: 'ON', paused_at: '2026-11-09T03:00:00Z' }), true);
console.log('PASS isBroadcastPausedNow 6');
