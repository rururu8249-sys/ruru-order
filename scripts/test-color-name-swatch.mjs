// [㉜] 색 이름 → 색 점 자동 색(표시 전용) — DESIGN.md §4 규칙 검사.
import assert from 'node:assert/strict';
import { colorNameSwatch, isLightSwatch, resolveColorDisplay } from '../lib/colorNameSwatch.ts';

// 흔한 이름은 자동 색, 공백·대소문자 무시
assert.equal(colorNameSwatch('블랙'), '#111111');
assert.equal(colorNameSwatch(' Black '), '#111111');
assert.equal(colorNameSwatch('아이보리'), '#FFFBEA');
assert.equal(colorNameSwatch('라이트 그레이'), '#C9C9CB');
// 코드 같은 이름·섞인 이름·없음은 색을 지어내지 않는다(글씨 칩)
for (const name of ['GY-1(바게트)', 'H-3', '블랙/화이트 스트라이프', '없음', '', '기본']) assert.equal(colorNameSwatch(name), null, name);
// 밝은 색은 테두리
assert.equal(isLightSwatch('#FFFFFF'), true);
assert.equal(isLightSwatch('#111111'), false);
// 관리자 지정 색 우선 → 이름표 → 글씨 칩, 같은 색상은 한 번만, 없음 제외
const items = resolveColorDisplay(['블랙', 'GY-1(바게트)', '네이비', '블랙', '없음'], { 네이비: '#000080', 블랙: null });
assert.deepEqual(items, [
  { label: '블랙', hex: '#111111' },
  { label: 'GY-1(바게트)', hex: null },
  { label: '네이비', hex: '#000080' },
]);
console.log('color name swatch rules passed');
