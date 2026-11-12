// loadProductBrandCatalog — 100개씩 나눈 요청을 최대 4개씩 같이 보내도 결과·검사가 예전과 같은지.
import assert from 'node:assert/strict';
const { loadProductBrandCatalog } = await import('../lib/productBrandCatalogClient.ts');
const ids = Array.from({ length: 850 }, (_, i) => String(i + 1));
let active = 0, peak = 0, calls = 0;
const ok = (fail) => async (_url, options) => {
  calls++; active++; peak = Math.max(peak, active);
  const chunk = JSON.parse(options.body).ids;
  await new Promise(r => setTimeout(r, 20 - (calls % 3) * 5)); // 답이 뒤섞여 도착
  active--;
  if (fail && chunk[0] === '301') return { ok: false, json: async () => ({}) };
  return { ok: true, json: async () => ({ products: chunk.map(id => ({ id: Number(id) })), links: chunk[0] === '1' ? [{ sourceId: '9', parentId: '1', detailName: 'a', originalName: 'b', movedAt: 't' }] : [] }) };
};
const result = await loadProductBrandCatalog([...ids, '5', '5'], ok(false));
assert.equal(calls, 9); assert.ok(peak <= 4 && peak >= 2, `동시 ${peak}`);
assert.deepEqual(result.products.map(p => String(p.id)), ids); // 순서 = 요청 순서
assert.equal(result.links.length, 1);
await assert.rejects(loadProductBrandCatalog(ids, ok(true)), /확인하지 못했습니다/);
const empty = await loadProductBrandCatalog([], ok(false)); assert.deepEqual(empty, { products: [], links: [] });
const conflict = async (_u, o) => ({ ok: true, json: async () => ({ products: [], links: [{ sourceId: '9', parentId: JSON.parse(o.body).ids[0], detailName: 'a', originalName: 'b', movedAt: 't' }] }) });
await assert.rejects(loadProductBrandCatalog(ids.slice(0, 150), conflict), /조회 중 변경/);
console.log('ok brand-catalog-client-parallel');
