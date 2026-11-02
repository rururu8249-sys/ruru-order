// [2026-11-02] 텔레그램 방송 결산 — 실제 lib/liveSummary 계산을 가짜 DB 로 돌린 시뮬레이션
//   매출·무통장/카드 건수·포인트 사용(전엔 칸을 안 읽어 0원)·카드 수수료·입금가·순수익·구매 TOP3(카카오 계정 기준)·취소/테스트 제외
import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const db = { broadcasts: [], orders: [], settings: [], admin_tasks: [] };
let ordersError = null;
function query(table) {
  const f = [];
  let single = false, lim = null, from = 0, to = null, order = null;
  const api = {
    select() { return api; },
    eq(c, v) { f.push((r) => String(r[c] ?? '') === String(v)); return api; },
    gte(c, v) { f.push((r) => String(r[c] ?? '') >= String(v)); return api; },
    lte(c, v) { f.push((r) => String(r[c] ?? '') <= String(v)); return api; },
    order(c, o) { order = { c, asc: o?.ascending !== false }; return api; },
    limit(n) { lim = n; return api; },
    range(a, b) { from = a; to = b; return api; },
    maybeSingle() { single = true; return api; },
    then(res, rej) {
      return Promise.resolve().then(() => {
        if (table === 'orders' && ordersError) return { data: null, error: { message: ordersError } };
        let rows = db[table].filter((r) => f.every((fn) => fn(r)));
        if (order) rows = [...rows].sort((a, b) => (String(a[order.c]) < String(b[order.c]) ? -1 : 1) * (order.asc ? 1 : -1));
        if (to !== null) rows = rows.slice(from, to + 1);
        if (lim !== null) rows = rows.slice(0, lim);
        return { data: single ? rows[0] ?? null : rows, error: null };
      }).then(res, rej);
    },
  };
  return api;
}
const load = createUiLoader({ '@supabase/supabase-js': { createClient: () => ({ from: query }) } });
const { computeLiveSummary, rowCardFee, rowCostPrice } = load('lib/liveSummary.ts');
const { formatReport } = load('lib/telegramReport.ts');

const T = (m) => `2026-11-01T${m}:00.000Z`;
db.broadcasts.push(
  { id: 'bc1', public_title: '남녀공용의류', started_at: T('11:04'), ended_at: T('14:58'), status: 'OFF', is_deleted: false },
  { id: 'bc0', public_title: '신발', started_at: '2026-10-30T10:59:00.000Z', ended_at: '2026-10-31T01:09:00.000Z', status: 'OFF', is_deleted: false },
);
db.settings.push({ key: 'actual_card_fee_rate', value: '7' });
let id = 1;
const row = (o) => db.orders.push({ id: id++, qty: 1, is_test_order: false, created_at: T('12:00'), point_used_amount: 0, ...o });
// G1 무통장 입금확인 · 카카오 K1 · 두 줄(입금가 있는 줄 2개 + 없는 줄 1개)
row({ order_group_id: 'G1', kakao_id: 'K1', customer_phone: '01011112222', youtube_nickname: '행복나무', payment_method: '무통장입금', admin_order_status_v2: '입금확인', product_name: '알로 기모 맨투맨', qty: 2, adjusted_product_price: 46000, final_amount: 50000, cost_price_snapshot: 10000 });
row({ order_group_id: 'G1', kakao_id: 'K1', customer_phone: '01011112222', youtube_nickname: '행복나무', payment_method: '무통장입금', admin_order_status_v2: '입금확인', product_name: '폴로 맨투맨', adjusted_product_price: 30000, final_amount: 30000 });
// G2 카드결제완료 · 같은 카카오 K1(번호는 바뀜) → TOP3 에서 한 사람
row({ order_group_id: 'G2', kakao_id: 'K1', customer_phone: '01099998888', youtube_nickname: '행복나무', payment_method: '카드결제', admin_order_status_v2: '카드결제완료', product_name: '알로 기모 맨투맨', adjusted_product_price: 23000, final_amount: 25000, cost_price_snapshot: 10000 });
// G3 미입금 · G4 취소 · G5 테스트
row({ order_group_id: 'G3', customer_phone: '01033334444', youtube_nickname: '딸기야', payment_method: '무통장입금', admin_order_status_v2: '미입금', product_name: '아미 니트', final_amount: 40000 });
row({ order_group_id: 'G4', customer_phone: '01055556666', youtube_nickname: '취소손님', payment_method: '무통장입금', admin_order_status_v2: '주문취소', product_name: '아미 니트', final_amount: 99000 });
row({ order_group_id: 'G5', customer_phone: '01077778888', youtube_nickname: '테스트', payment_method: '무통장입금', admin_order_status_v2: '입금확인', product_name: '아미 니트', final_amount: 77000, is_test_order: true });
// G6 무통장 입금확인 · 포인트 3,000 사용 · 이벤트 선물 줄(상품 수·입금가에서 뺌)
row({ order_group_id: 'G6', customer_phone: '01012121212', youtube_nickname: '몽실', payment_method: '무통장입금', admin_order_status_v2: '입금확인', product_name: '꼼데 쭈리바지', adjusted_product_price: 20000, final_amount: 17000, point_used_amount: 3000 });
row({ order_group_id: 'G6', customer_phone: '01012121212', youtube_nickname: '몽실', payment_method: '무통장입금', admin_order_status_v2: '입금확인', product_name: '이벤트 선물', final_amount: 0, event_gift_winner_id: 'w1' });
// 방송 시간 밖 주문
row({ order_group_id: 'G7', customer_phone: '01000000000', youtube_nickname: '밖', payment_method: '무통장입금', admin_order_status_v2: '입금확인', product_name: 'X', final_amount: 500000, created_at: T('16:00') });

const s = await computeLiveSummary('broadcast', { broadcastId: 'bc1' });
assert.equal(s.title, '남녀공용의류');
assert.equal(s.paidSum, 122000, '50,000+30,000+25,000+17,000 (미입금·취소·테스트·시간 밖 제외)');
assert.equal(s.paidCount, 3); assert.equal(s.bankPaidCount, 2); assert.equal(s.cardPaidCount, 1);
assert.equal(s.pointUsedSum, 3000, '포인트 사용 칸을 이제 읽음');
assert.equal(s.cardFeeSum, 1750, '카드 25,000 × 7%');
assert.equal(s.productCostSum, 30000); assert.equal(s.costedQty, 3); assert.equal(s.costMissingQty, 2);
assert.equal(s.unpaidBankCount, 1); assert.equal(s.unpaidBankSum, 40000);
assert.deepEqual(s.buyerTop.map((b) => [b.name, b.sum, b.count, b.qty]), [['행복나무', 105000, 2, 4], ['몽실', 17000, 1, 1]]);
assert.deepEqual(s.productAll.map((p) => [p.name, p.qty]), [['알로 기모 맨투맨', 3], ['폴로 맨투맨', 1], ['꼼데 쭈리바지', 1]]);

const text = formatReport(s);
assert.match(text, /^📊 <b>결산<\/b> · 남녀공용의류\n⏹ 2026\.11\.01\(일\) 20:04 ~ 23:58 · 3시간 54분\n/);
assert.match(text, /💰 매출 <b>122,000원<\/b> · 3건\n━/, '입금가 없는 상품이 있으면 순수익 숨김');
assert.doesNotMatch(text, /순수익/);
assert.match(text, /포인트 사용 3,000원 \(매출에서 이미 빠짐\)/);
assert.match(text, /⏳ 미결제 <b>40,000원<\/b> · 1건 \(무통장 1\)/);
// 입금가를 전부 넣은 날 → 순수익 표시
for (const r of db.orders) if (!r.event_gift_winner_id && r.cost_price_snapshot == null) r.cost_price_snapshot = 5000;
const sAll = await computeLiveSummary('broadcast', { broadcastId: 'bc1' });
assert.equal(sAll.costMissingQty, 0);
const tAll = formatReport(sAll);
assert.match(tAll, /💵 순수익 <b>/);
console.log('--- 입금가 다 넣은 날 ---\n' + tAll.split('\n').slice(0, 6).join('\n').replace(/<\/?b>/g, ''));
assert.match(text, /🥇 행복나무 <b>105,000원<\/b> \(2건 · 4개\)\n🥈 몽실/);
console.log('--- 시뮬레이션 결산 글 ---\n' + text.replace(/<\/?b>/g, ''));

// 날짜 넘어간 방송은 끝 시각에 날짜까지
const s0 = await computeLiveSummary('broadcast', { broadcastId: 'bc0' });
assert.match(formatReport(s0), /19:59 ~ 2026\.10\.31\(토\) 10:09 · 14시간 10분/);

// 주문 읽기 실패 → 빈 결산을 보내지 않고 오류
ordersError = 'boom';
await assert.rejects(() => computeLiveSummary('broadcast', { broadcastId: 'bc1' }), /주문을 못 읽었어요/);
ordersError = null;

// 줄 단위 규칙
assert.equal(rowCardFee({ actual_card_fee_amount: 999, final_amount: 10000 }, 7), 999, '저장된 수수료 우선');
assert.equal(rowCardFee({ actual_card_fee_rate_applied: 3, final_amount: 10000 }, 7), 300, '그 줄 적용률');
assert.equal(rowCostPrice({ cost_price_snapshot: 0 }), null); assert.equal(rowCostPrice({ cost_price_snapshot: '1500' }), 1500);
console.log('test-live-summary-report: ok');
