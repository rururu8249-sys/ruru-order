// [2026-10-22] 캡처 사진 개인정보 가리기 판정 — 전화·계좌·주소는 가리고 날짜·가격·상품명은 안 가림
import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';
const lib = createUiLoader()('lib/imagePrivacyMask.ts');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };
const w = (text, line, x0 = 0) => ({ text, x0, y0: line * 20, x1: x0 + text.length * 10, y1: line * 20 + 16, line });

t('전화·계좌 숫자는 가리고 날짜·가격·수량은 안 가림', () => {
  const boxes = lib.pickMaskBoxes([w('010-1234-5678', 0), w('2026년', 1), w('10월', 1), w('39,000원', 2), w('2개', 2), w('3333011234567', 3), w('니트', 4), w('240', 4)]);
  assert.deepEqual(boxes.map((b) => [b.reason, b.y0 / 20]), [['number', 0], ['number', 3]]);
});

t('쪼개진 전화번호 합치기', () => {
  const merged = lib.mergeAdjacentNumberWords([w('010', 0, 0), w('1234', 0, 40), w('5678', 0, 90), w('보내주세요', 0, 150)]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].text, '010 1234 5678');
  assert.equal(lib.pickMaskBoxes(merged).length, 1);
});

t('주소 줄은 줄 전체 가림, 상품명 줄은 안 가림', () => {
  const boxes = lib.pickMaskBoxes([w('서울시', 0, 0), w('강남구', 0, 40), w('테헤란로', 0, 80), w('12', 0, 130), w('행복아파트', 1, 0), w('101동', 1, 60), w('202호', 1, 120), w('폴로', 2, 0), w('자켓', 2, 30), w('네이비', 2, 60)]);
  assert.deepEqual(boxes.filter((b) => b.reason === 'address').map((b) => b.y0 / 20), [0, 1]);
  assert.equal(boxes.some((b) => b.y0 === 40), false);
});

console.log(`ALL PASS image privacy mask (${n})`);
