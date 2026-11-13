// [2026-11-13] Gemini 무료 한도 중앙 관리 — 분당·하루 상한(여유 10%)·표에 없는 모델·429 막기·날짜 바뀜
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const G = createUiLoader({})("lib/geminiGate.ts");

const t0 = Date.parse("2026-11-13T05:00:10Z"); // 한국 14:00 · 미국 서부 11/12 21:00
assert.equal(G.capsOf("gemini-3.5-flash-lite").rpm, 15);
assert.equal(G.capsOf("gemini-3.5-flash-lite").rpd, 500);
assert.equal(G.capsOf("gemini-3.8-flash").rpd, 20);
assert.equal(G.capsOf("gemini-flash-latest"), null);
assert.equal(G.takeSlot({ models: {} }, "gemini-flash-latest", t0), null); // 모르는 모델은 안 부름

// 분당 13번까지
let st = { models: {} };
for (let i = 0; i < 15; i += 1) { st = G.takeSlot(st, "gemini-3.5-flash-lite", t0); assert.ok(st); }
assert.equal(G.takeSlot(st, "gemini-3.5-flash-lite", t0), null);
assert.ok(G.takeSlot(st, "gemini-3.5-flash-lite", t0 + 60_000)); // 다음 분엔 됨
assert.ok(G.takeSlot(st, "gemini-3.1-flash-lite", t0)); // 모델마다 따로

// 하루 450번 → 막힘, 미국 서부 날짜 바뀌면 다시
let day = { models: { "gemini-3.5-flash-lite": { day: G.geminiQuotaDay(t0), count: 500, minute: 0, minuteCount: 0, blockedUntil: 0 } } };
assert.equal(G.takeSlot(day, "gemini-3.5-flash-lite", t0), null);
const reset = G.nextQuotaReset(t0);
assert.notEqual(G.geminiQuotaDay(reset), G.geminiQuotaDay(t0));
assert.equal(G.geminiQuotaDay(reset - 60_000), G.geminiQuotaDay(t0));
assert.ok(G.takeSlot(day, "gemini-3.5-flash-lite", reset));

// 429 — 하루 한도 문구면 자정까지, 아니면 1분
assert.equal(G.blockUntilFor429('{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}', t0), reset);
assert.equal(G.blockUntilFor429('{"quotaId":"GenerateRequestsPerMinute"}', t0), t0 + 60_000);
const blocked = { models: { "gemini-3.5-flash-lite": { day: G.geminiQuotaDay(t0), count: 1, minute: 0, minuteCount: 0, blockedUntil: t0 + 60_000 } } };
assert.equal(G.takeSlot(blocked, "gemini-3.5-flash-lite", t0), null);
assert.ok(G.takeSlot(blocked, "gemini-3.5-flash-lite", t0 + 61_000));

// 망가진 저장값 → 빈 상태
assert.equal(G.parseQuota("{깨짐"), null);
assert.equal(G.parseQuota('{"models":{"bad":{"count":-1}}}'), null);
assert.ok(G.takeSlot({...day, models:{...day.models, 'gemini-3.5-flash-lite':{...day.models['gemini-3.5-flash-lite'],count:499}}}, 'gemini-3.5-flash-lite', t0));
// Adjacent wall-clock minutes still share the same rolling 60-second limit.
assert.equal(G.takeSlot(st, 'gemini-3.5-flash-lite', t0+50000), null);
// Background automation yields to recent interactive requests across models,
// then can use the full remaining daily allowance; there is no reserved percentage.
assert.equal(G.takeSlot(st, 'gemini-3.1-flash-lite', t0+1000, 'background'), null);
assert.ok(G.takeSlot(st, 'gemini-3.1-flash-lite', t0+31000, 'background'));
const unknownDb={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:{message:'unavailable'}})})};
assert.ok((await G.readGeminiUsage(unknownDb,t0)).every(x=>x.used===null),'failed reads must not pretend zero usage');
console.log("test-gemini-gate: all passed");
