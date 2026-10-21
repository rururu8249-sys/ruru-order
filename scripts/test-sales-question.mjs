// [2026-10-22] AI 비서 2단계 — 숫자 질문 계산(판매분석과 같은 기준)·기간(한국 시간)·말 알아듣기 시뮬레이션
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';

const load = createUiLoader();
const sq = load('lib/salesQuestion.ts');
const pq = load('lib/statQuestionParse.ts');
const ai = load('lib/assistantSearch.ts');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };

// 2026-10-22 02:44 KST (= 10-21 17:44 UTC, 목요일)
const NOW = Date.parse('2026-10-21T17:44:00Z');
const at = (kst) => new Date(Date.parse(kst + '+09:00')).toISOString();

t('기간: 한국 시간 경계', () => {
  const today = sq.resolvePeriod('today', NOW);
  assert.equal(today.fromIso, at('2026-10-22T00:00:00'));
  assert.equal(today.toIso, at('2026-10-23T00:00:00'));
  const y = sq.resolvePeriod('yesterday', NOW);
  assert.equal(y.fromIso, at('2026-10-21T00:00:00'));
  const w = sq.resolvePeriod('this_week', NOW); // 목요일 → 월요일 10-19 부터
  assert.equal(w.fromIso, at('2026-10-19T00:00:00'));
  const lw = sq.resolvePeriod('last_week', NOW);
  assert.deepEqual([lw.fromIso, lw.toIso], [at('2026-10-12T00:00:00'), at('2026-10-19T00:00:00')]);
  const lm = sq.resolvePeriod('last_month', NOW);
  assert.deepEqual([lm.fromIso, lm.toIso], [at('2026-09-01T00:00:00'), at('2026-10-01T00:00:00')]);
  const d = sq.resolvePeriod('date', NOW, { date: '2026-10-18' });
  assert.equal(d.fromIso, at('2026-10-18T00:00:00'));
  // 자정 직전 주문은 그날, 자정 지난 주문은 다음 날
  assert.equal(sq.rowInPeriod({ created_at: at('2026-10-21T23:59:59') }, y), true);
  assert.equal(sq.rowInPeriod({ created_at: at('2026-10-22T00:00:01') }, y), false);
});

t('지난 방송 = 가장 최근 시작한 방송의 주문 전부', () => {
  const bc = [
    { id: '1015', title: '남녀공용의류', started_at: at('2026-10-15T20:00:00') },
    { id: '1018', title: '신발', started_at: at('2026-10-18T20:00:00') },
    { id: '1099', title: '예약', started_at: at('2026-10-30T20:00:00') }, // 아직 안 함
  ];
  const p = sq.resolvePeriod('last_broadcast', NOW, { broadcasts: bc });
  assert.equal(p.broadcastId, '1018');
  assert.ok(p.label.includes('신발'));
  // 자정 넘긴 늦은 주문도 그 방송에 포함
  assert.equal(sq.rowInPeriod({ broadcast_id: 1018, created_at: at('2026-10-19T00:30:00') }, p), true);
  assert.equal(sq.rowInPeriod({ broadcast_id: 1015, created_at: at('2026-10-18T21:00:00') }, p), false);
});

const row = (id, o) => ({
  id, order_group_id: o.g, order_lookup_code: o.g, broadcast_id: 'b' in o ? o.b : 1018, created_at: o.at ?? at('2026-10-22T01:00:00'),
  youtube_nickname: o.nick, customer_name: o.name, customer_phone: o.phone, product_id: o.pid ?? '677', product_name: o.p,
  color: o.color ?? '', size: o.size ?? '', qty: o.qty ?? 1, product_price: o.price, adjusted_product_price: o.price * (o.qty ?? 1),
  final_amount: o.total, total_price: o.total, adjusted_total_price: o.total, shipping_fee: 0,
  payment_method: o.card ? '카드결제' : '무통장입금', admin_order_status_v2: o.st, order_manage_status: o.st,
  is_deleted: o.del ?? false, is_test_order: o.test ?? false, event_gift_winner_id: o.gift ?? null,
});
const orders = [
  row(1, { g: 'A', nick: '행복나무', name: '박행복', phone: '01011110001', p: '폴로 셔츠', color: '블랙', size: 'M', qty: 2, price: 30000, total: 60000, st: '자동입금확인' }),
  row(2, { g: 'B', nick: '홍길동', name: '홍길동', phone: '01011110002', p: '폴로 셔츠', color: '화이트', size: 'L', qty: 1, price: 30000, total: 30000, st: '수동입금확인' }),
  row(3, { g: 'B', nick: '홍길동', name: '홍길동', phone: '01011110002', p: '니트', qty: 1, price: 50000, total: 50000, st: '수동입금확인' }),
  row(4, { g: 'C', nick: '미입금손님', name: '김미입', phone: '01011110003', p: '니트', qty: 3, price: 50000, total: 150000, st: '' }),
  row(5, { g: 'D', nick: '취소손님', name: '이취소', phone: '01011110004', p: '니트', qty: 9, price: 50000, total: 450000, st: '주문서취소' }),
  row(6, { g: 'E', nick: '테스트', name: '테스트', phone: '01011110005', p: '니트', qty: 9, price: 50000, total: 450000, st: '자동입금확인', test: true }),
  row(7, { g: 'F', nick: '선물', name: '선물', phone: '01011110006', p: '니트', qty: 9, price: 50000, total: 450000, st: '자동입금확인', gift: 'w1' }),
  row(8, { g: 'G', nick: '카드손님', name: '최카드', phone: '01011110007', p: '폴로 셔츠', color: '블랙', size: 'M', qty: 1, price: 30000, total: 32100, st: '카드결제완료', card: true }),
  row(9, { g: 'H', nick: '어제손님', name: '어제', phone: '01011110008', p: '니트', qty: 1, price: 50000, total: 50000, st: '자동입금확인', at: at('2026-10-21T22:00:00') }),
];

t('계산: 결제완료만·취소/테스트/선물 제외·미결제 따로', () => {
  const a = sq.computeSalesAnswer(orders, sq.resolvePeriod('today', NOW));
  assert.equal(a.orderCount, 3);               // A, B, G
  assert.equal(a.buyerCount, 3);
  assert.equal(a.qty, 2 + 1 + 1 + 1);
  assert.equal(a.unpaidCount, 1);              // C
  assert.equal(a.unpaidAmount > 0, true);
  // 상품 순위: 수량 순
  assert.equal(a.topProducts[0].name, '폴로 셔츠');
  assert.equal(a.topProducts[0].qty, 4);
  // 손님 순위: 금액 순 · 전화번호는 밖으로 안 나감
  assert.equal(a.topBuyers[0].nickname, '홍길동');
  assert.equal(a.topBuyers[0].orderCount, 1);
  assert.ok(a.topBuyers.every((b) => !/010/.test(b.key)));
});

t('판매분석 화면과 같은 제외 규칙 함수(같은 함수를 import)', () => {
  const panelSrc = require('node:fs').readFileSync('components/admin-live/SalesAnalysisPanel.tsx', 'utf8');
  assert.ok(panelSrc.includes("import {salesVisibleRow} from '@/lib/salesQuestion'"));
  assert.ok(panelSrc.includes('const visibleRow=salesVisibleRow;'));
  assert.equal(sq.salesVisibleRow(orders[4]), false); // 취소
  assert.equal(sq.salesVisibleRow(orders[5]), false); // 테스트
  assert.equal(sq.salesVisibleRow(orders[6]), false); // 선물
  assert.equal(sq.salesVisibleRow(orders[0]), true);
});

t('어제 기간', () => {
  const a = sq.computeSalesAnswer(orders, sq.resolvePeriod('yesterday', NOW));
  assert.equal(a.orderCount, 1);
  assert.equal(a.topBuyers[0].nickname, '어제손님');
});

t('말 알아듣기(AI 없이)', () => {
  assert.deepEqual(pq.parseStatQuestion('오늘 누가 많이 샀어?', NOW), { stat: 'top_buyers', period: 'today' });
  assert.deepEqual(pq.parseStatQuestion('이번 주 뭐 잘 나갔어', NOW), { stat: 'top_products', period: 'this_week' });
  assert.deepEqual(pq.parseStatQuestion('어제 매출 얼마야', NOW), { stat: 'summary', period: 'yesterday' });
  assert.deepEqual(pq.parseStatQuestion('지난 방송 베스트', NOW), { stat: 'top_products', period: 'last_broadcast' });
  assert.deepEqual(pq.parseStatQuestion('10월 18일 많이 팔린 거', NOW), { stat: 'top_products', period: 'date', date: '2026-10-18' });
  assert.equal(pq.parseStatQuestion('홍길 주문한 사람', NOW), null);
  // 비서 전체 규칙 해석에서도 숫자 질문이 먼저
  assert.equal(ai.parseIntentByRule('오늘 누가 많이 샀어?', NOW).intent, 'stats');
  assert.equal(ai.parseIntentByRule('폴로 누가 샀어?', NOW).intent, 'product');
});

t('AI 응답 검사(정해진 값만)', () => {
  assert.deepEqual(ai.parseIntentJson('{"intent":"stats","stat":"top_buyers","period":"yesterday"}'), { intent: 'stats', name: '', product: '', stat: 'top_buyers', period: 'yesterday' });
  assert.equal(ai.parseIntentJson('{"intent":"stats","stat":"hack","period":"today"}'), null);
  assert.equal(ai.parseIntentJson('{"intent":"stats","stat":"summary","period":"date","date":""}'), null);
  // [10/22] 기간 말 없음·모르는 값 → period 비움(화면 칩으로 정함)
  assert.equal(ai.parseIntentJson('{"intent":"stats","stat":"summary","period":"nope"}').period, undefined);
  assert.equal(ai.parseIntentJson('{"intent":"stats","stat":"top_days","period":""}').stat, 'top_days');
  assert.deepEqual(pq.parseStatQuestion('이 기간동안 최대 매출이 많이 나온 날은?', NOW), { stat: 'top_days' });
  assert.deepEqual(pq.parseStatQuestion('어느 날 제일 많이 팔렸어', NOW), { stat: 'top_days' });
  assert.deepEqual(pq.parseStatQuestion('이기간동안 매출이 제일 적었던 때는?', NOW), { stat: 'bottom_days' });
  assert.deepEqual(pq.parseStatQuestion('최근 3개월 매출', NOW), { stat: 'summary', period: 'last_3_months' });
  assert.deepEqual(pq.parseStatQuestion('뭐 잘 나갔어?', NOW), { stat: 'top_products' });
});

console.log(`ALL PASS sales question (${n})`);

t('[10/22] 날짜 순위 — 방송 제목·시작~종료·시간, 쇼핑몰만 있는 날, 최근 3개월·적은 순', () => {
  const bc = [{ id: '1018', title: '신발 방송', started_at: at('2026-10-21T20:00:00'), ended_at: at('2026-10-21T23:30:00') }];
  const shop = row(10, { g: 'S', b: null, nick: '쇼핑몰손님', name: '쇼', phone: '01011110009', p: '니트', qty: 1, price: 10000, total: 10000, st: '자동입금확인', at: at('2026-10-15T12:00:00') });
  const a = sq.computeSalesAnswer([...orders, shop], sq.resolvePeriod('last_3_months', NOW), 10, bc);
  assert.ok(a.topDays.length >= 3);
  assert.equal(a.topDays[0].date, '2026-10-22');
  assert.equal(a.topDays[0].broadcastTitle, '신발 방송');
  assert.equal(a.topDays[0].timeRange, '20:00~23:30');
  assert.equal(a.topDays[0].hours, 3.5);
  const shopDay = a.topDays.find((d) => d.date === '2026-10-15');
  assert.equal(shopDay.shopOnly, true);
  assert.equal(a.bottomDays[0].date, '2026-10-15');
  assert.ok(sq.resolvePeriod('last_3_months', NOW).label.startsWith('최근 3개월'));
});
console.log('day ranking ok');
