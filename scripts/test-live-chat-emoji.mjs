// [2026-11-10] lib/liveChatEmoji — 채팅 이모티콘: 설정 읽기·이름·«:이름:»→표식·5개 상한·표식 흉내 막기·조각 나누기·자격 판정
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

const load = createUiLoader({});
const E = load("lib/liveChatEmoji.ts");
const C = load("lib/liveChat.ts");

// 설정 기본값 = 누적 구매 100만원
const d = E.parseChatEmojiSetting(null);
assert.equal(d.access, "amount");
assert.equal(d.minAmount, 1000000);
assert.equal(d.items.length, 0);

const items = [
  { id: "aaaa1111", name: "동실장", url: "https://x/a.webp", on: true },
  { id: "bbbb2222", name: "루루업", url: "https://x/b.webp", on: true },
  { id: "cccc3333", name: "꺼짐", url: "https://x/c.webp", on: false },
];
const st = E.parseChatEmojiSetting(JSON.stringify({ items: [...items, { id: "x", name: "bad", url: "https://x" }, { id: "dddd4444", name: "동실장", url: "https://x/d" }, { id: "eeee5555", name: "http", url: "http://not-https" }], access: "list", minAmount: "-5", period: "1y" }));
assert.deepEqual(st.items.map((e) => e.name), ["동실장", "루루업", "꺼짐"]); // 이상한 아이디·겹친 이름·http 는 버림
assert.equal(st.access, "list");
assert.equal(st.minAmount, 1000000);
assert.equal(st.period, "1y");

// 이름
assert.equal(E.isEmojiName("ㅋㅋㅋ"), true);
assert.equal(E.isEmojiName("루루 업"), false);
assert.equal(E.isEmojiName("가나다라마바사아자차카"), false);
assert.equal(E.uniqueEmojiName("동실장", ["동실장", "동실장2"]), "동실장3");
assert.equal(E.uniqueEmojiName("", []), "이모티콘");
assert.equal(E.emojiNameFrom("루루 UP!.png"), "루루UP");

// 글자 → 표식(켜진 것만, 5개까지)
const enc = E.encodeEmojiTokens("안녕 :동실장: :꺼짐: :없는거: :루루업:", items);
assert.equal(enc.count, 2);
assert.equal(E.chatBodyAsText(enc.text), "안녕 :동실장: :꺼짐: :없는거: :루루업:");
const parts = E.splitChatBody(enc.text);
assert.deepEqual(parts.filter((p) => p.type === "emoji").map((p) => p.id), ["aaaa1111", "bbbb2222"]);
const six = E.encodeEmojiTokens(":동실장:".repeat(6), items);
assert.equal(six.count, 5);
assert.equal(E.countEmojiTokens(":동실장::루루업::꺼짐:", items), 2);
// 자동 안내용 — 이모티콘 빼고 글자만
assert.equal(E.chatBodyWithoutEmoji(E.encodeEmojiTokens(":동실장: 509 얼마", items).text), "509 얼마");
assert.equal(E.chatBodyWithoutEmoji(E.encodeEmojiTokens(":동실장::루루업:", items).text), "");

// 손님이 표식을 흉내 내도 서버 다듬기에서 지워짐
const fake = "aaaa1111:동실장 안녕";
assert.equal(C.cleanChatBody(fake), "aaaa1111:동실장 안녕");
assert.equal(E.splitChatBody(C.cleanChatBody(fake)).some((p) => p.type === "emoji"), false);
// 저장된 표식 글은 화면 읽기(parseChatMessage)에서 잘리지 않음(100글자 넘어도)
const long = E.encodeEmojiTokens(("가".repeat(60)) + ":동실장:".repeat(5), items).text;
assert.ok(long.length > 100);
assert.equal(C.parseChatMessage({ id: 1, broadcast_id: "b", nickname: "n", body: long }).body, long);

// 자격 판정
const amount = E.parseChatEmojiSetting({ access: "amount", minAmount: 1000000 });
assert.equal(E.emojiAllowed({ setting: amount, always: false, allowed: false, denied: false, paidTotal: 999999 }), false);
assert.equal(E.emojiAllowed({ setting: amount, always: false, allowed: false, denied: false, paidTotal: 1000000 }), true);
assert.equal(E.emojiAllowed({ setting: amount, always: false, allowed: true, denied: false, paidTotal: 0 }), true);
assert.equal(E.emojiAllowed({ setting: amount, always: false, allowed: false, denied: true, paidTotal: 5000000 }), false);
assert.equal(E.emojiAllowed({ setting: amount, always: true, allowed: false, denied: true, paidTotal: 0 }), true);
const off = E.parseChatEmojiSetting({ access: "off" });
assert.equal(E.emojiAllowed({ setting: off, always: false, allowed: true, denied: false, paidTotal: 9e9 }), false);
assert.equal(E.emojiAllowed({ setting: off, always: true, allowed: false, denied: false, paidTotal: 0 }), true);
assert.equal(E.emojiAllowed({ setting: E.parseChatEmojiSetting({ access: "list" }), always: false, allowed: false, denied: false, paidTotal: 9e9 }), false);
assert.equal(E.emojiAllowed({ setting: E.parseChatEmojiSetting({ access: "all" }), always: false, allowed: false, denied: false, paidTotal: 0 }), true);
assert.deepEqual([...E.EMOJI_ALWAYS_PHONES], ["01099992420", "01046822420", "01081912420"]);
assert.equal(E.emojiAccessText(amount), "누적 구매 1,000,000원 이상");

console.log("✅ live-chat-emoji 통과");
