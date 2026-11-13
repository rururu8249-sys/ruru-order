// [2026-11-13] Gemini 무료 한도 중앙 관리 — 분당·하루 상한(여유 10%)·표에 없는 모델·429 막기·날짜 바뀜
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const G = createUiLoader({})("lib/geminiGate.ts");

const t0 = Date.parse("2026-11-13T05:00:10Z"); // 한국 14:00 · 미국 서부 11/12 21:00
assert.equal(G.capsOf("gemini-3.5-flash-lite").rpm, 13);
assert.equal(G.capsOf("gemini-3.5-flash-lite").rpd, 450);
assert.equal(G.capsOf("gemini-3.8-flash").rpd, 18);
assert.equal(G.capsOf("gemini-flash-latest"), null);
assert.equal(G.takeSlot({ models: {} }, "gemini-flash-latest", t0), null); // 모르는 모델은 안 부름

// 분당 13번까지
let st = { models: {} };
for (let i = 0; i < 13; i += 1) { st = G.takeSlot(st, "gemini-3.5-flash-lite", t0); assert.ok(st); }
assert.equal(G.takeSlot(st, "gemini-3.5-flash-lite", t0), null);
assert.ok(G.takeSlot(st, "gemini-3.5-flash-lite", t0 + 60_000)); // 다음 분엔 됨
assert.ok(G.takeSlot(st, "gemini-3.1-flash-lite", t0)); // 모델마다 따로

// 하루 450번 → 막힘, 미국 서부 날짜 바뀌면 다시
let day = { models: { "gemini-3.5-flash-lite": { day: G.geminiQuotaDay(t0), count: 450, minute: 0, minuteCount: 0, blockedUntil: 0 } } };
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
assert.deepEqual(G.parseQuota("{깨짐"), { models: {} });
console.log("test-gemini-gate: all passed");
