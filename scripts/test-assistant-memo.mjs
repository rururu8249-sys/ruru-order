// [2026-10-22] AI 비서 3단계 — 메모함: 번호 가림·날짜 말·규칙 정리·AI 응답 검사 + 실제 라우트(메모리 DB) 시나리오
import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

let tableExists = true;
const db = { admin_assistant_memos: [] };
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
function query(table) {
  const filters = []; let op = 'select', payload = null, order = null, limit = null, single = false, wantRows = false, cols = '*';
  const api = {
    select(c) { if (op !== 'select') wantRows = true; cols = c || '*'; return api; },
    insert(rows) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return api; },
    update(v) { op = 'update'; payload = v; return api; },
    eq(c, v) { filters.push((r) => r[c] === v); return api; },
    neq(c, v) { filters.push((r) => r[c] !== v); return api; },
    gte(c, v) { filters.push((r) => String(r[c] ?? '') >= String(v)); return api; },
    order(c, o) { order = { c, asc: o?.ascending !== false }; return api; },
    limit(n) { limit = n; return api; },
    maybeSingle() { single = true; return api; },
    then(res, rej) {
      return Promise.resolve().then(() => {
        if (!tableExists) return { data: null, error: { code: '42P01', message: 'relation "admin_assistant_memos" does not exist' } };
        const rows = db[table];
        if (op === 'insert') {
          const added = payload.map((r) => ({ id: uuid(), created_at: new Date(Date.now() + seq).toISOString(), status: 'open', done_at: null, due_date: null, who: null, product: null, parent_id: null, ...r }));
          rows.push(...added);
          return { data: single ? added[0] : added, error: null };
        }
        let hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'update') { hit.forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
        if (order) hit = [...hit].sort((a, b) => (String(a[order.c]) < String(b[order.c]) ? -1 : 1) * (order.asc ? 1 : -1));
        if (limit) hit = hit.slice(0, limit);
        return { data: JSON.parse(JSON.stringify(hit)), error: null };
      }).then(res, rej);
    },
  };
  return api;
}
let authed = true;
const load = createUiLoader({
  '@supabase/supabase-js': { createClient: () => ({ from: query }) },
  'next/server': { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } },
  '@/lib/admin-auth': { verifyAdminSessionFromRequest: async () => (authed ? { ok: true } : null) },
});
const lib = load('lib/assistantMemo.ts');
const route = load('app/api/admin-live/assistant-memos/route.ts');
const req = (body) => ({ json: async () => body });

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('PASS', name); };
const NOW = Date.parse('2026-10-21T17:44:00Z'); // 10-22(목) 02:44 KST

await t('번호 가림 → 되돌림', () => {
  const { masked, restore } = lib.maskSensitive('홍길동 010-1234-5678 연락, 계좌 3333-01-1234567 환불');
  assert.ok(!masked.includes('010-1234-5678') && !masked.includes('3333-01-1234567'), masked);
  assert.ok(masked.includes('[번호1]') && masked.includes('[번호2]'));
  assert.equal(restore('[번호1] 로 전화'), '010-1234-5678 로 전화');
  // 짧은 숫자(사이즈·수량)는 안 가림
  assert.equal(lib.maskSensitive('L 2개 240 사이즈').masked, 'L 2개 240 사이즈');
});

await t('날짜 말(한국 날짜)', () => {
  assert.equal(lib.parseDueWords('내일 교환 연락', NOW), '2026-10-23');
  assert.equal(lib.parseDueWords('오늘 발송', NOW), '2026-10-22');
  assert.equal(lib.parseDueWords('모레', NOW), '2026-10-24');
  assert.equal(lib.parseDueWords('금요일 택배', NOW), '2026-10-23');
  assert.equal(lib.parseDueWords('다음 주 월요일 입고', NOW), '2026-10-26');
  assert.equal(lib.parseDueWords('10월 30일까지', NOW), '2026-10-30');
  assert.equal(lib.parseDueWords('그냥 메모', NOW), null);
});

await t('규칙 정리(AI 없이)', () => {
  const items = lib.organizeByRule('홍길동 내일 교환 연락, 폴로자켓 L 2개 재고 추가 주문, 금요일 택배 늦게 옴\n행복나무 단골', NOW);
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((i) => i.kind), ['todo', 'product', 'todo', 'note']);
  assert.equal(items[0].due_date, '2026-10-23');
});

await t('AI 응답 검사(정해진 모양만)', () => {
  const restore = lib.maskSensitive('010-1111-2222').restore;
  const items = lib.parseOrganizeJson('{"items":[{"kind":"todo","text":"[번호1] 로 교환 연락","due":"2026-10-23","who":"홍길동","product":""},{"kind":"hack","text":"x"},{"kind":"note","text":""}]}', restore);
  assert.equal(items.length, 2);
  assert.equal(items[0].body, '010-1111-2222 로 교환 연락');
  assert.equal(items[0].who, '홍길동');
  assert.equal(items[1].kind, 'note'); // 모르는 kind → 기억할 것
  assert.equal(lib.parseOrganizeJson('엉망'), null);
  assert.equal(lib.parseOrganizeJson('{"items":[]}'), null);
});

await t('로그인 안 하면 401', async () => {
  authed = false;
  assert.equal((await route.GET({})).status, 401);
  assert.equal((await route.POST(req({ text: 'x' }))).status, 401);
  authed = true;
});

await t('표가 없으면 「준비 중」(원문 저장 시도도 안전)', async () => {
  tableExists = false;
  const r = await route.POST(req({ text: '내일 연락' }));
  assert.equal(r.status, 503);
  assert.equal(r.body.needsSetup, true);
  tableExists = true;
});

const sentToAi = [];
await t('AI 정리: 원문 먼저 저장 + 번호는 가려서 보냄', async () => {
  process.env.GEMINI_API_KEY = 'test';
  globalThis.fetch = async (url, init) => {
    sentToAi.push(JSON.parse(init.body).contents[0].parts[0].text);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"items":[{"kind":"todo","text":"홍길동 [번호1] 교환 연락","due":"2026-10-23","who":"홍길동","product":""},{"kind":"product","text":"폴로자켓 L 2개 추가 주문","due":"","who":"","product":"폴로자켓"}]}' }] } }] }) };
  };
  const r = await route.POST(req({ text: '홍길동 010-9999-8888 내일 교환 연락, 폴로자켓 L 2개 추가 주문' }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.organizedBy, 'ai');
  assert.ok(!sentToAi[0].includes('010-9999-8888'));
  assert.equal(db.admin_assistant_memos.filter((m) => m.kind === 'raw').length, 1);
  assert.equal(db.admin_assistant_memos.find((m) => m.kind === 'raw').body.includes('010-9999-8888'), true); // 원문은 그대로
  const todo = db.admin_assistant_memos.find((m) => m.kind === 'todo');
  assert.equal(todo.body, '홍길동 010-9999-8888 교환 연락'); // 되돌림
  assert.ok(todo.parent_id);
});

await t('AI 실패 → 규칙 정리로 저장', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const r = await route.POST(req({ text: '금요일 택배 늦게 옴, 다이슨 재고 확인' }));
  assert.equal(r.body.organizedBy, 'rule');
  assert.equal(r.body.items.length, 2);
});

await t('목록·끝냄·되돌림·삭제', async () => {
  let g = await route.GET({});
  assert.equal(g.status, 200);
  assert.equal(g.body.open.length, 4);
  assert.ok(g.body.open.every((m) => m.kind !== 'raw'));
  const id = g.body.open[0].id;
  assert.equal((await route.PATCH(req({ id, status: 'done' }))).status, 200);
  g = await route.GET({});
  assert.equal(g.body.open.length, 3);
  assert.equal(g.body.done.length, 1);
  await route.PATCH(req({ id, status: 'open' }));
  await route.PATCH(req({ id, status: 'deleted' }));
  g = await route.GET({});
  assert.equal(g.body.open.length, 3);
  assert.equal(g.body.done.length, 0);
  // 원문(raw)은 PATCH 로 못 바꿈
  const rawId = db.admin_assistant_memos.find((m) => m.kind === 'raw').id;
  await route.PATCH(req({ id: rawId, status: 'deleted' }));
  assert.equal(db.admin_assistant_memos.find((m) => m.id === rawId).status, 'open');
  assert.equal((await route.PATCH(req({ id: 'x', status: 'done' }))).status, 400);
});

console.log(`ALL PASS assistant memo (${n})`);
