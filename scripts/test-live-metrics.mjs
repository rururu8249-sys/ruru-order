// scripts/test-live-metrics.mjs — 방송 1분 기록(상품번호 뽑기·같은 1분 덮어쓰기·순환 상태) + 방송 흐름 분석 순수 검사
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const load = createUiLoader();
const { extractCodes, codeOfName, appendSample, rotationStateOf, minuteIso } = load("lib/liveMetrics.ts");
const { buildBroadcastFlow } = load("lib/broadcastFlow.ts");

assert.deepEqual(extractCodes("mx101 블랙 m 하나요 MX-101"), ["MX-101"]);
assert.deepEqual(extractCodes("PD 202 이랑 bb-78"), ["PD-202", "BB-78"]);
assert.equal(codeOfName("MX-101 브라운"), "MX-101");
assert.equal(codeOfName("니트 가디건"), "");
let list = appendSample([], { t: "2026-11-09T11:20:00.000Z", v: 10, l: 1, s: 3, c: 2, k: {}, r: null });
list = appendSample(list, { t: "2026-11-09T11:20:00.000Z", v: 12, l: 1, s: 3, c: 2, k: {}, r: null });
assert.equal(list.length, 1); assert.equal(list[0].v, 12);
assert.deepEqual(rotationStateOf({ mode: "all", paused: false, targets: [] }), { m: "all" });
assert.deepEqual(rotationStateOf({ mode: "selected", paused: false, targets: [{ productId: 818, detailName: "MX-101 브라운" }] }), { m: "pick", ids: [{ p: "818", d: "MX-101 브라운" }] });
assert.deepEqual(rotationStateOf({ mode: "selected", paused: true, targets: [] }), { m: "paused" });
assert.equal(minuteIso(Date.parse("2026-11-09T11:20:42.123Z")), "2026-11-09T11:20:00.000Z");

// 방송 흐름: 0~10분 소개 MX-101, 10~20분 MX-102·103 골라서 순환, 20~30분 전체 순환(확인 안 됨)
const S = Date.parse("2026-11-09T11:00:00.000Z"), M = 60000;
const samples = [];
for (let i = 0; i < 30; i++) samples.push({ t: new Date(S + i * M).toISOString(), v: 20 + i, l: 0, s: 5, c: i < 10 ? 2 : 0, k: i < 10 ? { "MX-101": 1 } : {}, r: i < 10 ? { m: "all" } : i < 20 ? { m: "pick", ids: [{ p: "818", d: "MX-102 블랙" }, { p: "818", d: "MX-103 브라운" }] } : { m: "all" } });
const r = buildBroadcastFlow({
  startMs: S, endMs: S + 30 * M, samples,
  intros: [{ at: S, productId: "818", productName: "막스마라", detailName: "MX-101 브라운", cleared: false }, { at: S + 10 * M, productId: "", productName: "", detailName: "", cleared: true }],
  orders: [
    { at: S + 2 * M, productId: "818", productName: "MX-101 브라운", qty: 2, goods: 840000, paid: true, buyer: "a" },
    { at: S + 12 * M, productId: "818", productName: "MX-103 브라운", qty: 1, goods: 390000, paid: false, buyer: "b" },
    { at: S + 25 * M, productId: "900", productName: "니트 가디건", qty: 1, goods: 50000, paid: true, buyer: "c" },
  ],
  productNames: { "818": "막스마라", "900": "니트 가디건" },
});
assert.deepEqual(r.segments.map((s) => [s.kind, s.minutes]), [["intro", 10], ["pick", 10], ["unknown", 10]]);
assert.equal(r.segments[0].ordersMine, 2); assert.equal(r.segments[0].goodsMine, 840000);
assert.equal(r.segments[1].ordersMine, 1); assert.equal(r.segments[1].goodsMine, 0, "미결제는 금액에 안 넣음");
assert.equal(r.segments[0].viewerStart, 20); assert.equal(r.segments[0].viewerEnd, 29);
const mx101 = r.products.find((p) => p.label === "MX-101 브라운");
assert.equal(mx101.introMinutes, 10); assert.equal(mx101.chatMentions, 10); assert.equal(mx101.qty, 2);
const knit = r.products.find((p) => p.label === "니트 가디건");
assert.equal(knit.introMinutes, 0); assert.equal(knit.qty, 1);
assert.ok(r.findings.some((f) => f.includes("소개·순환 안 했는데 팔린 상품: 니트 가디건")));
assert.ok(r.findings.some((f) => f.includes("소개 10분 · 고른 상품 순환 10분 · 확인 안 됨 10분")));
assert.ok(r.findings.some((f) => f.includes("MX-102 블랙")) || r.products.some((p) => p.label === "MX-102 블랙" && p.qty === 0 && p.pickMinutes === 10));
// 1분 기록 없는 지난 방송
const old = buildBroadcastFlow({ startMs: S, endMs: S + 5 * M, samples: [], intros: [], orders: [], productNames: {} });
assert.equal(old.hasSamples, false); assert.ok(old.nextSteps.some((x) => x.includes("1분 기록")));
console.log("test-live-metrics PASS");
