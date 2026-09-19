// 안 읽은 쪽지 배지 숫자 규칙 검수 — M3 최대 글자수 컨테이너(34dp) 안에 들어가게 99+ 로 자른다
import assert from "node:assert/strict";
import { noteBadgeText } from "../lib/noteBadge.ts";

assert.equal(noteBadgeText(1), "1");
assert.equal(noteBadgeText(9), "9");
assert.equal(noteBadgeText(12), "12", "예전엔 9를 넘으면 전부 «9+» 라 12건이 9+로 보였다");
assert.equal(noteBadgeText(99), "99");
assert.equal(noteBadgeText(100), "99+");
assert.equal(noteBadgeText(1234), "99+");
assert.equal(noteBadgeText(0), "0");
assert.equal(noteBadgeText(-5), "0");
assert.equal(noteBadgeText(NaN), "0");
console.log("✅ note-badge 통과");
