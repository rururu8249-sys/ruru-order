// [2026-10-22 AI 비서 9단계] 좋은 응대 사례 순수 함수 — 번호 가림·분류 정규화·AI 용 목록(같은 분류 우선)
import assert from 'node:assert/strict';
import { buildCase, casesForAi, normalizeCaseCategory, parseCase, serializeCase } from '../lib/assistantCases.ts';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };

t('buildCase: 전화·계좌 가림 + 손님 말·답장 없으면 null', () => {
  const c = buildCase({ customer: '010-1234-5678 로 연락 주세요 계좌 9002 1869 93725', reply: '네 고객님', reason: 'r' });
  assert.equal(c.customer.includes('1234'), false); assert.equal(c.customer.includes('93725'), false);
  assert.match(c.customer, /\[번호1\]/);
  assert.equal(buildCase({ customer: '', reply: '답' }), null);
  assert.equal(buildCase({ customer: '말', reply: '' }), null);
});
t('serialize/parse 왕복', () => {
  const c = buildCase({ customer: '작아요', reply: '교환 도와드릴게요', situation: '사이즈', reason: '원칙', policy: '', outcome: '' });
  assert.deepEqual(parseCase(serializeCase(c)), c);
  assert.equal(parseCase('깨진 글'), null);
});
t('normalizeCaseCategory', () => {
  assert.equal(normalizeCaseCategory('반품·환불'), '환불');
  assert.equal(normalizeCaseCategory('반품'), '반품');
  assert.equal(normalizeCaseCategory('입금·결제'), '입금');
  assert.equal(normalizeCaseCategory('카드'), '결제');
  assert.equal(normalizeCaseCategory('치수 문의'), '사이즈');
  assert.equal(normalizeCaseCategory(''), '기타');
});
t('casesForAi: 같은 분류 우선·없으면 전체·최대 5·글자 제한', () => {
  const rows = [
    { who: '배송', body: serializeCase(buildCase({ customer: 'a', reply: 'b' })), created_at: '2026-10-20T00:00:00Z' },
    { who: '사이즈', body: serializeCase(buildCase({ customer: 'c', reply: 'd' })), created_at: '2026-10-19T00:00:00Z' },
    { who: '사이즈', body: '깨짐', created_at: '2026-10-18T00:00:00Z' },
  ];
  const same = casesForAi(rows, '사이즈');
  assert.equal(same.length, 1); assert.equal(same[0].customer, 'c'); assert.equal(same[0].when, '2026-10-19');
  assert.equal(casesForAi(rows, '환불').length, 2); // 같은 분류 없으면 전체
  const many = Array.from({ length: 8 }, (_, i) => ({ who: '배송', body: serializeCase(buildCase({ customer: 'x'.repeat(900), reply: 'y' + i })), created_at: '2026-10-01' }));
  const out = casesForAi(many, '배송');
  assert.equal(out.length, 5); assert.equal(out[0].customer.length, 400);
});
console.log(`ALL PASS assistant cases (${n})`);
