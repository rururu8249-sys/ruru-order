import assert from 'node:assert/strict';
let api;
try { api = await import('../lib/eventCustomGift.ts'); } catch {}
assert.ok(api?.normalizeCustomGiftName, 'custom gift validation is missing');
assert.equal(api.normalizeCustomGiftName('  선물 A  '), '선물 A');
assert.equal(api.normalizeCustomGiftName('<선물>'), '<선물>');
for (const value of ['', '   ', null, 3, 'x'.repeat(41)]) assert.throws(() => api.normalizeCustomGiftName(value));
assert.equal(api.normalizeCustomGiftName('x'.repeat(40)).length, 40);
console.log('PASS gift name boundary: literal text, empty, type, length');
