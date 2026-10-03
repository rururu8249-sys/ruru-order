import assert from 'node:assert/strict';
import { kstDayStartIso, loadPickingWorkspaceRows, mergePickingWorkspaceRows, parsePickingWorkspaceRequest } from '../lib/orderPickingScopeLoader.ts';

assert.deepEqual(parsePickingWorkspaceRequest({ broadcastIds: [] }), { broadcastIds: [] });
assert.deepEqual(parsePickingWorkspaceRequest({ broadcastIds: [' b1 ', 'b1', 'b2'] }), { broadcastIds: ['b1', 'b2'] });
assert.equal(kstDayStartIso('2026-10-04T03:00:00+09:00'), '2026-10-03T15:00:00.000Z');
assert.deepEqual(
  mergePickingWorkspaceRows([{ id: 1 }, { id: 2 }], [{ id: 2, safety: true }, { id: 3 }]).map((row) => row.id),
  [1, 2, 3],
  'global safety rows are merged without duplicating selected-broadcast rows',
);
assert.throws(() => parsePickingWorkspaceRequest({ broadcastIds: Array.from({ length: 32 }, (_, i) => `b${i}`) }), /31/);
assert.throws(() => parsePickingWorkspaceRequest({ broadcastIds: 'b1' }), /방송/);

const pageRows = (prefix, count, start = 0) => Array.from({ length: count }, (_, i) => ({
  id: start + i + 1,
  broadcast_id: prefix,
  created_at: `2026-10-03T${String((i % 20) + 1).padStart(2, '0')}:00:00Z`,
  is_deleted: false,
}));
const direct = [...pageRows('b1', 1000), ...pageRows('b1', 205, 1000)];
const calls = [];
const source = {
  async getBroadcasts(ids) {
    assert.deepEqual(ids, ['b1']);
    return [{ id: 'b1', started_at: '2026-10-03T00:00:00Z', ended_at: '2026-10-03T23:00:00Z' }];
  },
  async getOrdersByBroadcastIds(ids, from, to) {
    calls.push(['direct', from, to]);
    return direct.slice(from, to + 1);
  },
  async getOrdersByTimeRange(startedAt, endedAt, from, to) {
    calls.push(['range', from, to]);
    const fallback = [direct[0], { id: 2000, broadcast_id: null, created_at: '2026-10-03T12:00:00Z', is_deleted: false }, { id: 2001, is_deleted: true }];
    return fallback.slice(from, to + 1);
  },
};
const loaded = await loadPickingWorkspaceRows(source, ['b1']);
assert.equal(loaded.length, 1206, 'loads beyond Supabase default 1,000 and deduplicates fallback rows');
assert.equal(loaded.filter(row => row.id === 1).length, 1);
assert.equal(loaded.some(row => row.id === 2001), false, 'deleted rows are excluded');
assert.deepEqual(calls.slice(0, 2), [['direct', 0, 999], ['direct', 1000, 1999]]);

await assert.rejects(loadPickingWorkspaceRows({
  getBroadcasts: async () => [{ id: 'b1', started_at: '2026-10-03T00:00:00Z', ended_at: null }],
  getOrdersByBroadcastIds: async () => { throw new Error('query failed'); },
  getOrdersByTimeRange: async () => [],
}, ['b1']), /query failed/, 'query errors propagate so the UI can retain its prior scope');

console.log('picking scope: validation, pagination, fallback dedupe, deletion and errors passed');
