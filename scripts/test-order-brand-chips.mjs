import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
// Execute the actual customer-page classifier and chip counter, not a replica.
const page = fs.readFileSync('app/order/page.tsx', 'utf8');
const start = page.indexOf('const ORDER_BRAND_LIST =');
const end = page.indexOf('function productSuggestionEnabled', start);
const source = ts.transpileModule(page.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const { classify, chips } = vm.runInThisContext('(function(){' + source + '\nreturn {classify: orderBrandOfDetailName, chips: orderBrandChips};})()');
const names = ['PL-1(폴로 랄프 로렌)', 'MX-1(막스마라)', 'BC-201(브루넬로 쿠치넬리)', 'BC-101(브루넬로 쿠치넬리)', 'BV-101(보테가)', 'VLT-101(발렌티노)', '상품명 없음-3', '상품명 없음-4', '상품명 없음-7'];
assert.equal(classify(names[0]), '폴로 랄프 로렌', 'Explicit Polo brand must not disappear from chips');
assert.equal(classify(names[1]), '막스마라');
assert.equal(classify(names[2]), '브루넬로 쿠치넬리');
assert.deepEqual(Object.fromEntries(chips(names).map(row => [row.brand, row.count])), {
  '브루넬로 쿠치넬리': 2, '막스마라': 1, '발렌티노': 1, '보테가': 1, '폴로 랄프 로렌': 1,
});
assert.equal(classify('상품명 없음-3'), null, 'Do not guess missing brands');
assert.equal(classify('BB-69(베이지)'), null, 'A color in parentheses is not a brand');
assert.equal(classify('킬리안 세이크리드우드'), '킬리안', 'Do not misclassify a product suffix as Creed');
assert.equal(classify('립 입생 골디'), '입생로랑', 'Keep existing category-prefix and alias behavior');
assert.deepEqual(chips(['겔랑 향수', '겔랑 립']), [], 'Single-brand groups keep their existing display');
console.log('Order brand chips: 5 confirmed brands/6 items, no guessing, color exclusion and legacy perfume behavior passed');
