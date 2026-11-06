// 두 번째 채널 주문 알림 — 가짜 Supabase(REST)·가짜 유튜브로 실제 lib/youtube 실행
import assert from "node:assert/strict";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake.supabase";
process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
process.env.YOUTUBE_CLIENT_ID = "c";
process.env.YOUTUBE_CLIENT_SECRET = "s";

const settings = new Map();
let broadcasts = [];
const posted = []; // {chatId, text}
let videosCalls = 0;
let failChat = new Set();
const chatOf = { MAINVIDEO01: "chat-main", SECONDVID01: "chat-second" };

function resp(body, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = (init.method || "GET").toUpperCase();
  const single = String(init.headers?.Accept || init.headers?.accept || (init.headers instanceof Headers ? init.headers.get("accept") : "") || "").includes("pgrst.object");
  if (url.host === "fake.supabase") {
    const table = url.pathname.split("/").pop();
    const eq = (k) => { const v = url.searchParams.get(k); return v && v.startsWith("eq.") ? decodeURIComponent(v.slice(3)) : null; };
    if (table === "settings") {
      const key = eq("key");
      if (method === "GET") {
        const rows = settings.has(key) ? [{ key, value: settings.get(key) }] : [];
        return resp(single ? (rows[0] ?? null) : rows);
      }
      const body = JSON.parse(init.body || "{}");
      if (method === "POST") { settings.set(body.key, body.value); return resp([]); }
      if (method === "PATCH") { settings.set(key, body.value); return resp([]); }
    }
    if (table === "youtube_integration") return resp(single ? { refresh_token: "r" } : [{ refresh_token: "r" }]);
    if (table === "broadcasts") {
      const on = broadcasts.filter((b) => b.status === "ON");
      return resp(single ? (on[0] ?? null) : on);
    }
    return resp([]);
  }
  if (url.host === "oauth2.googleapis.com") return resp({ access_token: "a" });
  if (url.pathname.endsWith("/videos")) {
    videosCalls += 1;
    const id = url.searchParams.get("id");
    return resp({ items: chatOf[id] ? [{ liveStreamingDetails: { activeLiveChatId: chatOf[id] } }] : [] });
  }
  if (url.pathname.endsWith("/liveChat/messages")) {
    const b = JSON.parse(init.body);
    const chatId = b.snippet.liveChatId;
    if (failChat.has(chatId)) return resp({ error: { errors: [{ reason: "forbidden" }] } }, 403);
    posted.push({ chatId, text: b.snippet.textMessageDetails.messageText });
    return resp({ snippet: {} });
  }
  if (url.pathname.endsWith("/liveBroadcasts")) return resp({ items: [] });
  throw new Error("unexpected " + url);
};

const Y = await import("../lib/youtube.ts");

// 파싱
assert.equal(Y.parseSecondLive(""), null);
assert.equal(Y.parseSecondLive("{bad"), null);
assert.deepEqual(Y.parseSecondLive(JSON.stringify({ broadcastId: "b1", url: "https://www.youtube.com/live/SECONDVID01" })), { broadcastId: "b1", url: "https://www.youtube.com/live/SECONDVID01", videoId: "SECONDVID01", chatId: "" });

settings.set("youtube_notify_enabled", "true");
broadcasts = [{ id: "b1", status: "ON", youtube_live_url: "https://www.youtube.com/watch?v=MAINVIDEO01" }];

// 1) 두 번째 채널 없음 → 메인만
let r = await Y.postOrderChatEverywhere("🛒 테스트1");
assert.equal(r.main.ok, true);
assert.equal(r.second.skipped, true);
assert.deepEqual(posted.map((p) => p.chatId), ["chat-main"]);

// 2) 두 번째 채널 있음 → 두 곳, 두 번째 채팅방 번호는 한 번만 찾음
settings.set(Y.SETTING_SECOND_LIVE, JSON.stringify({ broadcastId: "b1", url: "https://youtu.be/SECONDVID01", videoId: "SECONDVID01", chatId: "" }));
posted.length = 0; videosCalls = 0;
await Y.postOrderChatEverywhere("🛒 테스트2");
await Y.postOrderChatEverywhere("🛒 테스트3");
assert.deepEqual(posted, [
  { chatId: "chat-main", text: "🛒 테스트2" }, { chatId: "chat-second", text: "🛒 테스트2" },
  { chatId: "chat-main", text: "🛒 테스트3" }, { chatId: "chat-second", text: "🛒 테스트3" },
]);
assert.equal(JSON.parse(settings.get(Y.SETTING_SECOND_LIVE)).chatId, "chat-second");
assert.ok(videosCalls <= 2, "메인 1 + 두번째 1 이하: " + videosCalls);

// 3) 두 번째 채팅 실패 → 메인 채팅방으로 대신 올리지 않음, 번호 비움
failChat.add("chat-second");
posted.length = 0;
r = await Y.postOrderChatEverywhere("🛒 테스트4");
assert.equal(r.main.ok, true);
assert.equal(r.second.ok, false);
assert.deepEqual(posted.map((p) => p.chatId), ["chat-main"]);
assert.equal(JSON.parse(settings.get(Y.SETTING_SECOND_LIVE)).chatId, "");
failChat.clear();

// 4) 방송이 바뀌면 두 번째 채널 안 씀
broadcasts = [{ id: "b2", status: "ON", youtube_live_url: "https://www.youtube.com/watch?v=MAINVIDEO01" }];
posted.length = 0;
r = await Y.postOrderChatEverywhere("🛒 테스트5");
assert.equal(r.second.skipped, true);
assert.deepEqual(posted.map((p) => p.chatId), ["chat-main"]);

// 5) 메인과 같은 영상이면 두 번 안 올림
settings.set(Y.SETTING_SECOND_LIVE, JSON.stringify({ broadcastId: "b2", url: "MAINVIDEO01", videoId: "MAINVIDEO01", chatId: "chat-main" }));
posted.length = 0;
await Y.postOrderChatEverywhere("🛒 테스트6");
assert.equal(posted.length, 1);

// 6) 알림 OFF → 둘 다 안 올림
settings.set("youtube_notify_enabled", "false");
settings.set(Y.SETTING_SECOND_LIVE, JSON.stringify({ broadcastId: "b2", url: "SECONDVID01", videoId: "SECONDVID01", chatId: "chat-second" }));
posted.length = 0;
r = await Y.postOrderChatEverywhere("🛒 테스트7");
assert.equal(posted.length, 0);
assert.equal(r.second.skipped, true);

console.log("✅ test-second-live-chat 통과");
