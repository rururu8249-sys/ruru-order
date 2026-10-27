// [2026-10-27] 상품 저장 때 옵션 «이름만 바꿈» 기록 — 상품 폼 재고 승계와 같은 규칙
import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const L = createUiLoader()('lib/optionRenames.ts');
const v = (c, s) => ({ color: c, size: s });
// 꼼데: 셔츠 → 하트 (사이즈 2개)
assert.deepEqual(L.detectOptionRenames([v('블랙 하트','M'), v('차콜 핑크셔츠','M'), v('차콜 핑크셔츠','S')], [v('블랙 하트','M'), v('차콜 핑크하트','M'), v('차콜 핑크하트','S')]),
  [{ from_color:'차콜 핑크셔츠', from_size:'M', to_color:'차콜 핑크하트', to_size:'M' }, { from_color:'차콜 핑크셔츠', from_size:'S', to_color:'차콜 핑크하트', to_size:'S' }]);
// 그대로·공백만 바뀜·없음↔빈칸 → 기록 없음
assert.deepEqual(L.detectOptionRenames([v('블랙','M')], [v('블랙','M')]), []);
assert.deepEqual(L.detectOptionRenames([v('225(US5.5)','')], [v('225(US55)','')]), []);
assert.deepEqual(L.detectOptionRenames([v('','M')], [v('없음','M')]), []);
// 추가만 / 삭제만 → 기록 없음(개수 다름)
assert.deepEqual(L.detectOptionRenames([v('블랙','M')], [v('블랙','M'), v('화이트','M')]), []);
assert.deepEqual(L.detectOptionRenames([v('블랙','M'), v('화이트','M')], [v('블랙','M')]), []);
// 새 상품(이전 없음) → []
assert.deepEqual(L.detectOptionRenames([], [v('블랙','M')]), []);
// 합치기: 이어 바꾸기(A→B, B→C)는 둘 다 남음, 되돌리기(지금 이름이 옛 이름)는 뺌, 같은 옛 이름은 새 것이 이김
let m = L.mergeOptionRenames([{ from_color:'A', from_size:'', to_color:'B', to_size:'' }], [{ from_color:'B', from_size:'', to_color:'C', to_size:'' }], [v('C','')], 'T');
assert.deepEqual(m.map(r => [r.from_color, r.to_color]), [['A','B'], ['B','C']]);
m = L.mergeOptionRenames(m, [{ from_color:'C', from_size:'', to_color:'A', to_size:'' }], [v('A','')], 'T2');
assert.deepEqual(m.map(r => [r.from_color, r.to_color]), [['B','C'], ['C','A']]);
assert.deepEqual(L.mergeOptionRenames(undefined, [], [v('A','')]), []);
console.log('test-option-renames OK');
