// scripts/test-live-metrics-chat-log.mjs — 1분 기록기가 유튜브 채팅을 youtube_chat_log 에 저장하는지(가짜 DB·가짜 유튜브)
//   ① 처음 읽기: 글 전부 저장·다음 쪽 번호 저장·손님 글만 셈 ② 다음 1분: 쪽 번호로 이어 읽기 ③ 저장 실패: 쪽 번호 안 넘김
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

const settings = new Map();
const saved = [];
let failUpsert = false;
const sb = {
  from(table) {
    const q = {
      _t: table,
      select() { return q; }, eq() { return q; }, neq() { return q; }, order() { return q; }, limit() { return q; }, gte() { return q; },
      async maybeSingle() { return { data: { id: "bc-1", youtube_live_url: "https://youtube.com/live/VIDEO1", started_at: "2026-11-27T10:00:00Z", status: "ON" } }; },
      then(res) { return res({ count: 3 }); },
      async upsert(rows, opts) {
        assert.equal(table, "youtube_chat_log"); assert.equal(opts.onConflict, "message_id"); assert.equal(opts.ignoreDuplicates, true);
        if (failUpsert) return { error: { message: "fail" } };
        for (const r of rows) if (!saved.some((s) => s.message_id === r.message_id)) saved.push(r);
        return { error: null };
      },
    };
    return q;
  },
};
const fetchCalls = [];
let page = 0;
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  fetchCalls.push(u);
  if (u.pathname.endsWith("/videos")) return { ok: true, json: async () => ({ items: [{ liveStreamingDetails: { concurrentViewers: "12", activeLiveChatId: "LC1" }, statistics: { likeCount: "3" } }] }) };
  page += 1;
  const at = (s) => `2026-11-27T12:0${page}:${s}Z`;
  return { ok: true, json: async () => ({
    nextPageToken: `TOKEN${page}`,
    items: [
      { id: `p${page}-a`, snippet: { publishedAt: at("10"), displayMessage: "509 블랙 M 주세요" }, authorDetails: { displayName: "@루루맘", channelId: "UC1" } },
      { id: `p${page}-b`, snippet: { publishedAt: at("20"), displayMessage: "언니 예뻐요" }, authorDetails: { displayName: "@꽃님", channelId: "UC2" } },
      { id: `p${page}-c`, snippet: { publishedAt: at("30"), displayMessage: "주문서 내 주세요" }, authorDetails: { displayName: "나야루루", channelId: "OWN", isChatOwner: true } },
    ],
  }) };
};
const load = createUiLoader({
  "@/lib/youtube": {
    getServiceClient: () => sb,
    readSetting: async (_sb, k) => settings.get(k) || "",
    writeSetting: async (_sb, k, v) => { settings.set(k, v); },
    readRefreshToken: async () => "RT",
    getAccessToken: async () => "AT",
    extractVideoId: (u) => (String(u).includes("VIDEO1") ? "VIDEO1" : ""),
  },
});
const { recordLiveMetricsTick } = load("lib/liveMetricsServer.ts");

// ①
let r = await recordLiveMetricsTick(Date.parse("2026-11-27T12:01:40Z"));
assert.equal(r.ok, true, JSON.stringify(r));
assert.equal(saved.length, 3, "사장님 글 포함 전부 저장");
assert.equal(saved.find((s) => s.message_id === "p1-a").order_like, true);
assert.equal(saved.find((s) => s.message_id === "p1-c").is_owner, true);
assert.equal(saved[0].broadcast_id, "bc-1");
assert.equal(settings.get("live_metrics_chat_pt:bc-1"), "LC1|TOKEN1");
assert.equal(r.sample.c, 2, "세기는 손님 글만");
assert.equal(r.sample.k["509"] ?? r.sample.k["M-509"], undefined);

// ② 다음 1분 — 쪽 번호로 이어 읽기
r = await recordLiveMetricsTick(Date.parse("2026-11-27T12:02:40Z"));
const chatCall = fetchCalls.filter((u) => u.pathname.endsWith("/messages")).at(-1);
assert.equal(chatCall.searchParams.get("pageToken"), "TOKEN1");
assert.equal(saved.length, 6);
assert.equal(settings.get("live_metrics_chat_pt:bc-1"), "LC1|TOKEN2");

// ③ 저장 실패 → 쪽 번호 그대로(다음에 다시 받음)
failUpsert = true;
r = await recordLiveMetricsTick(Date.parse("2026-11-27T12:03:40Z"));
assert.equal(r.ok, true, "채팅 저장 실패해도 기록기는 계속");
assert.equal(settings.get("live_metrics_chat_pt:bc-1"), "LC1|TOKEN2");
console.log("test-live-metrics-chat-log OK");
