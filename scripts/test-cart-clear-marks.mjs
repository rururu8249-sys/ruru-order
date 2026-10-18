// [㉛ 2026-10-17] 장바구니 비움 기록 — 실제 라우트 코드(동기화·관리자 비우기·만료 정리 cron)를 메모리 DB로 돌린 시나리오 검사.
//   claim_cart_hold 는 SQL 과 같은 규칙의 대역(세션 줄 삭제 후 재삽입, 처음 담은 시각 보존, 처음+유지시간 지나면 expired).
//   주문 제출은 submit 라우트가 성공 뒤 넣는 비움 기록(reason=submitted)과 같은 줄을 넣어 확인한다.
import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

// ── 메모리 DB ──────────────────────────────────────────────
const db = { cart_reservations: [], settings: [], cart_clear_marks: [], products: [], cart_bank_account_overrides: [] };
let marksTableMissing = false;
let idSeq = 1, markSeq = 0;
const clone = (v) => JSON.parse(JSON.stringify(v));

function parseOr(expr) {
  return expr.split(',').map((part) => {
    const m = part.match(/^([a-z_]+)\.eq\.(.*)$/);
    return { col: m[1], val: m[2].replace(/^"|"$/g, '') };
  });
}
function query(table) {
  const filters = [];
  let op = 'select', payload = null, order = null, limit = null, wantRows = false, single = false;
  const api = {
    select() { if (op !== 'select') wantRows = true; return api; },
    insert(rows) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return api; },
    update(v) { op = 'update'; payload = v; return api; },
    delete() { op = 'delete'; return api; },
    eq(c, v) { filters.push((r) => String(r[c] ?? '') === String(v ?? '')); return api; },
    in(c, vs) { const set = new Set(vs.map(String)); filters.push((r) => set.has(String(r[c] ?? ''))); return api; },
    gt(c, v) { filters.push((r) => String(r[c] ?? '') > String(v)); return api; },
    gte(c, v) { filters.push((r) => String(r[c] ?? '') >= String(v)); return api; },
    lte(c, v) { filters.push((r) => String(r[c] ?? '') <= String(v)); return api; },
    is(c, v) { filters.push((r) => (r[c] ?? null) === v); return api; },
    like(c, v) { const re = new RegExp('^' + v.replace(/%/g, '.*') + '$'); filters.push((r) => re.test(String(r[c] ?? ''))); return api; },
    or(expr) { const parts = parseOr(expr); filters.push((r) => parts.some((p) => String(r[p.col] ?? '') === p.val)); return api; },
    order(c, o) { order = { c, asc: o?.ascending !== false }; return api; },
    limit(n) { limit = n; return api; },
    maybeSingle() { single = true; return api; },
    then(res, rej) { return Promise.resolve().then(run).then(res, rej); },
  };
  function run() {
    if (table === 'cart_clear_marks' && marksTableMissing) return { data: null, error: { message: 'relation does not exist' } };
    const rows = db[table];
    if (op === 'insert') {
      const added = payload.map((r) => {
        const row = { ...r };
        if (table === 'cart_clear_marks') { row.seq = ++markSeq; row.created_at = new Date().toISOString(); }
        else row.id = row.id ?? idSeq++;
        rows.push(row);
        return row;
      });
      return { data: clone(added), error: null };
    }
    let hit = rows.filter((r) => filters.every((f) => f(r)));
    if (op === 'delete') { db[table] = rows.filter((r) => !hit.includes(r)); return { data: wantRows ? clone(hit) : null, error: null }; }
    if (op === 'update') { hit.forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
    if (order) hit = [...hit].sort((a, b) => (String(a[order.c]) < String(b[order.c]) ? -1 : String(a[order.c]) > String(b[order.c]) ? 1 : 0) * (order.asc ? 1 : -1));
    if (order?.c === 'seq') hit = [...hit].sort((a, b) => (a.seq - b.seq) * (order.asc ? 1 : -1));
    if (limit != null) hit = hit.slice(0, limit);
    return { data: single ? (clone(hit[0]) ?? null) : clone(hit), error: null };
  }
  return api;
}
const norm = (v) => { const t = String(v ?? '').trim(); return t === '없음' ? '' : t; };
// claim_cart_hold 대역 — supabase/migrations/20260928_claim_cart_hold_absolute_expiry.sql 와 같은 규칙(재고 검증은 생략)
function claimCartHold({ p_session_key, p_phone, p_items, p_hold_minutes }) {
  const now = Date.now();
  const first = {};
  for (const r of db.cart_reservations.filter((r) => r.session_key === p_session_key)) {
    const k = `${r.product_id}|${norm(r.color)}|${norm(r.size)}`;
    first[k] = Math.min(first[k] ?? Infinity, Date.parse(r.created_at));
  }
  db.cart_reservations = db.cart_reservations.filter((r) => r.session_key !== p_session_key);
  const results = [];
  let allOk = true;
  for (const it of p_items || []) {
    const qty = Number(it.qty) || 0;
    if (!it.productId || qty <= 0) continue;
    const k = `${it.productId}|${norm(it.color)}|${norm(it.size)}`;
    const f = first[k] ?? now;
    const expires = f + p_hold_minutes * 60_000;
    if (expires <= now) { allOk = false; results.push({ productId: it.productId, color: norm(it.color), size: norm(it.size), ok: false, expired: true, available: 0 }); continue; }
    db.cart_reservations.push({ id: idSeq++, session_key: p_session_key, customer_phone: p_phone, kakao_id: null, product_id: String(it.productId), color: norm(it.color), size: norm(it.size), qty, created_at: new Date(f).toISOString(), expires_at: new Date(expires).toISOString() });
    results.push({ productId: it.productId, color: norm(it.color), size: norm(it.size), ok: true });
  }
  return { ok: true, allOk, holdMinutes: p_hold_minutes, results };
}
const fakeClient = { from: query, rpc: async (name, params) => (name === 'claim_cart_hold' ? { data: claimCartHold(params), error: null } : { data: null, error: { message: 'unknown rpc ' + name } }) };

const nextServer = { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } };
const load = createUiLoader({
  '@supabase/supabase-js': { createClient: () => fakeClient },
  'next/server': nextServer,
  '@/lib/admin-auth': { verifyAdminSessionFromRequest: async () => ({ ok: true }) },
});
const syncRoute = load('app/api/cart-reservations/route.ts');
const adminRoute = load('app/api/admin-live/cart-holds/route.ts');
const cronRoute = load('app/api/cron/cart-holds-sweep/route.ts');
const lib = load('lib/cartClearMarks.ts');
const sweepLib = load('lib/cartHoldSweep.ts');

// ── 손님 화면(탭) 흉내 — order/page.tsx 의 번호 붙이기·거절 반영·안내 1회 규칙 ──
const noticeStore = new Map(); // 브라우저별 ruru_cart_notice_seq
function tab({ session, kakao = '', phone = '', browser = session }) {
  return { session, kakao, phone, browser, items: [], notices: 0 };
}
function add(t, productId, opts = {}) { t.items.push({ product_id: String(productId), product_name: `상품${productId}`, color: opts.color ?? '', size: opts.size ?? '', qty: String(opts.qty ?? 1), product_price: '10000', cart_seq: undefined }); }
async function sync(t) {
  const res = await syncRoute.POST({ json: async () => ({
    action: 'sync', sessionKey: t.session, phone: t.phone, kakaoId: t.kakao, nickname: 'n', customerName: 'c',
    items: t.items.map((it) => ({ productId: it.product_id, productName: it.product_name, color: it.color, size: it.size, qty: it.qty, unitPrice: 10000, cartSeq: it.cart_seq === undefined ? lib.CART_SEQ_NEW : it.cart_seq })),
  }) });
  const claim = res.body;
  assert.equal(res.status, 200, JSON.stringify(claim));
  if (Number.isFinite(Number(claim.cartSeq)) && claim.cartSeq !== null) t.items = t.items.map((it) => (it.cart_seq === undefined ? { ...it, cart_seq: Number(claim.cartSeq) } : it));
  const dropped = (claim.results || []).filter((r) => r.ok === false && (r.expired || r.cleared || r.unavailable));
  t.items = t.items.filter((it) => !dropped.some((r) => String(r.productId) === it.product_id && norm(r.color) === norm(it.color) && norm(r.size) === norm(it.size)));
  if (dropped.some((r) => r.expired && !r.silent)) {
    const seq = Number(claim.clearedSeq) || 0;
    const shown = noticeStore.get(t.browser) || 0;
    if (!seq || seq > shown) { t.notices += 1; if (seq) noticeStore.set(t.browser, seq); }
  }
  return claim;
}
const holdsOf = (session) => db.cart_reservations.filter((r) => r.session_key === session);
const adminClear = (sessionKey) => adminRoute.POST({ json: async () => ({ action: 'clear', sessionKey }) });
const adminClearAll = (sessionKeys) => adminRoute.POST({ json: async () => ({ action: 'clear-all', sessionKeys }) });
function age(minutes) { for (const r of db.cart_reservations) { r.created_at = new Date(Date.parse(r.created_at) - minutes * 60_000).toISOString(); r.expires_at = new Date(Date.parse(r.expires_at) - minutes * 60_000).toISOString(); } }
function reset() { for (const k of Object.keys(db)) db[k] = []; db.settings.push({ key: 'cart_hold_minutes', value: '600' }); db.products.push({ id: '56', status: '판매중', is_visible: true, product_note: '{}' }, { id: '57', status: '판매중', is_visible: true, product_note: '{}' }, { id: '58', status: '숨김', is_visible: true, product_note: '{"name_suggestion_enabled":false}' }); marksTableMissing = false; noticeStore.clear(); }
const pass = [];

// ── 1) 관리자 비우기: 열린 탭·같은 브라우저 다른 탭·다시 연 화면·다른 브라우저(kakao 우선/전화) ──
reset();
{
  const A = tab({ session: 'sessionA01', kakao: '111', phone: '01012345678' });
  add(A, 56); add(A, 57, { color: '블랙', size: 'M' });
  await sync(A);
  assert.equal(holdsOf('sessionA01').length, 2);
  assert.ok(A.items.every((it) => Number.isFinite(it.cart_seq)), 'new lines are stamped with the server number');
  const B = { ...tab({ session: 'sessionA01', kakao: '111', phone: '01012345678', browser: 'sessionA01' }), items: clone(A.items) }; // 같은 브라우저 다른 탭(메모리에 같은 줄)
  const draft = clone(A.items); // 손님 폰 임시 장바구니
  const inapp = { ...tab({ session: 'sessionINAPP', kakao: '111', phone: '01012345678' }), items: clone(A.items) }; // 카톡 인앱(세션키 다름, kakao 같음)
  const noKakao = { ...tab({ session: 'sessionNOKK', phone: '01012345678' }), items: clone(A.items) }; // kakao 없음, 전화 같음
  const otherPerson = { ...tab({ session: 'sessionOTHR', kakao: '222', phone: '01012345678' }), items: clone(A.items) }; // 전화만 같고 kakao 다름
  await adminClear('sessionA01');
  assert.equal(holdsOf('sessionA01').length, 0, 'admin clear deletes the holds');
  assert.equal(db.settings.filter((r) => r.key.startsWith('cart_revoke_')).length, 0, 'permanent mark replaces the 3-minute revoke flag');
  assert.equal(db.cart_clear_marks.at(-1).kakao_id, '111', 'mark carries the session kakao_id (read before delete)');
  await sync(A); assert.equal(A.items.length, 0, 'open tab: removed'); assert.equal(A.notices, 1, 'open tab: notice once');
  await sync(A); assert.equal(A.notices, 1, 'notice not repeated');
  await sync(B); assert.equal(B.items.length, 0, 'other tab (same browser): removed'); assert.equal(B.notices, 0, 'same browser already showed the notice');
  const reopened = { ...tab({ session: 'sessionA01', kakao: '111', phone: '01012345678', browser: 'reopened' }), items: draft.map((it) => ({ ...it, cart_seq: lib.readCartSeqField(it.cart_seq) })) };
  await sync(reopened); assert.equal(reopened.items.length, 0, 'reopened phone (restored draft): removed');
  const legacy = { ...tab({ session: 'sessionA01', kakao: '111', phone: '01012345678', browser: 'legacy' }), items: draft.map((it) => ({ ...it, cart_seq: lib.readCartSeqField(undefined) })) };
  await sync(legacy); assert.equal(legacy.items.length, 0, 'old draft without numbers: removed');
  await sync(inapp); assert.equal(inapp.items.length, 0, 'other browser, same kakao_id: removed');
  await sync(noKakao); assert.equal(noKakao.items.length, 0, 'other browser without kakao_id, same phone: removed');
  await sync(otherPerson); assert.equal(otherPerson.items.length, 2, 'both have kakao_id and they differ: phone alone does not match (kakao first)');
  assert.equal(holdsOf('sessionA01').length + holdsOf('sessionINAPP').length + holdsOf('sessionNOKK').length, 0, 'nothing re-held anywhere');
  // 비운 뒤 새로 담기는 정상
  add(A, 56); await sync(A); assert.equal(A.items.length, 1, 'new add after clear is allowed'); assert.equal(holdsOf('sessionA01').length, 1);
  await sync(A); assert.equal(A.items.length, 1, 'new add stays on the next sync');
  pass.push('1) 관리자 비우기 — 열린 탭·다른 탭·다시 연 화면·옛 장바구니·다른 브라우저(kakao/전화) 모두 제거, 안내 1회, 새로 담기 허용');
}

// ── 1-b) 비우기는 상품 상태와 무관(숨김·검색노출·판매중) + 전체 비우기 ──
reset();
{
  db.products.push({ id: '59', status: '숨김', is_visible: false, product_note: '{"name_suggestion_enabled":true}' }); // 검색으로만 담을 수 있는 상품
  const A = tab({ session: 'sessionAll1', kakao: '333', phone: '01099998888' });
  const C = tab({ session: 'sessionAll2', phone: '01077776666' });
  add(A, 59); add(A, 56); add(C, 57);
  await sync(A); await sync(C);
  assert.equal(holdsOf('sessionAll1').length, 2, 'hidden/search-only product can be held');
  await adminClearAll(['sessionAll1', 'sessionAll2']);
  await sync(A); await sync(C);
  assert.equal(A.items.length + C.items.length, 0, 'clear-all removes every line regardless of product state');
  pass.push('1-b) 전체 비우기 — 판매중·검색노출 숨김 상품 가리지 않고 제거');
}

// ── 2) 유지시간 만료 — 손님 접속 없이 서버 정리(cron) + 다시 보내도 거절 + 시각 리셋 없음 ──
reset();
{
  const A = tab({ session: 'sessionExp1', kakao: '444', phone: '01011112222' });
  add(A, 56, { color: '블랙', size: 'L' });
  await sync(A);
  const firstCreated = holdsOf('sessionExp1')[0].created_at;
  age(300); // 300분 지난 것처럼(처음 담은 시각을 300분 앞당김)
  const agedFirst = holdsOf('sessionExp1')[0].created_at;
  assert.equal(Date.parse(firstCreated) - Date.parse(agedFirst), 300 * 60_000);
  await sync(A);
  assert.equal(holdsOf('sessionExp1')[0].created_at, agedFirst, 'resync keeps the first-added time (no reset while holding)');
  age(301); // 처음 담은 지 601분 > 600분
  const cron = await cronRoute.GET({ headers: { get: (h) => (h === 'user-agent' ? 'vercel-cron/1.0' : '') }, nextUrl: { searchParams: { get: () => null } } });
  assert.equal(cron.body.ok, true); assert.equal(cron.body.deleted, 1, 'cron deletes the expired hold without the customer'); assert.equal(cron.body.marked, 1);
  assert.equal(db.cart_reservations.length, 0, 'expired row gone from cart_reservations');
  assert.equal(db.cart_clear_marks.at(-1).reason, 'expired');
  await sync(A);
  assert.equal(A.items.length, 0, 'phone resends the old line → rejected and removed'); assert.equal(A.notices, 1, 'notice once');
  assert.equal(holdsOf('sessionExp1').length, 0, 'not re-held with a fresh time');
  const otherTab = { ...tab({ session: 'sessionExp1', kakao: '444', phone: '01011112222', browser: 'sessionExp1' }), items: [{ product_id: '56', product_name: '상품56', color: '블랙', size: 'L', qty: '1', product_price: '10000', cart_seq: firstCreated ? 1 : 0 }] };
  await sync(otherTab); assert.equal(otherTab.items.length, 0, 'another tab resending is rejected too'); assert.equal(holdsOf('sessionExp1').length, 0);
  add(A, 56, { color: '블랙', size: 'L' }); await sync(A); assert.equal(A.items.length, 1, 'customer may add it again on purpose (new clock)');
  pass.push('2) 만료 — cron 이 접속 없이 삭제+기록, 옛 줄 재전송 거절·제거·안내 1회, 시각 리셋 경로 없음(일부러 새로 담기만 허용)');
}

// ── 2-b) cron 이 아직 안 돈 상태에서 손님이 먼저 보내도(RPC 가 expired) 기록이 남아 다른 탭이 되살리지 못함 ──
reset();
{
  const A = tab({ session: 'sessionExp2', phone: '01055556666' });
  add(A, 57); await sync(A);
  const B = { ...tab({ session: 'sessionExp2', phone: '01055556666', browser: 'sessionExp2' }), items: clone(A.items) };
  age(601);
  await sync(A); // 동기화 안의 정리(1분 1회)나 RPC 만료 신호 — 어느 쪽이든 expired 기록
  assert.equal(A.items.length, 0); assert.equal(A.notices, 1);
  assert.ok(db.cart_clear_marks.some((m) => m.reason === 'expired' && m.product_id === '57'), 'expired mark recorded');
  await sync(B); assert.equal(B.items.length, 0, 'other tab cannot revive it'); assert.equal(db.cart_reservations.length, 0);
  pass.push('2-b) 만료 직후 손님 동기화 — 만료 기록이 남아 다른 탭도 되살리지 못함');
}

// ── 3) 제출 후 — 같은 상품 옛 줄은 조용히 제거(안내 없음), 다른 상품 유지, 일부러 다시 담기 허용 ──
reset();
{
  const A = tab({ session: 'sessionSub1', kakao: '555', phone: '01033334444' });
  add(A, 56); add(A, 57); await sync(A);
  const B = { ...tab({ session: 'sessionSub2', kakao: '555', phone: '01033334444' }), items: clone(A.items) }; // 다른 브라우저
  // submit 라우트가 성공 «뒤» 넣는 것과 같은 기록(상품 56 만 주문)
  db.cart_clear_marks.push({ seq: ++markSeq, created_at: new Date().toISOString(), reason: 'submitted', session_key: 'sessionSub1', kakao_id: '555', customer_phone: '01033334444', product_id: '56', color: '', size: '' });
  await sync(B);
  assert.deepEqual(B.items.map((it) => it.product_id), ['57'], 'ordered product removed, other product kept');
  assert.equal(B.notices, 0, 'no "time passed" notice after a submit');
  add(B, 56); await sync(B); assert.deepEqual(B.items.map((it) => it.product_id).sort(), ['56', '57'], 're-adding on purpose is allowed');
  pass.push('3) 제출 후 — 주문한 상품만 다른 브라우저에서도 제거(안내 없음), 다른 상품 유지, 다시 담기 허용');
}

// ── 4) 내린 상품(손님이 담을 수 없는 상품) — 자동 제거, 검색으로 담을 수 있으면 허용 ──
reset();
{
  db.products.push({ id: '60', status: 'deleted', is_visible: true, product_note: '{}' }, { id: '61', status: '판매중', is_visible: false, product_note: '{"name_suggestion_enabled":false}' }, { id: '62', status: '숨김', is_visible: true, product_note: '{"name_suggestion_enabled":true}' });
  const A = tab({ session: 'sessionUnav', phone: '01044445555' });
  for (const id of [56, 58, 60, 61, 62, 999]) add(A, id);
  await sync(A);
  // [㉛ 사장님 결정] 동기화의 「내린 상품 거절」은 뺐다 — 상품 상태로는 담기 동기화를 거절하지 않는다(비우기·만료·제출 정리만).
  assert.deepEqual(A.items.map((it) => it.product_id).sort(), ['56', '58', '60', '61', '62', '999'], 'sync no longer rejects by product state');
  assert.equal(A.notices, 0);
  pass.push('4) 내린 상품 거절 제거 — 상품 상태로는 동기화 거절 없음(비우기·만료·제출 정리만 동작)');
}

// ── 5) 예전 3분 회수 지시(배포 전 비우기) 호환 — 영구 기록으로 옮기고 지움 ──
reset();
{
  const A = tab({ session: 'sessionOld1', kakao: '777', phone: '01066667777' });
  add(A, 56); await sync(A);
  db.settings.push({ key: 'cart_revoke_sessionOld1', value: new Date(Date.now() - 10 * 60_000).toISOString() });
  await sync(A);
  assert.equal(A.items.length, 0, 'old revoke flag still clears');
  assert.equal(db.settings.filter((r) => r.key === 'cart_revoke_sessionOld1').length, 0, 'flag converted and removed');
  add(A, 57); await sync(A); assert.equal(A.items.length, 1, 'new add after conversion is allowed (no 3-minute wipe)');
  pass.push('5) 배포 전 회수 지시 — 영구 기록으로 옮겨 계속 유효, 새로 담기는 허용');
}

// ── 6) 표 없음(SQL 전) — 지금처럼 동작(거절·기록 없이 담기 정상) ──
reset();
{
  marksTableMissing = true;
  const A = tab({ session: 'sessionNoTb', phone: '01088889999' });
  add(A, 56); const claim = await sync(A);
  assert.equal(claim.cartSeq, null); assert.equal(A.items.length, 1); assert.equal(holdsOf('sessionNoTb').length, 1);
  pass.push('6) 비움 기록 표가 없을 때 — 기존 동작 그대로(주문·담기 안 막힘)');
}

// ── 순수 함수 ──
{
  const m = (o) => ({ seq: 10, reason: 'admin_clear', ...o });
  assert.equal(lib.cartMarkMatchesIdentity(m({ session_key: 'x' }), { sessionKey: 'x' }), true);
  assert.equal(lib.cartMarkMatchesIdentity(m({ kakao_id: '1', customer_phone: '01012345678' }), { sessionKey: 'y', kakaoId: '2', phone: '01012345678' }), false);
  assert.equal(lib.cartMarkMatchesIdentity(m({ customer_phone: '01012345678' }), { sessionKey: 'y', kakaoId: '2', phone: '010-1234-5678' }), true);
  assert.equal(lib.cartItemClearedBy({ productId: '1', color: '', size: '', cartSeq: lib.CART_SEQ_NEW }, [m({ session_key: 's' })], { sessionKey: 's' }), null);
  assert.equal(lib.cartItemClearedBy({ productId: '1', color: '', size: '', cartSeq: 10 }, [m({ session_key: 's' })], { sessionKey: 's' }), null, 'same number = added after the clear');
  assert.equal(lib.cartItemClearedBy({ productId: '1', color: '없음', size: '', cartSeq: 9 }, [m({ session_key: 's', product_id: '1', color: '', size: '' })], { sessionKey: 's' }).seq, 10);
  assert.equal(lib.readCartSeqField(undefined), 0); assert.equal(lib.readCartSeqField(-1), -1); assert.equal(lib.readCartSeqField('12'), 12);
  assert.equal(lib.cartClearNeedsNotice('submitted'), false); assert.equal(lib.cartClearNeedsNotice('expired'), true);
  assert.equal(lib.cartProductUnavailable(null), true);
  assert.equal(lib.cartProductUnavailable({ status: '숨김', is_visible: true, product_note: '' }), false, 'hidden but searchable by default');
  assert.equal(typeof sweepLib.sweepExpiredCartHolds, 'function');
  pass.push('순수 함수 — 손님 매칭(kakao 우선)·번호 비교·임시 장바구니 번호·안내 여부·담을 수 없는 상품');
}

for (const line of pass) console.log('PASS', line);
console.log(`cart clear marks scenarios passed (${pass.length})`);
