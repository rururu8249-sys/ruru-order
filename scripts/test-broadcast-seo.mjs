// [2026-10-22] AI 비서 6단계 — 유튜브 SEO: 챕터 계산(소개 기록)·AI 응답 검사·규칙 문구·라우트(메모리 DB·손님 정보 안 보냄)
import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.GEMINI_API_KEY = 'test';

const load = createUiLoader({
  '@supabase/supabase-js': { createClient: () => ({ from: query }) },
  'next/server': { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } },
  '@/lib/admin-auth': { verifyAdminSessionFromRequest: async () => ({ ok: true }) },
});
const lib = load('lib/broadcastSeo.ts');

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('PASS', name); };
const S = '2026-10-18T11:00:00.000Z'; // 20:00 KST
const at = (sec) => new Date(Date.parse(S) + sec * 1000).toISOString();

await t('챕터: 00:00 오프닝·같은 상품 연속 합침·10초 미만 건너뜀·해제 무시·방송 밖 제외', () => {
  const ch = lib.buildChapters(S, at(7200), [
    { set_at: at(-100), product_name: '전 방송 것' },
    { set_at: at(95), product_name: '프라다 나일론백' },
    { set_at: at(100), product_name: '프라다 나일론백', detail_name: '블랙' }, // 5초 뒤 상세 → 앞 챕터 교체
    { set_at: at(700), product_name: '프라다 나일론백', detail_name: '블랙' }, // 같은 것 반복
    { set_at: at(1500), product_name: null, cleared: true },
    { set_at: at(1800), product_name: '메종 니트' },
    { set_at: at(8000), product_name: '방송 끝난 뒤' },
  ]);
  assert.deepEqual(ch, [{ seconds: 0, label: '오프닝' }, { seconds: 95, label: '프라다 나일론백 블랙' }, { seconds: 1800, label: '메종 니트' }]);
  assert.equal(lib.chaptersText(ch), '00:00 오프닝\n01:35 프라다 나일론백 블랙\n30:00 메종 니트');
  assert.equal(lib.chapterTime(3725), '1:02:05');
  assert.equal(lib.kstDateLabel(S), '2026년 10월 18일');
});

await t('AI 응답 검사·규칙 문구', () => {
  const ok = lib.parseSeoJson('{"titles":["a","b","c","d"],"description":"설명","tags":["#라방","라방","니트"]}');
  assert.deepEqual(ok.titles, ['a', 'b', 'c']);
  assert.deepEqual(ok.tags, ['라방', '니트']);
  assert.equal(lib.parseSeoJson('{"titles":[],"description":"x"}'), null);
  const rule = lib.seoByRule({ channel: '루루동이 LIVE', title: '남녀공용의류', dateLabel: '2026년 10월 18일', products: [{ name: '메종 니트', price: 39000, category: '의류' }, { name: '프라다 백', price: 259000, category: '잡화' }] });
  assert.equal(rule.titles.length, 3);
  assert.ok(rule.description.includes('· 메종 니트 39,000원') && rule.description.includes('#의류'));
  assert.ok(rule.tags.includes('라이브커머스') && rule.tags.includes('잡화'));
});

// 라우트
const db = {
  broadcasts: [{ id: 1018, public_title: '남녀공용의류', started_at: S, ended_at: at(7200), status: 'off', youtube_live_url: 'https://youtube.com/live/x', is_deleted: false }],
  broadcast_products: [{ broadcast_id: 1018, product_id: 1, sort_order: 2, products: { id: 1, product_name: '메종 니트', price: 39000, product_note: '{"category":"의류"}' } }, { broadcast_id: 1018, product_id: 2, sort_order: 1, products: { id: 2, product_name: '프라다 백', price: 259000, product_note: null } }],
  chat_current_product: [{ set_at: at(95), product_name: '프라다 백', detail_name: null, cleared: false }, { set_at: at(1800), product_name: '메종 니트', detail_name: null, cleared: false }, { set_at: at(3000), product_name: '알로 뮬', detail_name: '240', cleared: false }],
  customers: [{ youtube_nickname: '홍길동-f2h', customer_phone: '01011112222' }],
};
function query(table) {
  const filters = []; let order = null; let limit = null; let single = false;
  const api = {
    select() { return api; },
    eq(c, v) { filters.push((r) => String(r[c]) === String(v)); return api; },
    neq(c, v) { filters.push((r) => r[c] !== v); return api; },
    gte(c, v) { filters.push((r) => String(r[c]) >= String(v)); return api; },
    lte(c, v) { filters.push((r) => String(r[c]) <= String(v)); return api; },
    order(c, o) { order = { c, asc: o?.ascending !== false }; return api; },
    limit(n) { limit = n; return api; },
    maybeSingle() { single = true; return api; },
    then(res, rej) {
      return Promise.resolve().then(() => {
        let hit = (db[table] || []).filter((r) => filters.every((f) => f(r)));
        if (order) hit = [...hit].sort((a, b) => (String(a[order.c]) < String(b[order.c]) ? -1 : 1) * (order.asc ? 1 : -1));
        if (limit) hit = hit.slice(0, limit);
        return { data: single ? (hit[0] ?? null) : JSON.parse(JSON.stringify(hit)), error: null };
      }).then(res, rej);
    },
  };
  return api;
}
const route = load('app/api/admin-live/assistant-seo/route.ts');
const sent = [];
let reply = '{"titles":["프라다 백 반값 라이브","메종 니트 특가","오늘 뭐 샀게?"],"description":"첫 줄 요약\\n· 메종 니트 39,000원","tags":["라이브커머스","프라다","니트"]}';
globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body).contents[0].parts[0].text); if (reply === 'fail') return { ok: false, status: 503, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: reply }] } }] }) }; };
const req = (qs) => ({ url: `http://x/api/admin-live/assistant-seo${qs}` });

await t('라우트: 방송 목록', async () => {
  const r = await route.GET(req(''));
  assert.equal(r.status, 200);
  assert.equal(r.body.broadcasts[0].title, '남녀공용의류');
});

await t('라우트: 상품(sort_order 순)·챕터·AI 문구 + 설명란 끝에 타임라인, 손님 정보 안 보냄', async () => {
  const r = await route.GET(req('?broadcastId=1018&extra=오늘만 무료배송'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.via, 'ai');
  assert.deepEqual(r.body.products.map((p) => p.name), ['프라다 백', '메종 니트']);
  assert.equal(r.body.chapters.length, 4);
  assert.ok(r.body.description.endsWith('타임라인\n00:00 오프닝\n01:35 프라다 백\n30:00 메종 니트\n50:00 알로 뮬 240'));
  assert.equal(r.body.titles.length, 3);
  const prompt = sent.at(-1);
  assert.ok(prompt.includes('메종 니트') && prompt.includes('39,000원') && prompt.includes('오늘만 무료배송'));
  assert.ok(!prompt.includes('홍길동') && !prompt.includes('0101111'));
});

await t('라우트: AI 실패 → 규칙 문구', async () => {
  reply = 'fail';
  const r = await route.GET(req('?broadcastId=1018'));
  assert.equal(r.body.via, 'rule');
  assert.ok(r.body.description.includes('· 프라다 백 259,000원'));
  assert.equal((await route.GET(req('?broadcastId=999'))).status, 404);
});

console.log(`ALL PASS broadcast seo (${n})`);
