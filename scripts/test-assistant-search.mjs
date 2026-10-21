// [2026-10-22] AI 비서 1단계 — 대충 입력한 닉네임·상품명 찾기 규칙 시뮬레이션
import assert from 'node:assert/strict';
import { matchText, bestMatch, stripNicknameSuffix, toChoseong, maskPhone, parseIntentByRule, parseIntentJson, normalizeSearchText } from '../lib/assistantSearch.ts';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };

t('꼬리표 떼기', () => {
  assert.equal(stripNicknameSuffix('홍길동-f2h'), '홍길동');
  assert.equal(stripNicknameSuffix('홍길동_123'), '홍길동');
  assert.equal(stripNicknameSuffix('루루짱929'), '루루짱929');
  assert.equal(stripNicknameSuffix('abc-1'), 'abc');
});

t('사장님 예: 홍길동-f2h 를 「홍길」「홍길동」으로 찾음', () => {
  assert.equal(matchText('홍길동', '홍길동-f2h'), 'exact');
  assert.equal(matchText('홍길', '홍길동-f2h'), 'partial');
  assert.equal(matchText('홍 길 동', '홍길동-f2h'), 'exact');
  assert.equal(matchText('HONG', 'hong_gil'), 'exact');
});

t('초성', () => {
  assert.equal(toChoseong('홍길동'), 'ㅎㄱㄷ');
  assert.equal(matchText('ㅎㄱㄷ', '홍길동-f2h'), 'choseong');
  assert.equal(matchText('ㄱㄷ', '홍길동'), 'choseong');
  assert.equal(matchText('ㅁㄴ', '홍길동'), null);
});

t('오타(자모 1개)', () => {
  assert.equal(matchText('홍길돈', '홍길동-f2h'), 'typo');
  assert.equal(matchText('행복나무', '행복나무3899'), 'partial');
  assert.equal(matchText('행봉나무', '행복나무3899'), 'typo');
  assert.equal(matchText('김철수', '홍길동'), null);
  // 한 글자 검색은 오타로 안 넓힘(엉뚱한 사람 대량)
  assert.equal(matchText('홍', '황'), null);
});

t('여러 칸 중 가장 잘 맞는 것(받는 분 포함)', () => {
  const m = bestMatch('김영희', [
    { label: '닉네임', value: '영희맘-a1' },
    { label: '이름', value: '김영희' },
    { label: '받는 분', value: '김영희' },
  ]);
  assert.deepEqual([m.kind, m.label], ['exact', '이름']);
  assert.equal(bestMatch('영희', [{ label: '닉네임', value: '영희맘-a1' }]).kind, 'partial');
});

t('상품명 대충', () => {
  assert.equal(matchText('폴로자켓', '폴로 자켓 네이비'), 'partial');
  assert.equal(matchText('프라다', 'PRADA 프라다 나일론백'), 'partial');
  assert.equal(normalizeSearchText('MIU-2'), 'miu2');
  // 상품번호: 꼬리표로 잘라 「PD」만 남거나 202↔206 오타로 섞이면 안 됨
  assert.equal(matchText('PD-206', 'PD-202 블랙'), null);
  assert.equal(matchText('PD-206', 'PD-206 브라운'), 'partial');
});

t('전화 가리기', () => {
  assert.equal(maskPhone('010-1234-5678'), '010-****-5678');
  assert.equal(maskPhone(''), '');
});

t('AI 없이 해석', () => {
  assert.deepEqual(parseIntentByRule('홍길 주문한 사람 찾아줘'), { intent: 'customer', name: '홍길', product: '' });
  assert.equal(parseIntentByRule('폴로자켓 상품 챙기기').intent, 'product');
  assert.equal(parseIntentByRule('폴로자켓 상품 챙기기').product, '폴로자켓');
  assert.equal(parseIntentByRule('  ').intent, 'unknown');
  assert.deepEqual(parseIntentByRule('폴로 누가 샀어?'), { intent: 'product', name: '', product: '폴로' });
});

t('AI 응답 읽기', () => {
  assert.deepEqual(parseIntentJson('{"intent":"customer","name":"홍길","product":""}'), { intent: 'customer', name: '홍길', product: '' });
  assert.equal(parseIntentJson('```json\n{"intent":"product","name":"","product":"폴로"}\n```').product, '폴로');
  assert.equal(parseIntentJson('엉망'), null);
  assert.equal(parseIntentJson('{"intent":"customer","name":""}'), null);
});

console.log(`ALL PASS assistant search (${n})`);
