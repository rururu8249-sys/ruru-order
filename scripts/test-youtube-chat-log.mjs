// scripts/test-youtube-chat-log.mjs — 유튜브 채팅 기록(주문 같은 말 판정·닉네임 맞추기·의심 목록·저장 줄 변환) 순수 검사
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const load = createUiLoader();
const { chatNickKey, orderLikeReasons, chatLogRowFromApi, nickMatches, findSuspects, similarAuthors } = load("lib/youtubeChatLog.ts");

// 닉네임 맞추기 키
assert.equal(chatNickKey("@루루맘-f2h"), "루루맘");
assert.equal(chatNickKey("  루루 맘 "), "루루맘");
assert.equal(chatNickKey("@Lucy_Kim"), "lucykim");
assert.equal(nickMatches("루루맘", "루루맘"), true);
assert.equal(nickMatches("루루맘", "루루맘가방"), true);
assert.equal(nickMatches("a", "abc"), false);

// 주문 같은 말
const yes = [
  "저요", "MX-101 블랙 M 주세요", "mx101 하나요", "509 블랙 M", "235 저도요", "카결할게요", "입금했어요",
  "버버리 가디건 주문이요", "프라다 콜", "찜이요", "240 브라운 살게요",
];
for (const t of yes) assert.equal(orderLikeReasons(t).orderLike, true, `주문 같은 말이어야 함: ${t}`);
const no = ["언니 예뻐요", "안녕하세요", "오늘 날씨 춥네요", "ㅋㅋㅋㅋ", "160에 50인데 몇 입어요?", "다음 방송 언제해요"];
for (const t of no) assert.equal(orderLikeReasons(t).orderLike, false, `수다여야 함: ${t}`);
assert.deepEqual(orderLikeReasons("MX-101 블랙 주세요").reasons.slice(0, 2), ["MX-101", "주세요"]);

// 유튜브 응답 → 저장 줄
const ctx = { broadcastId: "bc1", liveChatId: "lc1", botChannelId: "BOT" };
const row = chatLogRowFromApi({ id: "m1", snippet: { publishedAt: "2026-11-27T12:00:01Z", displayMessage: "509 블랙 M 주세요" }, authorDetails: { displayName: "@루루맘-f2h", channelId: "UC1" } }, ctx);
assert.equal(row.message_id, "m1"); assert.equal(row.author_name, "@루루맘-f2h"); assert.equal(row.order_like, true); assert.equal(row.is_bot, false);
const owner = chatLogRowFromApi({ id: "m2", snippet: { publishedAt: "2026-11-27T12:00:02Z", displayMessage: "주문서 제출해 주세요" }, authorDetails: { displayName: "나야루루", channelId: "OWN", isChatOwner: true } }, ctx);
assert.equal(owner.is_owner, true); assert.equal(owner.order_like, false, "사장님 글은 강조 안 함");
const bot = chatLogRowFromApi({ id: "m3", snippet: { publishedAt: "2026-11-27T12:00:03Z", displayMessage: "🛒 루루맘님 주문 감사합니다" }, authorDetails: { displayName: "주문Ai", channelId: "BOT" } }, ctx);
assert.equal(bot.is_bot, true); assert.equal(bot.order_like, false);
assert.equal(chatLogRowFromApi({ id: "", snippet: {} }, ctx), null);
assert.equal(chatLogRowFromApi({ id: "x", snippet: { publishedAt: "nope" } }, ctx), null);

// 의심 목록 — 주문 같은 말 했는데 주문서에 같은 닉네임 없음
const msgs = [
  { author_name: "@루루맘-f2h", channel_id: "UC1", message: "509 블랙 M 주세요", published_at: "2026-11-27T12:00:01Z", is_owner: false, is_bot: false, order_like: true },
  { author_name: "@꽃님이", channel_id: "UC2", message: "저요 저요", published_at: "2026-11-27T12:01:00Z", is_owner: false, is_bot: false, order_like: true },
  { author_name: "@꽃님이", channel_id: "UC2", message: "235 브라운 살게요", published_at: "2026-11-27T12:05:00Z", is_owner: false, is_bot: false, order_like: true },
  { author_name: "@수다쟁이", channel_id: "UC3", message: "언니 예뻐요", published_at: "2026-11-27T12:02:00Z", is_owner: false, is_bot: false, order_like: false },
  { author_name: "@채널손님", channel_id: "UC4", message: "MX-101 주세요", published_at: "2026-11-27T12:03:00Z", is_owner: false, is_bot: false, order_like: true },
  { author_name: "@꽃님", channel_id: "UC5", message: "저요", published_at: "2026-11-27T12:04:00Z", is_owner: false, is_bot: false, order_like: true },
];
const sus = findSuspects({ messages: msgs, orderNicks: ["루루맘", "꽃님이네"], orderChannelIds: ["UC4"] });
assert.deepEqual(sus.map((s) => s.author), ["@꽃님이", "@꽃님"], "주문서 있는 루루맘·채널 연결 손님·수다는 빠짐");
assert.equal(sus[0].orderLikeCount, 2);
assert.equal(sus[0].firstAt, "2026-11-27T12:01:00Z");
assert.deepEqual(sus[0].similar, ["꽃님이네"], "비슷한 주문 닉네임은 힌트로");
assert.deepEqual(sus[1].similar, ["꽃님이네"]);

const au = [
  { author: "@루루맘-f2h", count: 5 }, { author: "@루루 맘♡", count: 3 }, { author: "@루루맘마", count: 2 },
  { author: "@루리맘", count: 1 }, { author: "@꽃님이", count: 9 }, { author: "@루", count: 4 },
];
const sim = similarAuthors("루루맘", au);
assert.deepEqual(sim.map((x) => x.author), ["@루루맘-f2h", "@루루 맘♡", "@루루맘마", "@루리맘"], "꼬리표·공백·하트·한 글자 차이");
assert.equal(sim[0].same, true); assert.equal(sim[1].same, true); assert.equal(sim[2].same, false);
assert.deepEqual(similarAuthors("루", au), [], "한 글자는 안 찾음");
assert.deepEqual(similarAuthors("꽃님", au).map((x) => x.author), ["@꽃님이"]);
console.log("test-youtube-chat-log OK");
