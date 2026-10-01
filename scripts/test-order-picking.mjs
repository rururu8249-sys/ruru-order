import assert from 'node:assert/strict';
import { pickingProgress, savePicking } from '../lib/orderPicking.ts';

assert.deepEqual(pickingProgress([{ qty: 3, pickedAt: null, collectedAt: 'old' }]), { total: 3, got: 0 });
assert.deepEqual(pickingProgress([{ qty: 3, pickedAt: 'done' }, { qty: 2, pickedAt: null }]), { total: 5, got: 3 });
assert.deepEqual(pickingProgress([]), { total: 0, got: 0 });
const writes = [];
const client = (returnRows) => ({ from(table) {
  assert.equal(table, 'orders');
  return { update(payload) { return { in(column, ids) { return { async select(columns) {
    writes.push({ payload, column, ids, columns });
    return { data: returnRows(ids, payload), error: null };
  } }; } }; } };
} });
const fake = client((ids, payload) => ids.map(id => ({ id, ...payload })));
await savePicking(fake, ['12', '12', '13'], true, '2026-10-01T12:00:00Z');
assert.deepEqual(writes[0], { payload: { picked_at: '2026-10-01T12:00:00Z' }, column: 'id', ids: [12, 13], columns: 'id, picked_at' });
await savePicking(fake, ['12'], false);
assert.deepEqual(writes[1].payload, { picked_at: null });
await assert.rejects(savePicking(client(() => []), ['12'], true), /저장/);
await assert.rejects(savePicking(client(ids => ids.map(id => ({id, picked_at: null}))), ['12'], true), /저장/);
await assert.rejects(savePicking(fake, ['bad'], true), /ID/);
await savePicking(fake, Array.from({length: 501}, (_, i) => String(i + 1)), true);
assert.equal(writes.at(-2).ids.length, 500);
assert.equal(writes.at(-1).ids.length, 1);
console.log('order picking: canonical progress, update-only-picked, clear, denied/missing/stale rows, invalid IDs, chunking passed');
