// node --import ./scripts/_ts-resolve.mjs scripts/test-subscribe-free-ship.mjs
import assert from "node:assert/strict";
import {
  parseSubscribeFreeShip,
  isSubscribeFreeShipActive,
  applySubscribeWaiver,
  judgeSubscribeShot,
  parseAiJudge,
  defaultSubscribeWindow,
  SUBSCRIBE_FREE_SHIP_KEY,
} from "../lib/subscribeFreeShip.ts";
import { shippingFeeByGroup, calculateShippingBreakdown, expectedMinimumShipping, EMPTY_PAID_SHIPPING_GROUPS } from "../lib/shippingGroups.ts";

// 설정 못 읽으면 꺼짐
assert.equal(parseSubscribeFreeShip(null).enabled, false);
assert.equal(parseSubscribeFreeShip("{망가짐").enabled, false);
assert.deepEqual(parseSubscribeFreeShip({}).groups, ["normal"]);

const cfg = parseSubscribeFreeShip([{ key: SUBSCRIBE_FREE_SHIP_KEY, value: JSON.stringify({
  enabled: true, startAt: "2026-11-01T11:00:00.000Z", endAt: "2026-11-01T14:59:00.000Z",
  groups: ["normal", "vendor", "모름"], waiveRemote: false, channelName: "나야루루", exampleUrl: "javascript:alert(1)",
}) }]);
assert.deepEqual(cfg.groups, ["normal", "vendor"]);
assert.equal(cfg.exampleUrl, "/subscribe-example-v2.jpg"); // 이상한 주소는 기본 사진
assert.equal(parseSubscribeFreeShip(JSON.stringify({ exampleUrl: "/subscribe-example.jpg" })).exampleUrl, "/subscribe-example-v2.jpg"); // 옛 기본 사진 → 새 사진

// 시간 창
assert.equal(isSubscribeFreeShipActive(cfg, new Date("2026-11-01T12:00:00Z")), true);
assert.equal(isSubscribeFreeShipActive(cfg, new Date("2026-11-01T10:59:00Z")), false);
assert.equal(isSubscribeFreeShipActive(cfg, new Date("2026-11-01T15:00:00Z")), false);
assert.equal(isSubscribeFreeShipActive({ ...cfg, enabled: false }, new Date("2026-11-01T12:00:00Z")), false);
assert.equal(isSubscribeFreeShipActive({ ...cfg, groups: [] }, new Date("2026-11-01T12:00:00Z")), false);

// 금액: 일반 4,000 / 제주 7,000 · 업체 4,000 / 업체 제주 7,000 · 해외 8,000
const settings = { normalFee: 4000, normalRemoteFee: 7000, vendorFee: 4000, vendorRemoteFee: 7000, overseasFee: 8000 };
const base = shippingFeeByGroup(settings, false);
const remote = shippingFeeByGroup(settings, true);
// 일반·업체1 무료 고름, 해외는 안 고름
let fees = applySubscribeWaiver(base, base, cfg);
assert.equal(fees.normal, 0);
assert.equal(fees.vendor, 0);
assert.equal(fees.vendor2, 4000);
assert.equal(fees.overseas, 8000);
let b = calculateShippingBreakdown(["normal", "vendor", "overseas"], EMPTY_PAID_SHIPPING_GROUPS, fees);
assert.equal(b.totalShippingFee, 8000);
// 제주: 추가금(3,000)은 받음
fees = applySubscribeWaiver(remote, base, cfg);
assert.equal(fees.normal, 3000);
assert.equal(fees.vendor, 3000);
// 제주 추가금도 무료
fees = applySubscribeWaiver(remote, base, { ...cfg, waiveRemote: true });
assert.equal(fees.normal, 0);
// 서버 최소 배송비: 고른 갈래는 0으로 빠짐
const waivedSettings = { ...settings, normalFee: 0, normalRemoteFee: 0, vendorFee: 0, vendorRemoteFee: 0 };
assert.equal(expectedMinimumShipping(["normal", "vendor", "overseas"], waivedSettings), 8000);

// AI 판정 — 코드가 판단
assert.equal(judgeSubscribeShot({ is_youtube: true, channel_name: "@나야루루", button_text: "구독중", button_belongs: true, clear: true }, "나야루루").ok, true);
assert.equal(judgeSubscribeShot({ is_youtube: true, channel_name: "나야 루루", button_text: "구독 중", button_belongs: true, clear: true }, "나야루루").ok, true);
assert.equal(judgeSubscribeShot({ is_youtube: true, channel_name: "다른채널", button_text: "구독중", button_belongs: true, clear: true }, "나야루루").ok, false);
assert.equal(judgeSubscribeShot({ is_youtube: true, channel_name: "나야루루", button_text: "구독", button_belongs: true, clear: true }, "나야루루").ok, false);
assert.equal(judgeSubscribeShot({ is_youtube: true, channel_name: "나야루루", button_text: "구독중", button_belongs: false, clear: true }, "나야루루").ok, false);
assert.equal(judgeSubscribeShot({ is_youtube: true, channel_name: "나야루루", button_text: "구독중", button_belongs: true, clear: false }, "나야루루").ok, false);
assert.equal(judgeSubscribeShot({ is_youtube: false }, "나야루루").ok, false);
assert.equal(judgeSubscribeShot(null, "나야루루").ok, false);
assert.match(judgeSubscribeShot({ is_youtube: true, channel_name: "다른채널", button_text: "구독중" }, "나야루루").reason, /나야루루/);
assert.deepEqual(parseAiJudge('```json\n{"is_youtube":true}\n```'), { is_youtube: true });
assert.equal(parseAiJudge("모름"), null);

// 기본 시간 = 지금 ~ 오늘 23:59(한국)
const w = defaultSubscribeWindow(new Date("2026-11-01T11:15:00Z")); // 한국 20:15
assert.equal(w.endAt, "2026-11-01T14:59:00.000Z");
const w2 = defaultSubscribeWindow(new Date("2026-11-01T16:00:00Z")); // 한국 11/2 01:00
assert.equal(w2.endAt, "2026-11-02T14:59:00.000Z");

// 서버 판단(가짜 DB): 혜택 켜짐 + 인증됨일 때만 설정을 돌려줌, 못 읽으면 null(배송비 그대로)
const { activeSubscribeWaiverFor } = await import("../lib/subscribeFreeShipServer.ts");
const fakeDb = ({ setting, verifiedKakao, broken = false }) => ({
  from(table) {
    const q = { filters: {} };
    const chain = {
      select() { return chain; },
      eq(k, v) { q.filters[k] = v; return chain; },
      limit() { return Promise.resolve(broken ? { data: null, error: { message: "no table" } } : { data: table === "subscribe_verifications" && q.filters.kakao_id === verifiedKakao && q.filters.status === "verified" ? [{ id: 1 }] : [], error: null }); },
      maybeSingle() { return Promise.resolve({ data: setting ? { key: "subscribe_free_ship_v1", value: JSON.stringify(setting) } : null, error: null }); },
    };
    return chain;
  },
});
const on = { enabled: true, startAt: "2026-11-01T11:00:00Z", endAt: "2026-11-01T14:59:00Z", groups: ["normal"] };
const at = new Date("2026-11-01T12:00:00Z");
assert.ok(await activeSubscribeWaiverFor(fakeDb({ setting: on, verifiedKakao: "k1" }), "k1", at));
assert.equal(await activeSubscribeWaiverFor(fakeDb({ setting: on, verifiedKakao: "k1" }), "k2", at), null); // 인증 안 한 손님
assert.equal(await activeSubscribeWaiverFor(fakeDb({ setting: on, verifiedKakao: "k1" }), "", at), null); // 카카오 없음
assert.equal(await activeSubscribeWaiverFor(fakeDb({ setting: on, verifiedKakao: "k1" }), "k1", new Date("2026-11-01T15:30:00Z")), null); // 시간 밖
assert.equal(await activeSubscribeWaiverFor(fakeDb({ setting: { ...on, enabled: false }, verifiedKakao: "k1" }), "k1", at), null); // 꺼짐
assert.equal(await activeSubscribeWaiverFor(fakeDb({ setting: null, verifiedKakao: "k1" }), "k1", at), null); // 설정 없음
assert.equal(await activeSubscribeWaiverFor(fakeDb({ setting: on, verifiedKakao: "k1", broken: true }), "k1", at), null); // 표 없음(SQL 전)

console.log("test-subscribe-free-ship OK");
