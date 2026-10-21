// [2026-10-21] 여러 주문 합친 입금 — 수동 입금확인 시뮬레이션(실제 라우트 3개 + 메모리 DB)
//   ① 주문서 3개(1만·2만·2만) + 입금 1건 5만 → 함께 입금확인, 입금 메모에 [groups:…]
//   ② 금액이 다르면 거절 · 이미 입금확인/카드 주문 섞이면 거절
//   ③ 주문 1개(기존 흐름)는 예전과 똑같이(메모 그대로)
//   ④ 돈 계산기(order-balance)는 묶인 주문 어느 것에서도 «더 냈어요» 안 띄움(차액 계산 끔)
//   ⑤ 두 번째 주문에서 입금확인 취소 → 묶인 3개 주문 + 입금 전부 함께 되돌아감
import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';

function makeDb(seed) {
  const tables = JSON.parse(JSON.stringify(seed));
  const writes = [];
  const db = {
    tables, writes,
    from(table) {
      let action = 'select', payload = null; const filters = []; let range = null;
      const q = {
        select() { return q; },
        eq(k, v) { filters.push(r => String(r[k] ?? '') === String(v)); return q; },
        neq(k, v) { filters.push(r => r[k] !== v); return q; },
        in(k, arr) { const set = new Set(arr.map(String)); filters.push(r => set.has(String(r[k]))); return q; },
        ilike(k, pat) { const re = new RegExp('^' + pat.replace(/[.*+?^${}()|[\]\\]/g, m => m === '%' ? m : '\\' + m).replace(/%/g, '.*') + '$', 'i'); filters.push(r => re.test(String(r[k] ?? ''))); return q; },
        like(k, pat) { return q.ilike(k, pat); },
        order() { return q; }, limit() { return q; },
        range(a, b) { range = [a, b]; return q; },
        update(p) { action = 'update'; payload = p; return q; },
        maybeSingle() { return exec().then(r => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data })); },
        then(res, rej) { return exec().then(res, rej); },
      };
      async function exec() {
        const rows = (tables[table] ||= []);
        let hit = rows.filter(r => filters.every(f => f(r)));
        if (action === 'update') { hit.forEach(r => Object.assign(r, payload)); writes.push({ table, payload, ids: hit.map(r => r.id) }); return { data: hit.map(r => ({ ...r })), error: null }; }
        if (range) hit = hit.slice(range[0], range[1] + 1);
        return { data: hit.map(r => ({ ...r })), error: null };
      }
      return q;
    },
  };
  return db;
}

const order = (id, group, amount, extra = {}) => ({ id, order_group_id: group, final_amount: amount, total_price: amount, customer_phone: '01011112222', youtube_nickname: '손님', admin_order_status_v2: '주문확인전', order_manage_status: '주문확인전', payment_method: '무통장입금', is_deleted: false, deposit_confirmed_at: null, customer_id: 'c1', ...extra });
const seed = () => ({
  orders: [order(1, 'G1', 10000), order(2, 'G2', 20000), order(3, 'G3', 20000), order(9, 'G9', 7000)],
  deposits: [
    { id: 100, depositor_name: '손님', amount: 50000, match_status: '미확인' },
    { id: 101, depositor_name: '단골', amount: 7000, match_status: '미확인' },
    { id: 102, depositor_name: '손님', amount: 49000, match_status: '미확인' },
  ],
  customer_point_ledger: [],
});

function loadRoutes(db) {
  const load = createUiLoader({ '@supabase/supabase-js': { createClient: () => db }, '@/lib/admin-auth': { verifyAdminSessionFromRequest: async () => ({}) } });
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  return {
    match: load('app/api/admin-v2/manual-payment-match/route.ts').POST,
    balance: load('app/api/admin-live/order-balance/route.ts').GET,
    cancel: load('app/api/admin-v2/payment-confirm-cancel/route.ts').POST,
  };
}
const post = async (fn, body) => { const r = await fn(new Request('https://fixture.invalid', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };
const get = async (fn, groupId) => { const url = new URL('https://fixture.invalid/x?groupId=' + groupId); const req = new Request(url); req.nextUrl = url; const r = await fn(req); return r.json(); };

let failures = 0;
async function test(name, fn) { try { await fn(); console.log('PASS', name); } catch (e) { failures++; console.error('FAIL', name, '\n ', e.message); } }

await test('① 주문서 3개(1만·2만·2만) + 입금 5만 1건 → 3개 모두 수동입금확인, 입금 메모에 묶음 표시', async () => {
  const db = makeDb(seed()); const { match } = loadRoutes(db);
  const r = await post(match, { orderGroupId: 'G1', orderIds: [1, 2, 3], depositIds: [100], clientSelectedTotalAmount: 50000 });
  assert.equal(r.body.ok, true, r.body.message);
  for (const id of [1, 2, 3]) assert.equal(db.tables.orders.find(o => o.id === id).admin_order_status_v2, '수동입금확인');
  const dep = db.tables.deposits.find(d => d.id === 100);
  assert.equal(dep.match_status, '수동입금확인');
  assert.match(dep.confirmed_note, /여러 주문 합친 입금/);
  assert.match(dep.confirmed_note, /\[groups:G1,G2,G3\]/);
  assert.equal(db.tables.orders.find(o => o.id === 9).admin_order_status_v2, '주문확인전', '다른 손님 주문은 그대로');
});

await test('② 금액 다르면(4만9천 vs 5만) 거절 — DB 변경 0', async () => {
  const db = makeDb(seed()); const { match } = loadRoutes(db);
  const r = await post(match, { orderGroupId: 'G1', orderIds: [1, 2, 3], depositIds: [102] });
  assert.equal(r.status, 409); assert.equal(r.body.ok, false);
  assert.equal(db.writes.length, 0);
});

await test('② 이미 입금확인된 주문이 섞이면 거절 — DB 변경 0', async () => {
  const s = seed(); s.orders[1].admin_order_status_v2 = '자동입금확인'; s.orders[1].deposit_confirmed_at = '2026-10-20';
  const db = makeDb(s); const { match } = loadRoutes(db);
  const r = await post(match, { orderGroupId: 'G1', orderIds: [1, 2, 3], depositIds: [100] });
  assert.equal(r.status, 409); assert.equal(db.writes.length, 0);
});

await test('② 카드 주문이 섞이면 거절', async () => {
  const s = seed(); s.orders[2].payment_method = '카드결제';
  const db = makeDb(s); const { match } = loadRoutes(db);
  const r = await post(match, { orderGroupId: 'G1', orderIds: [1, 2, 3], depositIds: [100] });
  assert.equal(r.status, 409); assert.equal(db.writes.length, 0);
});

await test('③ 주문 1개 + 입금 1건(기존 흐름)은 예전 메모 그대로', async () => {
  const db = makeDb(seed()); const { match } = loadRoutes(db);
  const r = await post(match, { orderGroupId: 'G9', orderIds: [9], depositIds: [101] });
  assert.equal(r.body.ok, true);
  const dep = db.tables.deposits.find(d => d.id === 101);
  assert.equal(dep.confirmed_note, '관리자 수동매칭');
  assert.equal(dep.match_order_group_id, 'G9');
});

await test('④ 돈 계산기: 묶인 주문 3개 어디서 봐도 차액 계산 끔(포인트 돌려주기 안 뜸)', async () => {
  const db = makeDb(seed()); const { match, balance } = loadRoutes(db);
  await post(match, { orderGroupId: 'G1', orderIds: [1, 2, 3], depositIds: [100] });
  for (const g of ['G1', 'G2', 'G3']) {
    const b = await get(balance, g);
    assert.equal(b.ok, true);
    assert.equal(b.depositCount, 0, g + ' 계산기 꺼짐');
    assert.equal(b.multiOrder.depositSum, 50000);
    assert.equal(b.multiOrder.orderCount, 3);
  }
  const single = await get(balance, 'G9');
  assert.equal(single.multiOrder, undefined, '묶이지 않은 주문은 기존 계산기 그대로');
});

await test('⑤ 두 번째 주문(G2)에서 입금확인 취소 → 묶인 3개 주문 + 입금 함께 되돌아감', async () => {
  const db = makeDb(seed()); const { match, cancel } = loadRoutes(db);
  await post(match, { orderGroupId: 'G1', orderIds: [1, 2, 3], depositIds: [100] });
  const dry = await post(cancel, { orderGroupId: 'G2', dryRun: true });
  assert.equal(dry.body.orderCount, 3, '미리보기에도 3개');
  assert.equal(dry.body.linkedDepositCount, 1);
  const r = await post(cancel, { orderGroupId: 'G2' });
  assert.equal(r.body.ok, true, r.body.message);
  for (const id of [1, 2, 3]) { const o = db.tables.orders.find(x => x.id === id); assert.equal(o.admin_order_status_v2, '주문확인전'); assert.equal(o.deposit_confirmed_at, null); }
  const dep = db.tables.deposits.find(d => d.id === 100);
  assert.equal(dep.match_status, '미확인'); assert.equal(dep.confirmed_note, null);
});

await test('⑤ 묶음 없는 기존 주문 취소는 그 주문·입금만', async () => {
  const db = makeDb(seed()); const { match, cancel } = loadRoutes(db);
  await post(match, { orderGroupId: 'G9', orderIds: [9], depositIds: [101] });
  await post(match, { orderGroupId: 'G1', orderIds: [1, 2, 3], depositIds: [100] });
  const r = await post(cancel, { orderGroupId: 'G9' });
  assert.equal(r.body.orderCount, 1);
  assert.equal(db.tables.orders.find(o => o.id === 1).admin_order_status_v2, '수동입금확인', '다른 묶음은 그대로');
  assert.equal(db.tables.deposits.find(d => d.id === 100).match_status, '수동입금확인');
});

if (failures) { console.error(failures + ' FAILED'); process.exit(1); }
console.log('ALL PASS multi-order deposit simulation');
