import assert from 'node:assert/strict';
import { productPage } from '../lib/productPagination.ts';

// Catches overlapping/missing rows, empty last pages after filtering/deletion,
// and off-by-one ranges. Expectations are independently hand-counted.
const rows = Array.from({length:45}, (_,i)=>i+1);
const first = productPage(rows,1,20);
assert.deepEqual(first.items,Array.from({length:20},(_,i)=>i+1));
assert.deepEqual([first.page,first.pageCount,first.start,first.end],[1,3,1,20]);
assert.deepEqual(productPage(rows,2,20).items,Array.from({length:20},(_,i)=>i+21));
assert.deepEqual(productPage(rows,3,20).items,[41,42,43,44,45]);
assert.equal(new Set([1,2,3].flatMap(p=>productPage(rows,p,20).items)).size,45);
assert.deepEqual(productPage(rows.slice(0,3),3,20).items,[1,2,3]);
assert.deepEqual(productPage([],4,20),{items:[],page:1,pageCount:1,total:0,start:0,end:0});
assert.equal(productPage(rows,1,10).items.length,10);
assert.equal(productPage(rows,1,50).items.length,45);
assert.equal(productPage(rows,-1,20).page,1);
assert.equal(productPage(rows,NaN,0).page,1);
console.log('PASS pagination: ranges, no skipped/duplicate rows, filtering/deletion, empty results and page sizes');
