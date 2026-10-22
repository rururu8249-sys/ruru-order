// [2026-10-22] 캡처 사진 개인정보 가리기 판정 — 전화·계좌·주소는 가리고 날짜·시간·가격·상품명은 안 가림
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

t('[10/22 실측] 카톡 주문내역 캡처 — 날짜·시간·쉼표 금액·「원」 앞 숫자는 안 가리고 괄호 전화·주소는 가림', () => {
  const words = [
    w('주문일:', 0, 0), w('2026.10.18', 0, 60), w('일요일', 0, 170), w('23:17', 0, 230),
    w('주문자:', 1, 0), w('윤장훈', 1, 60), w('(010-2225-2244)', 1, 110),
    w('주소:', 2, 0), w('(08596)', 2, 50), w('서울', 2, 120), w('금천구', 2, 150), w('벚꽃로', 2, 190), w('73', 2, 230),
    w('1', 3, 0), w('개', 3, 20), w('ㆍ', 3, 40), w('29,000', 3, 60), w('원', 3, 130),
    w('상품금액', 4, 0), w('198,000', 4, 90), w('원', 4, 170),
    w('우리', 5, 0), w('1002-065-439765', 5, 30),
    w('새마을금고', 6, 0), w('9002186993725', 6, 60),
  ];
  const boxes = lib.pickMaskBoxes(lib.mergeAdjacentNumberWords(words));
  const numberLines = boxes.filter((b) => b.reason === 'number').map((b) => b.y0 / 20).sort();
  assert.deepEqual(numberLines, [1, 2, 5, 6], '전화·우편번호·계좌 2개만');
  // 「우리」가 「…리」 주소 단어로 잡혀 계좌 줄(5)도 주소 줄로 통째 가림 — 계좌 줄이라 더 가려도 됨
  assert.deepEqual(boxes.filter((b) => b.reason === 'address').map((b) => b.y0 / 20), [2, 5]);
  assert.equal(boxes.some((b) => b.y0 === 0 || b.y0 === 60 || b.y0 === 80), false, '날짜·시간·가격 줄은 안 가림');
});

t('「우리 15,000원 보냈어요」 — 가격만 있는 줄은 주소 줄로 안 가림', () => {
  const boxes = lib.pickMaskBoxes([w('우리', 0, 0), w('15,000원', 0, 30), w('보냈어요', 0, 120), w('우리', 1, 0), w('2', 1, 30), w('개', 1, 50)]);
  assert.equal(boxes.length, 0);
});

t('조각 계획 — 작은 캡처(756×1654)는 4배·6조각, 큰 캡처(1170×2532)는 2.6배·조각 겹침 40px', () => {
  const a = lib.ocrStripPlan(756, 1654);
  assert.equal(a.scale, 4);
  assert.equal(a.strips.length, 6);
  assert.equal(a.strips[0].sh - (a.strips[1].sy - a.strips[0].sy), 40);
  assert.equal(a.strips.at(-1).sy + a.strips.at(-1).sh, 1654);
  const b = lib.ocrStripPlan(1170, 2532);
  assert.equal(b.scale, 2.6);
  assert.ok(b.strips.length >= 5);
});

console.log(`ALL PASS image privacy mask (${n})`);

t('[10/22] 「230으로 보내주세요」「2번으로 나눠서」 는 주소 아님 · 계좌는 가림', () => {
  const W = (text, i, line) => ({ text, x0: i * 60, y0: line * 30, x1: i * 60 + 50, y1: line * 30 + 20, line });
  const words = [
    W('그럼...', 0, 0), W('230으로', 1, 0), W('보내주세요', 2, 0),
    W('송금드렸습니다', 0, 1), W('2번으로', 1, 1), W('나눠져서', 2, 1),
    W('9002', 0, 2), W('1869', 1, 2), W('93725', 2, 2), W('새마을금고', 3, 2),
    W('230', 0, 3), W('으로', 1, 3), W('보내주세요', 2, 3),
    W('손가락', 0, 4), W('2개면', 1, 4), W('225가', 2, 4), W('맞으려나요', 3, 4),
    W('오전', 0, 5), W('1147', 1, 5),
  ];
  const boxes = lib.pickMaskBoxes(lib.mergeAdjacentNumberWords(words));
  assert.equal(boxes.filter((b) => b.reason === 'address').length, 0);
  assert.equal(boxes.filter((b) => b.reason === 'number').length, 1);
});
console.log('size-word ok');
