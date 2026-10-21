// [2026-10-22] AI 비서 1단계 — 실제 라우트(app/api/admin-live/assistant)를 메모리 DB로 돌린 시나리오 검사.
//   ①AI 키 없음 → 규칙 해석으로도 찾음 ②AI 응답 해석 ③AI 로 보내는 글자에 손님 정보 없음
//   ④대충 닉네임 → 비슷한 손님·최근 주문 상태 ⑤상품 → 상품 + 산 손님 ⑥읽기만(쓰기 호출 0) ⑦로그인 안 하면 401
import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const now = Date.now();
const iso = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString();
const db = {
  broadcasts: [{ id: 1018, public_title: '신발', started_at: iso(3) }],
  customers: [
    { id: 'c1', youtube_nickname: '홍길동-f2h', customer_name: '홍길동', kakao_nickname: '길동', customer_phone: '01011112222', kakao_id: 'k1', last_order_at: iso(2), previous_nicknames: null, is_blocked: 'N', created_at: iso(100) },
    { id: 'c2', youtube_nickname: '홍길순', customer_name: '김순이', kakao_nickname: '', customer_phone: '01033334444', kakao_id: 'k2', last_order_at: iso(40), previous_nicknames: '["옛닉"]', is_blocked: 'true', created_at: iso(90) },
    { id: 'c3', youtube_nickname: '행복나무3899', customer_name: '박행복', kakao_nickname: '', customer_phone: '01055556666', kakao_id: 'k3', last_order_at: iso(1), previous_nicknames: null, is_blocked: false, created_at: iso(80) },
  ],
  orders: [
    { id: 1, created_at: iso(10), youtube_nickname: '홍길동-f2h', customer_name: '홍길동', recipient_name: '홍길동', customer_phone: '01011112222', kakao_id: 'k1', order_group_id: 'G1', order_lookup_code: 'A1', product_name: '폴로 자켓 네이비', color: '네이비', size: 'L', qty: 2, is_deleted: false, admin_order_status_v2: '자동입금확인', payment_method: '무통장입금', product_price: 39000, final_amount: 78000 },
    { id: 2, created_at: iso(2), youtube_nickname: '홍길동-f2h', customer_name: '홍길동', recipient_name: '홍길동', customer_phone: '01011112222', kakao_id: null, order_group_id: 'G2', order_lookup_code: 'A2', product_name: '니트 가디건', color: '없음', size: 'FREE', qty: 1, is_deleted: false, admin_order_status_v2: '입금대기', payment_method: '무통장입금', product_price: 29000, final_amount: 29000 },
    { id: 3, created_at: iso(5), youtube_nickname: '행복나무3899', customer_name: '박행복', recipient_name: '박행복', customer_phone: '01055556666', kakao_id: 'k3', order_group_id: 'G3', order_lookup_code: 'A3', product_name: '폴로 자켓 베이지', color: '베이지', size: 'M', qty: 1, is_deleted: false, admin_order_status_v2: '출고완료', shipped_prev_status: '수동입금확인', payment_method: '무통장입금', product_price: 39000, final_amount: 39000 },
    { id: 4, created_at: iso(3), youtube_nickname: '지운손님', customer_name: '삭제', recipient_name: '', customer_phone: '01099990000', kakao_id: 'k9', order_group_id: 'G4', order_lookup_code: 'A4', product_name: '폴로 자켓 네이비', color: '', size: '', qty: 5, is_deleted: true },
    { id: 5, created_at: iso(200), youtube_nickname: '홍길동-f2h', customer_name: '홍길동', recipient_name: '', customer_phone: '01011112222', kakao_id: 'k1', order_group_id: 'G5', order_lookup_code: 'A5', product_name: '옛날 상품', color: '', size: '', qty: 1, is_deleted: false, admin_order_status_v2: '주문서취소', payment_method: '무통장입금', product_price: 10000, final_amount: 10000 },
  ],
  products: [
    { id: 677, product_name: '폴로 자켓', color_options: ['네이비', '베이지'], price: 39000, created_at: iso(12), status: '판매중', main_image_url: 'https://x/a.jpg', image_url: null, external_image_url: null },
    { id: 678, product_name: '프라다 나일론백', color_options: '["PD-202 블랙","PD-206 브라운"]', price: 259000, created_at: iso(30), status: '숨김', main_image_url: null, image_url: null, external_image_url: null },
  ],
};
let writeCalls = 0;
function query(table) {
  const filters = []; let order = null; let range = null; let cols = '*';
  const api = {
    select(c) { cols = c; return api; },
    insert() { writeCalls++; return api; }, update() { writeCalls++; return api; }, delete() { writeCalls++; return api; }, upsert() { writeCalls++; return api; },
    neq(c, v) { filters.push((r) => r[c] !== v); return api; },
    eq(c, v) { filters.push((r) => r[c] === v); return api; },
    gte(c, v) { filters.push((r) => String(r[c] ?? '') >= String(v)); return api; },
    in(c, vs) { const s = new Set(vs.map(String)); filters.push((r) => s.has(String(r[c]))); return api; },
    order(c, o) { order = { c, asc: o?.ascending !== false }; return api; },
    range(a, b) { range = [a, b]; return api; },
    then(res, rej) {
      return Promise.resolve().then(() => {
        let hit = db[table].filter((r) => filters.every((f) => f(r)));
        if (order) hit = [...hit].sort((a, b) => (String(a[order.c]) < String(b[order.c]) ? -1 : String(a[order.c]) > String(b[order.c]) ? 1 : 0) * (order.asc ? 1 : -1));
        if (order?.c === 'id') hit = [...hit].sort((a, b) => (a.id - b.id) * (order.asc ? 1 : -1));
        if (range) hit = hit.slice(range[0], range[1] + 1);
        if (cols !== '*') { const keep = cols.split(',').map((s) => s.trim()); hit = hit.map((r) => Object.fromEntries(keep.map((k) => [k, r[k] ?? null]))); }
        return { data: JSON.parse(JSON.stringify(hit)), error: null };
      }).then(res, rej);
    },
  };
  return api;
}
const fakeClient = { from: query, rpc: async () => { writeCalls++; return { data: null, error: null }; } };

let authed = true;
const load = createUiLoader({
  '@supabase/supabase-js': { createClient: () => fakeClient },
  'next/server': { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } },
  '@/lib/admin-auth': { verifyAdminSessionFromRequest: async () => (authed ? { ok: true } : null) },
});
const route = load('app/api/admin-live/assistant/route.ts');
const call = (body) => route.POST({ json: async () => body });

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('PASS', name); };

// fetch 가로채기(Gemini)
const sentToAi = [];
let aiReply = null;
let aiReplyFn = null; // [AI-7] 호출마다 다른 답(프롬프트 보고 결정)
globalThis.fetch = async (url, init) => {
  sentToAi.push(JSON.parse(init.body).contents[0].parts[0].text);
  const reply = aiReplyFn ? aiReplyFn(JSON.parse(init.body).contents[0].parts[0].text) : aiReply;
  if (reply === 'fail') return { ok: false, status: 500, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: reply }] } }] }) };
};

await t('로그인 안 하면 401', async () => {
  authed = false;
  const r = await call({ text: '홍길' });
  assert.equal(r.status, 401);
  authed = true;
});

await t('키 없음 → 규칙 해석: 「홍길 주문한 사람」 → 홍길동-f2h·홍길순(최근 3개월)', async () => {
  delete process.env.GEMINI_API_KEY;
  const r = await call({ text: '홍길 주문한 사람 찾아줘' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.via, 'rule');
  assert.equal(r.body.kind, 'customer');
  const names = r.body.people.map((p) => p.nickname);
  assert.deepEqual(names, ['홍길동-f2h', '홍길순']); // 둘 다 일부 일치 → 마지막 주문 최근 순
  const hong = r.body.people[0];
  assert.equal(hong.phone, '010-****-2222');
  assert.equal(hong.orderCount, 2); // 200일 전 주문은 3개월 밖
  assert.deepEqual(hong.orders.map((o) => [o.orderNo, o.paymentLabel]), [['A2', '매칭필요'], ['A1', '자동입금확인']]); // 「입금대기」 = 주문표와 같은 판정(매칭필요)
  assert.equal(hong.blocked, false); // is_blocked 「N」 은 차단 아님
  assert.equal(r.body.people[1].blocked, true); // 「true」 글자
  assert.equal(r.body.people.length, 2); // 카카오 id 없는 주문(전화번호만)도 같은 사람으로 묶임
  assert.equal(sentToAi.length, 0); // 키 없으면 AI 호출 없음
});

await t('전체 기간이면 옛 주문(주문서취소)도', async () => {
  const r = await call({ text: '홍길동', range: 'all', mode: 'customer' });
  assert.equal(r.body.via, 'chip');
  const hong = r.body.people[0];
  assert.equal(hong.matchKind, 'exact');
  assert.equal(hong.orderCount, 3);
  assert.equal(hong.orders.at(-1).paymentLabel, '주문서취소');
});

await t('오타·초성도 찾음', async () => {
  assert.equal((await call({ text: '행봉나무', mode: 'customer' })).body.people[0].nickname, '행복나무3899');
  assert.equal((await call({ text: 'ㅎㄱㄷ', mode: 'customer' })).body.people[0].nickname, '홍길동-f2h');
  assert.equal((await call({ text: '옛닉', mode: 'customer' })).body.people[0].matchedLabel, '예전 닉네임');
});

await t('AI 해석 사용 + AI 에는 사장님 글자만 감', async () => {
  process.env.GEMINI_API_KEY = 'test';
  aiReply = '{"intent":"product","name":"","product":"폴로자켓"}';
  sentToAi.length = 0;
  const r = await call({ text: '폴로자켓 누가 샀어?' });
  assert.equal(r.body.via, 'ai');
  assert.equal(r.body.kind, 'product');
  assert.equal(sentToAi.length, 1);
  const sent = sentToAi[0];
  for (const secret of ['01011112222', '홍길동', '박행복', '행복나무']) assert.ok(!sent.includes(secret), `AI 로 손님 정보가 감: ${secret}`);
  assert.ok(sent.includes('폴로자켓 누가 샀어?'));
  assert.deepEqual(r.body.products.map((p) => p.id), [677]);
  // 산 손님: 지운 주문(is_deleted) 제외, 출고완료 → 택배출고 · 입금은 직전 상태
  assert.equal(r.body.buyerOrderCount, 2);
  assert.equal(r.body.buyerQty, 3);
  const b = r.body.buyers.find((x) => x.nickname === '행복나무3899');
  assert.deepEqual([b.option, b.shippingLabel, b.paymentLabel], ['베이지 / M', '택배출고', '수동입금확인']);
});

await t('AI 실패 → 규칙으로 이어서 찾음', async () => {
  aiReply = 'fail';
  const r = await call({ text: '프라다 상품' });
  assert.equal(r.body.via, 'rule');
  assert.equal(r.body.products[0].id, 678);
  assert.equal(r.body.products[0].hidden, true);
  // 개별 상품 이름(color_options)으로도
  const r2 = await call({ text: 'PD-206', mode: 'product' });
  assert.equal(r2.body.products[0].detail, 'PD-206 브라운');
});

await t('숫자 질문(AI 해석) → 판매분석과 같은 계산', async () => {
  aiReply = '{"intent":"stats","name":"","product":"","stat":"top_buyers","period":"all","date":""}';
  sentToAi.length = 0;
  const r = await call({ text: '지금까지 누가 제일 많이 샀어?' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.kind, 'stats');
  assert.equal(r.body.via, 'ai');
  assert.ok(sentToAi[0].includes('오늘 날짜(한국)'));
  // 결제완료: A1(78,000)·A3(39,000) / A2 매칭필요·A5 취소·A4 삭제 제외
  assert.equal(r.body.orderCount, 2);
  assert.deepEqual(r.body.topBuyers.map((b) => b.nickname), ['홍길동-f2h', '행복나무3899']);
  assert.equal(r.body.unpaidCount, 1);
  assert.ok(r.body.topBuyers.every((b) => !JSON.stringify(b).includes('010')));
  // AI 없이도: 규칙 해석
  aiReply = 'fail';
  const r2 = await call({ text: '전체 뭐 잘 나갔어?' });
  assert.equal(r2.body.kind, 'stats');
  assert.equal(r2.body.topProducts[0].name, '폴로 자켓 네이비');
});

await t('[AI-7] 자유 질문 — 집계표(닉네임만·전화 0)를 AI 에 주고 말 답, 숫자 질문엔 카드와 함께', async () => {
  sentToAi.length = 0;
  aiReplyFn = (prompt) => prompt.includes('[자료]') ? '{"answer":"제일 많이 판 날은 10.22(목)이에요."}' : '{"intent":"unknown","name":"","product":""}';
  const r = await call({ text: '이 기간에 제일 장사 잘 된 날이 언제야?', range: 'last_3_months' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.kind, 'chat');
  assert.ok(r.body.answer.includes('10.22'));
  const packPrompt = sentToAi.find((p) => p.includes('[자료]'));
  assert.ok(packPrompt.includes('[날짜별'));
  assert.ok(packPrompt.includes('홍길동-f2h'), '닉네임은 감');
  assert.ok(!packPrompt.includes('010'), '전화번호 0');
  assert.ok(!packPrompt.includes('서울'), '주소 0');
  // 숫자 질문(stats)이면 카드 + answer 둘 다
  aiReplyFn = (prompt) => prompt.includes('[자료]') ? '{"answer":"전체 2건이에요."}' : '{"intent":"stats","name":"","product":"","stat":"summary","period":"all","date":""}';
  const r2 = await call({ text: '지금까지 매출 얼마야' });
  assert.equal(r2.body.kind, 'stats');
  assert.equal(r2.body.orderCount, 2);
  assert.equal(r2.body.answer, '전체 2건이에요.');
  aiReplyFn = null;
});

await t('읽기만 — 쓰기 호출 0', async () => {
  assert.equal(writeCalls, 0);
});

console.log(`ALL PASS assistant route (${n})`);
