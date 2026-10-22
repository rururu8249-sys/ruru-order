// [2026-10-22] AI 비서 8단계 — 대화창 라우트(app/api/admin-live/assistant-chat)를 메모리 DB + 가짜 Gemini(도구 호출 대본)로 돌린 시나리오.
//   ①401 ②AI 가 find_customer 를 부르면 서버가 찾아 돌려주고(전화 없음) 최종 답 ③propose_issue 는 등록 안 하고 카드만(쓰기 0)
//   ④sales_stats 는 판매분석 집계표 ⑤AI 실패 시 안내 ⑥AI 로 간 모든 글자에 전화·주소 없음 ⑦propose_memo 카드 ⑧도구 5번 넘으면 멈춤
import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.GEMINI_API_KEY = 'fake-key';

const now = Date.now();
const iso = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString();
const db = {
  broadcasts: [{ id: 1018, public_title: '신발', started_at: iso(3), ended_at: iso(2.9), is_deleted: false }],
  broadcast_products: [{ broadcast_id: 1018, product_id: 677, sort_order: 1, products: { id: 677, product_name: '폴로 자켓', price: 39000, product_note: null } }],
  customers: [
    { id: 'c1', youtube_nickname: '홍길동-f2h', customer_name: '홍길동', kakao_nickname: '길동', customer_phone: '01011112222', kakao_id: 'k1', last_order_at: iso(2), previous_nicknames: null, is_blocked: 'N', created_at: iso(100), address: '서울시 강남구 테헤란로 1' },
    { id: 'c2', youtube_nickname: '홍길순', customer_name: '김순이', kakao_nickname: '', customer_phone: '01033334444', kakao_id: 'k2', last_order_at: iso(40), previous_nicknames: null, is_blocked: 'true', created_at: iso(90) },
  ],
  orders: [
    { id: 1, created_at: iso(10), youtube_nickname: '홍길동-f2h', customer_name: '홍길동', recipient_name: '홍길동', customer_phone: '01011112222', kakao_id: 'k1', order_group_id: 'G1', order_lookup_code: 'A1', broadcast_id: 1018, product_name: '폴로 자켓 네이비', color: '네이비', size: 'L', qty: 2, is_deleted: false, admin_order_status_v2: '자동입금확인', order_manage_status: '자동입금확인', payment_method: '무통장입금', product_price: 39000, adjusted_product_price: 78000, final_amount: 78000, total_price: 78000, shipping_fee: 0, address: '서울시 강남구 테헤란로 1' },
    { id: 2, created_at: iso(2), youtube_nickname: '홍길동-f2h', customer_name: '홍길동', recipient_name: '홍길동', customer_phone: '01011112222', kakao_id: null, order_group_id: 'G2', order_lookup_code: 'A2', broadcast_id: 1018, product_name: '니트 가디건', color: '없음', size: 'FREE', qty: 1, is_deleted: false, admin_order_status_v2: '입금대기', order_manage_status: '', payment_method: '무통장입금', product_price: 29000, adjusted_product_price: 29000, final_amount: 29000, total_price: 29000, shipping_fee: 0 },
  ],
  products: [{ id: 677, product_name: '폴로 자켓', color_options: ['네이비'], price: 39000, created_at: iso(12), status: '판매중', main_image_url: null, image_url: null, external_image_url: null }],
  admin_assistant_memos: [{ id: 'm1', kind: 'todo', body: '목요일 송장 출력', due_on: null, who: null, product: null, status: 'open', created_at: iso(1), updated_at: iso(1) }],
};
let writeCalls = 0;
function query(table) {
  const filters = []; let order = null; let range = null; let cols = '*'; let limit = null; let single = false;
  const api = {
    select(c) { cols = c; return api; },
    insert() { writeCalls++; return api; }, update() { writeCalls++; return api; }, delete() { writeCalls++; return api; }, upsert() { writeCalls++; return api; },
    neq(c, v) { filters.push((r) => r[c] !== v); return api; },
    eq(c, v) { filters.push((r) => String(r[c]) === String(v)); return api; },
    gte(c, v) { filters.push((r) => String(r[c] ?? '') >= String(v)); return api; },
    lt(c, v) { filters.push((r) => String(r[c] ?? '') < String(v)); return api; },
    in(c, vs) { const s = new Set(vs.map(String)); filters.push((r) => s.has(String(r[c]))); return api; },
    or() { return api; },
    order(c, o) { order = { c, asc: o?.ascending !== false }; return api; },
    range(a, b) { range = [a, b]; return api; },
    limit(n) { limit = n; return api; },
    maybeSingle() { single = true; return api; },
    then(res, rej) {
      return Promise.resolve().then(() => {
        let hit = (db[table] || []).filter((r) => filters.every((f) => f(r)));
        if (order) hit = [...hit].sort((a, b) => (String(a[order.c]) < String(b[order.c]) ? -1 : String(a[order.c]) > String(b[order.c]) ? 1 : 0) * (order.asc ? 1 : -1));
        if (range) hit = hit.slice(range[0], range[1] + 1);
        if (limit != null) hit = hit.slice(0, limit);
        if (cols !== '*' && !cols.includes('(')) { const keep = cols.split(',').map((s) => s.trim()); hit = hit.map((r) => Object.fromEntries(keep.map((k) => [k, r[k] ?? null]))); }
        const data = JSON.parse(JSON.stringify(single ? (hit[0] ?? null) : hit));
        return { data, error: null };
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
const route = load('app/api/admin-live/assistant-chat/route.ts');
const call = (body) => route.POST({ json: async () => body });
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('PASS', name); };

// 가짜 Gemini: 대본(script)대로 차례로 답. 각 항목 = parts 배열 또는 'fail'
let script = [];
let sentBodies = [];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  sentBodies.push(JSON.stringify(body));
  const step = script.shift();
  if (step === 'fail' || step === undefined) return { ok: false, status: 503, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: step } }] }) };
};
const run = async (steps, body) => { script = [...steps]; sentBodies = []; writeCalls = 0; return call(body); };
const allSent = () => sentBodies.join('\n');
const lastToolResponse = () => { const b = JSON.parse(sentBodies.at(-1)); const parts = b.contents.at(-1).parts; return parts.map((p) => p.functionResponse?.response).filter(Boolean); };

await t('로그인 안 하면 401', async () => {
  authed = false;
  assert.equal((await call({ messages: [{ role: 'user', text: '안녕' }] })).status, 401);
  authed = true;
});

await t('빈 말은 400', async () => {
  assert.equal((await call({ messages: [{ role: 'user', text: '  ' }] })).status, 400);
});

await t('AI 가 find_customer → 서버가 찾아 줌(전화 없음) → 최종 답 + 손님 카드(가린 전화)', async () => {
  const r = await run([
    [{ functionCall: { name: 'find_customer', args: { query: '홍길동' } } }],
    [{ text: '홍길동-f2h 님은 최근 주문 2건이고 A2 는 아직 미입금이에요.' }],
  ], { messages: [{ role: 'user', text: '홍길동 입금했어?' }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.answer, /홍길동/);
  assert.deepEqual(r.body.tools, ['find_customer']);
  const card = r.body.cards.find((c) => c.kind === 'customers');
  assert.equal(card.people[0].nickname, '홍길동-f2h');
  assert.equal(card.people[0].phone, '010-****-2222'); // 화면 카드엔 가린 번호
  const resp = lastToolResponse()[0];
  assert.equal(resp.people[0].name, '홍길동'); // 이름은 AI 에 감(사장님 결정)
  assert.equal(JSON.stringify(resp).includes('phone'), false);
  assert.equal(allSent().includes('1111'), false); // 전화 숫자 없음
  assert.equal(allSent().includes('테헤란로'), false); // 주소 없음
  assert.equal(writeCalls, 0);
  // 시스템 지시문이 갔는지
  assert.match(JSON.parse(sentBodies[0]).systemInstruction.parts[0].text, /루루동이/);
});

await t('propose_issue 는 등록 안 하고 카드만(쓰기 0)', async () => {
  const r = await run([
    [{ functionCall: { name: 'find_customer', args: { query: '홍길동' } } }],
    [{ functionCall: { name: 'propose_issue', args: { issueType: '교환', nickname: '홍길동-f2h', name: '홍길동', orderNo: 'A2', memo: '니트 사이즈 교환 원함' } } }],
    [{ text: '아래 카드에서 확인하고 눌러 주세요.' }],
  ], { messages: [{ role: 'user', text: '홍길동 니트 사이즈 교환 원한대 등록해줘' }] });
  const card = r.body.cards.find((c) => c.kind === 'issue');
  assert.deepEqual(card, { kind: 'issue', issueType: 'exchange', nickname: '홍길동-f2h', name: '홍길동', orderNo: 'A2', memo: '니트 사이즈 교환 원함' });
  assert.equal(writeCalls, 0);
  assert.equal(db.admin_assistant_memos.length, 1);
});

await t('sales_stats = 판매분석 집계표(결제완료만·닉네임(이름))', async () => {
  const r = await run([
    [{ functionCall: { name: 'sales_stats', args: { period: 'last_3_months' } } }],
    [{ text: '최근 3개월 결제금액은 78,000원이에요.' }],
  ], { messages: [{ role: 'user', text: '요즘 매출 어때' }], range: '3m' });
  const resp = lastToolResponse()[0];
  assert.match(resp.table, /결제금액 78,000원/); // A2 미입금은 제외
  assert.match(resp.table, /미결제 1건/);
  assert.match(resp.table, /홍길동-f2h\(홍길동\)/);
  assert.match(resp.table, /신발/); // 방송 제목
  assert.equal(resp.table.includes('1111'), false);
  assert.match(r.body.answer, /78,000/);
});

await t('propose_memo 카드 + list_memos', async () => {
  const r = await run([
    [{ functionCall: { name: 'list_memos', args: {} } }, { functionCall: { name: 'propose_memo', args: { text: '금요일 반품 택배 보내기' } } }],
    [{ text: '메모 1개가 있고, 새 메모는 아래 카드에서 저장해 주세요.' }],
  ], { messages: [{ role: 'user', text: '금요일 반품 택배 보내야 해 적어줘. 지금 메모 뭐 있어?' }] });
  assert.deepEqual(r.body.tools, ['list_memos', 'propose_memo']);
  assert.deepEqual(r.body.cards, [{ kind: 'memo', text: '금요일 반품 택배 보내기' }]);
  assert.equal(lastToolResponse()[0].memos[0].text, '목요일 송장 출력');
  assert.equal(writeCalls, 0);
});

await t('broadcast_products + propose_seo', async () => {
  const r = await run([
    [{ functionCall: { name: 'broadcast_products', args: {} } }],
    [{ functionCall: { name: 'propose_seo', args: { broadcastId: '1018', titles: ['폴로 자켓 3만원대 라방'], description: '첫 줄 요약', tags: ['#폴로', '라이브커머스'] } } }],
    [{ text: '아래 카드에서 복사하세요.' }],
  ], { messages: [{ role: 'user', text: '지난 방송 유튜브 제목 뽑아줘' }] });
  const seo = r.body.cards.find((c) => c.kind === 'seo');
  assert.deepEqual(seo.tags, ['폴로', '라이브커머스']);
  assert.equal(seo.titles[0], '폴로 자켓 3만원대 라방');
});

await t('AI 실패하면 안내만(failed)', async () => {
  const r = await run(['fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail'], { messages: [{ role: 'user', text: '안녕' }] });
  assert.equal(r.body.failed, true);
  assert.match(r.body.answer, /다시/);
});

await t('도구만 계속 부르면 5번에서 멈춤', async () => {
  const loop = Array.from({ length: 8 }, () => [{ functionCall: { name: 'list_memos', args: {} } }]);
  const r = await run(loop, { messages: [{ role: 'user', text: '메모' }] });
  assert.equal(r.body.tools.length, 5);
});

console.log(`ALL PASS assistant chat route (${n})`);
