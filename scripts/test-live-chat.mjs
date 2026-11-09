// [2026-11-10] lib/liveChat — 사이트 채팅: 설정·글 다듬기·금지어 가리기·금지 시간·소식 읽기·목록 합치기
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

const load = createUiLoader({});
const C = load("lib/liveChat.ts");

// 설정
assert.deepEqual({ ...C.parseLiveChatSetting(null), words: [...C.parseLiveChatSetting(null).words] }, { enabled: true, notice: "", words: [] });
const st = C.parseLiveChatSetting('{"enabled":false,"notice":"  입금은 닉네임으로  ","words":["바보"," 바보 ","",null]}');
assert.equal(st.enabled, false);
assert.equal(st.notice, "입금은 닉네임으로");
assert.deepEqual([...st.words], ["바보"]);
assert.equal(C.parseLiveChatSetting("{broken").enabled, true);

// 글 다듬기
assert.equal(C.cleanChatBody("  안녕\n\n하세요   "), "안녕 하세요");
assert.equal(C.cleanChatBody("가".repeat(200)).length, C.LIVE_CHAT_MAX_LEN);

// 금지어 — 띄어쓰기·기호 무시, 그 글자만 *
let r = C.maskBannedWords("아 시발 진짜", C.LIVE_CHAT_DEFAULT_WORDS);
assert.equal(r.hit, true); assert.equal(r.text, "아 ** 진짜");
r = C.maskBannedWords("시 .발", C.LIVE_CHAT_DEFAULT_WORDS);
assert.equal(r.hit, true); assert.equal(r.text, "* .*");
r = C.maskBannedWords("이거 가품인가요? 사이즈 문의요", C.LIVE_CHAT_DEFAULT_WORDS);
assert.equal(r.hit, false);
r = C.maskBannedWords("FUCK you", C.LIVE_CHAT_DEFAULT_WORDS);
assert.equal(r.text, "**** you");
r = C.maskBannedWords("바보야", ["바보"]);
assert.equal(r.text, "**야");

// 금지 시간
const now = Date.parse("2026-11-10T00:00:00Z");
assert.equal(C.penaltyUntil("hide", now), undefined);
assert.equal(C.penaltyUntil("ban", now), null);
assert.equal(C.penaltyUntil("mute30s", now), "2026-11-10T00:00:30.000Z");
assert.equal(C.penaltyUntil("mute5m", now), "2026-11-10T00:05:00.000Z");
assert.equal(C.banActive({ until_at: null }, now), true);
assert.equal(C.banActive({ until_at: null, lifted_at: "x" }, now), false);
assert.equal(C.banActive({ until_at: "2026-11-10T00:00:10Z" }, now), true);
assert.equal(C.banActive({ until_at: "2026-11-09T23:59:59Z" }, now), false);
assert.equal(C.banMessage({ until_at: "2026-11-10T00:00:10Z" }, now), "10초 뒤에 다시 쓸 수 있어요.");
assert.equal(C.banMessage({ until_at: "2026-11-10T00:04:01Z" }, now), "5분 뒤에 다시 쓸 수 있어요.");

// 소식 읽기·합치기
const a = C.parseChatMessage({ id: 1, broadcast_id: "b", nickname: "가", body: "안녕", created_at: "t" });
const b = C.parseChatMessage({ id: 2, broadcast_id: "b", nickname: "나", body: "반가워", created_at: "t" });
const hid = C.parseChatMessage({ id: 1, broadcast_id: "b", nickname: "가", body: "", hidden: true });
assert.equal(C.parseChatMessage({ id: "x" }), null);
assert.equal(hid.hidden, true);
let list = C.mergeChat([], [b, a]);
assert.deepEqual(list.map((m) => m.id), [1, 2]);
list = C.mergeChat(list, [hid]);
assert.deepEqual(list.map((m) => m.id), [2]);
assert.equal(C.mergeChat([], Array.from({ length: 100 }, (_, i) => C.parseChatMessage({ id: i + 1, broadcast_id: "b", nickname: "n", body: "x" })), 80).length, 80);

console.log("live-chat: 통과");
