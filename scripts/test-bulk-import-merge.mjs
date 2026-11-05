import assert from 'node:assert/strict';
import { mergeImportIntoBrandRow, sameCode, blankBrandRowFrom, noteObject } from '../lib/bulkImportMerge.ts';
const row = { id: 751, product_name: '버버리', price: 129000, detail_image_urls: ['u56', 'u99'], product_note: JSON.stringify({
  brand_group: { enabled: true, brand_ko: '버버리', detail_options: { 'BB-56': { colors: ['없음'], sizes: ['S'], variants: [] }, 'BB-99': { colors: ['블랙'], sizes: ['M'], variants: [] } }, detail_categories: { 'BB-56': '', 'BB-99': '' } },
  option_pricing: { 'BB-56': 40000, 'BB-99': 0 }, combo_hidden: ['BB-56'], detail_photo_sets: { 'BB-56': ['u56'], 'BB-99': ['u99'] }, detail_photos: { 'BB-56': 'u56', 'BB-99': 'u99' },
  stock_variants: [{ color: 'BB-56 / 없음', size: 'S', stock: 0 }, { color: 'BB-99 / 블랙', size: 'M', stock: 0 }],
  option_axes: [{ key: 'detail', values: ['BB-56', 'BB-99'] }] }) };
assert.ok(sameCode('GY-1(바게트)', 'GY-1') && sameCode('BB-56 블랙', 'BB-56') && !sameCode('BB-560', 'BB-56'));
const r = mergeImportIntoBrandRow(row, [
  { code: 'BB-56', title: 'BB-56', price: 169000, sizes: ['S', 'M', 'L'], category: '의류', photoUrl: 'n56' },
  { code: 'BB-501', title: 'BB-501 연베이지', price: 99000, sizes: ['S'], category: '패딩', photoUrl: 'n501' },
]);
const n = noteObject(r.values.product_note);
assert.equal(r.basePriceAfter, 99000);
assert.equal(n.option_pricing['BB-99'], 30000, '안 건드린 BB-99 = 129,000 그대로');
assert.equal(n.option_pricing['BB-56'], 70000, '바꾼 BB-56 = 169,000');
assert.deepEqual(n.combo_hidden, [], '덮어쓴 코드는 숨김 풀림');
assert.deepEqual(r.values.detail_image_urls, ['u99', 'n56', 'n501']);
assert.equal(n.stock_variants.filter((v) => v.color.startsWith('BB-56')).length, 3);
assert.deepEqual(r.values.color_options, ['BB-99', 'BB-56', 'BB-501 연베이지']);
assert.throws(() => mergeImportIntoBrandRow(row, [{ code: 'X', title: 'A/B', price: 1, sizes: ['S'], category: '', photoUrl: 'p' }]));
const blank = blankBrandRowFrom(row, '막스마라', 'MaxMara');
const r2 = mergeImportIntoBrandRow({ ...blank, id: 0 }, [{ code: 'MX-101', title: 'MX-101 브라운', price: 420000, sizes: ['S'], category: '패딩', photoUrl: 'm' }]);
assert.equal(r2.basePriceAfter, 420000);
console.log('test-bulk-import-merge: ok');

// [11-05] 옮기기·구분 비우기
{
  const lib = await import('../lib/bulkImportMerge.ts');
  const row = { id: 1, product_name: 'A', price: 100, detail_image_urls: ['u1','u2'], product_note: { brand_group: { enabled: true, detail_options: { X: { colors: ['없음'], sizes: ['M'] }, Y: { colors: ['없음'], sizes: ['S','M'] } }, detail_categories: { X: '패딩', Y: '의류' } }, option_pricing: { X: 0, Y: 50 }, option_axes: [{ key: 'detail', values: ['X','Y'] }], detail_photo_sets: { X: ['u1'], Y: ['u2'] }, stock_variants: [{ color: 'X / 없음', size: 'M' }, { color: 'Y / 없음', size: 'S' }] } };
  const it = lib.readBrandDetail(row, 'X');
  if (it.price !== 100 || it.photoUrl !== 'u1' || it.sizes.join() !== 'M') throw new Error('readBrandDetail');
  const r = lib.removeDetailsFromBrandRow(row, ['X']);
  if (r.values.price !== 150 || r.values.product_note.option_pricing.Y !== 0 || r.values.color_options.join() !== 'Y' || r.values.detail_image_urls.join() !== 'u2') throw new Error('remove keeps Y price 150');
  let threw = false; try { lib.removeDetailsFromBrandRow(row, ['Z']); } catch { threw = true; } if (!threw) throw new Error('missing name must throw');
  const c = lib.clearDetailCategories(row); if (Object.keys(c.brand_group.detail_categories).length || !c.brand_group.detail_options.X) throw new Error('clearcat');
  console.log('test-bulk-import-merge move/clear: ok');
}
