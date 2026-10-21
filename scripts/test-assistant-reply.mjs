// [2026-10-22] AI 비서 4단계 — 응대 문구: 방침 저장/읽기·번호 가림·사진 검사·AI 응답 검사 (실제 라우트 + 메모리 DB)
import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.GEMINI_API_KEY = 'test';

const db = { admin_assistant_memos: [] };
let seq = 0;
function query(table) {
  const filters = []; let op = 'select', payload = null, order = null, limit = null;
  const api = {
    select() { return api; },
    insert(rows) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return api; },
    update(v) { op = 'update'; payload = v; return api; },
    eq(c, v) { filters.push((r) => r[c] === v); return api; },
    order(c, o) { order = { c, asc: o?.ascending !== false }; return api; },
    limit(n) { limit = n; return api; },
    then(res, rej) {
      return Promise.resolve().then(() => {
        const rows = db[table];
        if (op === 'insert') { const added = payload.map((r) => ({ id: `id-${++seq}`, ...r })); rows.push(...added); return { data: added, error: null }; }
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
const lib = load('lib/assistantReply.ts');
const route = load('app/api/admin-live/assistant-reply/route.ts');
const req = (body) => ({ json: async () => body });

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('PASS', name); };

const sent = [];
let reply = '{"summary":"사이즈 교환 원함","category":"교환","drafts":[{"label":"정중히","text":"○○님 [번호1] 확인했어요. 사이즈 교환은 반품비 10,000원이 있어요."},{"label":"짧게","text":"확인 후 바로 안내드릴게요 🙏"}]}';
globalThis.fetch = async (url, init) => {
  const b = JSON.parse(init.body);
  sent.push(b.contents[0].parts);
  if (reply === 'fail') return { ok: false, status: 503, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: reply }] } }] }) };
};

await t('로그인 안 하면 401', async () => {
  authed = false;
  assert.equal((await route.GET({})).status, 401);
  assert.equal((await route.POST(req({ text: 'x' }))).status, 401);
  assert.equal((await route.PUT(req({ policy: 'x' }))).status, 401);
  authed = true;
});

await t('기본 방침 = 이용약관 제7조 내용', async () => {
  const g = await route.GET({});
  assert.equal(g.body.isDefault, true);
  assert.ok(g.body.policy.includes('국내상품 10,000원') && g.body.policy.includes('7일'));
});

await t('방침 저장 → 다시 읽기(한 줄만 유지)', async () => {
  assert.equal((await route.PUT(req({ policy: '말투: 다정하게' }))).status, 200);
  assert.equal((await route.PUT(req({ policy: '말투: 다정하게, 반품비 10,000원' }))).status, 200);
  const g = await route.GET({});
  assert.equal(g.body.isDefault, false);
  assert.equal(g.body.policy, '말투: 다정하게, 반품비 10,000원');
  assert.equal(db.admin_assistant_memos.filter((r) => r.kind === 'policy').length, 1);
  assert.equal((await route.PUT(req({ policy: '  ' }))).status, 400);
});

await t('문구 만들기: 방침 포함·번호는 가려서 보내고 답에선 되돌림', async () => {
  const r = await route.POST(req({ text: '사이즈가 작아요 교환되나요? 010-2222-3333' }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const prompt = sent.at(-1)[0].text;
  assert.ok(prompt.includes('말투: 다정하게, 반품비 10,000원'));
  assert.ok(!prompt.includes('010-2222-3333'));
  assert.equal(r.body.category, '교환');
  assert.equal(r.body.drafts.length, 2);
  assert.ok(r.body.drafts[0].text.includes('010-2222-3333'));
});

await t('사진: 형식·크기 검사 후 그대로 붙여 보냄', async () => {
  const r = await route.POST(req({ text: '', image: { mimeType: 'image/jpeg', data: 'QUJD' } }));
  assert.equal(r.status, 200);
  assert.deepEqual(sent.at(-1)[1], { inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } });
  assert.equal((await route.POST(req({ image: { mimeType: 'image/gif', data: 'QUJD' } }))).status, 400);
  assert.equal((await route.POST(req({ image: { mimeType: 'image/png', data: 'not base64!' } }))).status, 400);
  assert.equal((await route.POST(req({}))).status, 400);
});

await t('AI 실패·이상한 답 → 안내(지어내지 않음)', async () => {
  reply = 'fail';
  assert.equal((await route.POST(req({ text: '배송 언제 와요' }))).status, 503);
  reply = '{"summary":"x","category":"hack","drafts":[]}';
  assert.equal((await route.POST(req({ text: '배송 언제 와요' }))).status, 502);
  assert.equal(lib.parseReplyJson('{"summary":"배송 문의","category":"hack","drafts":[{"label":"","text":"확인해 볼게요"}]}').category, '기타');
});

console.log(`ALL PASS assistant reply (${n})`);
