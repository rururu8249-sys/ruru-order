// [2026-11-10] 채팅 색(위아래 다른 사람 같은 색 금지)·표시(badge)·고정·총관리자 설정 읽기
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const load = createUiLoader({});
const C = load("lib/liveChat.ts");
const W = load("lib/liveWatch.ts");

// 색: 많은 닉네임을 섞어도 바로 위 다른 사람과 같은 색 없음, 같은 사람 이어 쓰면 같은 색
const nicks = Array.from({ length: 300 }, (_, i) => `손님${i % 137}`);
const list = nicks.map((n, i) => ({ id: i + 1, nickname: n }));
list.splice(10, 0, { id: 9001, nickname: list[9].nickname });
const map = C.chatColors(list);
for (let i = 1; i < list.length; i++) {
  const a = list[i - 1], b = list[i];
  if (a.nickname === b.nickname) assert.equal(map.get(a.id), map.get(b.id));
  else assert.notEqual(map.get(a.id), map.get(b.id), `${a.nickname}/${b.nickname}`);
}
// 같은 사람은 겹침 없을 때 늘 같은 기본 색
assert.equal(C.chatColors([{ id: 1, nickname: "얌얌" }]).get(1), C.CHAT_COLORS[C.chatBaseColorIndex("얌얌")]);

// 표시·고정 읽기
const m = C.parseChatMessage({ id: 3, broadcast_id: "b", nickname: "루루실장", body: "안녕", badge: "crown", pinned_at: "2026-11-10" });
assert.equal(m.badge, "crown"); assert.equal(m.pinned, true);
assert.equal(C.parseChatMessage({ id: 3, broadcast_id: "b", badge: "evil" }).badge, null);
assert.equal(C.parseChatMessage({ id: 3, broadcast_id: "b", pinned: true, hidden: true }).pinned, false);
assert.equal(C.isPenaltyAction("pin"), false); assert.equal(C.isPenaltyAction("ban"), true);

// 총관리자 설정
const s = W.parseLiveWatchSetting(JSON.stringify({ mods: ["01011112222"], owners: [{ phone: "010-8785-2465", badge: "crown" }, { phone: "01099992420", badge: "crown_pink" }, { phone: "01081912420", badge: "x" }] }));
assert.equal(W.chatBadgeOf(s, "01087852465"), "crown");
assert.equal(W.chatBadgeOf(s, "01099992420"), "crown_pink");
assert.equal(W.chatBadgeOf(s, "01081912420"), "mod");
assert.equal(W.chatBadgeOf(s, "01011112222"), "mod");
assert.equal(W.chatBadgeOf(s, "01000000000"), null);
assert.equal(W.isChatOwnerPhone(s, "01081912420"), true);
assert.equal(W.isChatOwnerPhone(s, "01011112222"), false);
// 저장해도 총관리자 유지
assert.deepEqual(W.parseLiveWatchSetting(W.serializeLiveWatchSetting(s)).owners, s.owners);
console.log("test-live-chat-colors-badge OK");
