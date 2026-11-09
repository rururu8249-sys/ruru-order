// [2026-11-09] lib/liveWatch — 방송 보며 주문: 설정 읽기·유튜브 주소·누구에게·처음 화면·목록 정렬/검색
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

const load = createUiLoader({});
const L = load("lib/liveWatch.ts");

// 설정: 이상한 값은 꺼짐
assert.deepEqual(L.parseLiveWatchSetting(null), { audience: "off", firstView: "live", phones: [] });
assert.deepEqual(L.parseLiveWatchSetting("{broken"), { audience: "off", firstView: "live", phones: [] });
assert.deepEqual(L.parseLiveWatchSetting('{"audience":"admin","firstView":"shop"}'), { audience: "admin", firstView: "shop", phones: [] });
assert.deepEqual(L.parseLiveWatchSetting({ audience: "all" }), { audience: "all", firstView: "live", phones: [] });
assert.deepEqual(L.parseLiveWatchSetting({ audience: "ALL" }), { audience: "off", firstView: "live", phones: [] });
assert.equal(L.serializeLiveWatchSetting({ audience: "all", firstView: "shop", junk: 1 }), '{"audience":"all","firstView":"shop","phones":[]}');

// 유튜브 주소
const id = "dQw4w9WgXcQ";
for (const u of [
  `https://www.youtube.com/watch?v=${id}`, `https://m.youtube.com/watch?v=${id}&t=10`, `https://youtu.be/${id}?si=abc`,
  `https://www.youtube.com/live/${id}?si=x`, `https://youtube.com/shorts/${id}`, `youtube.com/embed/${id}`, id,
]) assert.equal(L.youtubeVideoIdFromUrl(u), id, u);
for (const u of ["", "https://example.com/watch?v=" + id, "https://www.youtube.com/@channel", "https://www.youtube.com/channel/UC123", "abc"]) assert.equal(L.youtubeVideoIdFromUrl(u), "", u);
const embed = L.youtubeEmbedUrl(id, "https://ruru-order.vercel.app");
assert.ok(embed.startsWith(`https://www.youtube.com/embed/${id}?`));
for (const k of ["autoplay=1", "mute=1", "playsinline=1", "enablejsapi=1", "origin=https%3A%2F%2Fruru-order.vercel.app"]) assert.ok(embed.includes(k), k);
assert.deepEqual(JSON.parse(L.youtubeCommand("unMute")), { event: "command", func: "unMute", args: [] });

// 누구에게
const base = { broadcastOn: true, videoId: id, isAdminViewer: false };
assert.equal(L.canUseLiveWatch({ ...base, setting: { audience: "off", firstView: "live", phones: [] } }), false);
assert.equal(L.canUseLiveWatch({ ...base, setting: { audience: "admin", firstView: "live", phones: [] } }), false);
assert.equal(L.canUseLiveWatch({ ...base, isAdminViewer: true, setting: { audience: "admin", firstView: "live", phones: [] } }), true);
assert.equal(L.canUseLiveWatch({ ...base, setting: { audience: "all", firstView: "live", phones: [] } }), true);
assert.equal(L.canUseLiveWatch({ ...base, broadcastOn: false, setting: { audience: "all", firstView: "live", phones: [] } }), false);
assert.equal(L.canUseLiveWatch({ ...base, videoId: "", setting: { audience: "all", firstView: "live", phones: [] } }), false);

// 처음 화면 — 손님이 고른 게 우선
assert.equal(L.initialLiveView({ audience: "all", firstView: "live", phones: [] }, null), true);
assert.equal(L.initialLiveView({ audience: "all", firstView: "shop", phones: [] }, null), false);
assert.equal(L.initialLiveView({ audience: "all", firstView: "live", phones: [] }, "shop"), false);
assert.equal(L.initialLiveView({ audience: "all", firstView: "shop", phones: [] }, "live"), true);

// 목록: 소개 중 맨 위·검색 띄어쓰기/하이픈 무시
const items = [
  { id: "1", name: "MC-321 패딩", imageUrl: "", priceText: "", soldOut: false, pinned: false },
  { id: "2", name: "폴로 자켓", imageUrl: "", priceText: "", soldOut: false, pinned: true },
  { id: "3", name: "PD-202 코트", imageUrl: "", priceText: "", soldOut: true, pinned: false },
];
assert.deepEqual(L.liveWatchList(items, "").map((x) => x.id), ["2", "1", "3"]);
assert.deepEqual(L.liveWatchList(items, "mc321").map((x) => x.id), ["1"]);
assert.deepEqual(L.liveWatchList(items, "폴로자켓").map((x) => x.id), ["2"]);
assert.deepEqual(L.liveWatchList(items, "없는상품"), []);
console.log("live-watch: 통과");

// 전화번호 목록(관리자 시험 계정 밖)
{
  const st = L.parseLiveWatchSetting('{"audience":"admin","firstView":"live","phones":["010-8785-2465","x"]}');
  assert.deepEqual([...st.phones], ["01087852465"]);
  assert.equal(L.canUseLiveWatch({ setting: st, broadcastOn: true, videoId: "eicN22LaVcs", isAdminViewer: false, viewerPhone: "01087852465" }), true);
  assert.equal(L.canUseLiveWatch({ setting: st, broadcastOn: true, videoId: "eicN22LaVcs", isAdminViewer: false, viewerPhone: "01011112222" }), false);
  assert.equal(L.canUseLiveWatch({ setting: { ...st, audience: "off" }, broadcastOn: true, videoId: "eicN22LaVcs", isAdminViewer: false, viewerPhone: "01087852465" }), false);
  console.log("phones ok");
}
