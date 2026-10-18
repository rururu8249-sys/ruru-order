// [㉜ 2단계] 새 모양 스타일 변환 규칙 — 로즈 0·13px 미만 0·빨강은 글자에만.
import assert from 'node:assert/strict';
import { mapColorV2, restyleV2, stripDecorativeEmojiV2 } from '../lib/customerUiV2Restyle.ts';

// 로즈·자주는 어떤 역할에서도 남지 않는다
for (const rose of ['#7A1E47', '#7B2D43', '#A13A50', '#C2447A', '#F5E6EB', '#F9EEF3', '#F8E9EE', '#E8CDD7', '#D9C5CC', '#E7C9D4', '#F5D9E5']) {
  for (const role of ['text', 'fill', 'line', 'sep']) {
    const out = mapColorV2(rose, role);
    assert.ok(['#FFFFFF', '#111111', '#F5F5F5', '#39393B', '#707072', '#CACACB', '#E5E5E5', '#D30005'].includes(out), `${rose} ${role} → ${out}`);
  }
}
assert.equal(mapColorV2('#7A1E47', 'fill'), '#111111');
assert.equal(mapColorV2('#F5E6EB', 'fill'), '#F5F5F5');
assert.equal(mapColorV2('#C0392B', 'text'), '#D30005', 'red text stays sale red');
assert.notEqual(mapColorV2('#C0392B', 'fill'), '#D30005', 'red never as a fill');
assert.equal(mapColorV2('#fff', 'fill'), '#FFFFFF');
assert.equal(mapColorV2('#333', 'text'), '#111111');
assert.equal(mapColorV2('#B2A9AD', 'text'), '#707072', 'light-grey text on white stays readable');

const s = restyleV2({ fontSize: '10.5px', fontWeight: 900, color: '#7A1E47', background: 'linear-gradient(145deg,#fff,#F7EFF2)', border: '1.5px solid #E8E2DD', boxShadow: '0 2px 6px rgba(0,0,0,.3)', padding: '2px 6px' });
assert.equal(s.fontSize, '13px');
assert.equal(s.fontWeight, 700);
assert.equal(s.color, '#111111');
assert.equal(s.background, 'linear-gradient(145deg,#FFFFFF,#F5F5F5)');
assert.equal(s.border, '1.5px solid #CACACB');
assert.equal(s.boxShadow, 'none');
assert.equal(restyleV2({ borderTop: '1px solid #F0EAE0' }).borderTop, '1px solid #E5E5E5', 'separators use the soft divider');
assert.equal(s.padding, '2px 6px', 'non-color props untouched');
assert.equal(restyleV2({ fontSize: 11 }).fontSize, 13, 'numeric font sizes too');
assert.equal(restyleV2({ fontSize: 16 }).fontSize, 16);
assert.equal(restyleV2(undefined), undefined);
assert.equal(restyleV2({ background: 'rgba(122,30,71,0.10)' }).background, 'rgba(17,17,17,0.10)');

assert.equal(stripDecorativeEmojiV2('0원 · 🎁 무료나눔'), '0원 · 무료나눔');
assert.equal(stripDecorativeEmojiV2('🖊 직접 입력'), '직접 입력');
assert.equal(stripDecorativeEmojiV2('사이즈 실측 보기'), '사이즈 실측 보기');
console.log('customer ui v2 restyle rules passed');
