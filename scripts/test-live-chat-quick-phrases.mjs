// [2026-11-13] 사이트 채팅 «자주 쓰는 말» — 정리·읽기·넣기·단축키
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const Q = createUiLoader({})("lib/liveChatQuickPhrases.ts");
assert.deepEqual(Q.cleanQuickPhrases(["  안녕 \n 하세요 ", "", "안녕 하세요", 3, "/335", "가"]), ["안녕 하세요", "가"]);
assert.equal(Q.cleanQuickPhrases(Array.from({ length: 30 }, (_, i) => `말${i}`)).length, Q.QUICK_PHRASES_MAX);
assert.equal(Array.from(Q.cleanQuickPhrases(["가".repeat(300)])[0]).length, Q.QUICK_PHRASE_MAX_LEN);
assert.deepEqual(Q.cleanQuickPhrases("x"), []);
assert.deepEqual(Q.readQuickPhrases(null), Q.DEFAULT_QUICK_PHRASES);
assert.deepEqual(Q.readQuickPhrases("[]"), []); // 다 지우고 저장한 건 빈 목록 그대로
assert.deepEqual(Q.readQuickPhrases('["a","b"]'), ["a", "b"]);
assert.deepEqual(Q.readQuickPhrases("{깨짐"), Q.DEFAULT_QUICK_PHRASES);
assert.equal(Q.insertQuickPhrase("", "루루스펙", 100), "루루스펙");
assert.equal(Q.insertQuickPhrase("언니 ", "루루스펙", 100), "언니 루루스펙");
assert.equal(Q.insertQuickPhrase("가나다", "라마바사", 5), "가나다 라");
const k = (o) => Q.quickPhraseIndexFromKey({ altKey: false, ctrlKey: false, metaKey: false, code: "", ...o });
assert.equal(k({ altKey: true, code: "Digit1" }), 0);
assert.equal(k({ altKey: true, code: "Numpad9" }), 8);
assert.equal(k({ altKey: true, code: "Digit0" }), -1);
assert.equal(k({ code: "Digit1" }), -1);
assert.equal(k({ altKey: true, metaKey: true, code: "Digit1" }), -1);
console.log("test-live-chat-quick-phrases ok");
