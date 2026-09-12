// 방송 피드 상품명 정리 — 꼬리표·코드 떼고 20자, 여러 개는 「외 N종」
import assert from "node:assert/strict";
import { cleanProductNameForFeed, feedOrderDetail } from "../lib/feedText.ts";

assert.equal(cleanProductNameForFeed("[👽주말마지막] 나이키 쭈리후드티_센터자수 FB7789"), "나이키 쭈리후드티_센터자수");
assert.equal(cleanProductNameForFeed("【특가】(재입고) 룰루레몬 데일리 멀티 포켓 토트백 블랙 20L"), "룰루레몬 데일리 멀티 포켓 토트백…");
assert.equal(cleanProductNameForFeed("반집업 룰루레몬"), "반집업 룰루레몬");
assert.equal(cleanProductNameForFeed("나이키 바람막이 DX1234-100"), "나이키 바람막이");
assert.equal(cleanProductNameForFeed("버버리 BB-80"), "버버리 BB-80");           // 숫자 3자리 미만 코드는 이름의 일부
assert.equal(cleanProductNameForFeed("FB7789"), "FB7789");                      // 코드만 있으면 그대로(비우지 않음)
assert.equal(feedOrderDetail(["[👽주말마지막] 나이키 쭈리후드티_센터자수 FB7789", "나이키 바람막이", "양말"]), "나이키 쭈리후드티_센터자수 외 2종");
assert.equal(feedOrderDetail(["반집업 룰루레몬"]), "반집업 룰루레몬");
assert.equal(feedOrderDetail([]), "");
console.log("✅ test-feed-text 9개 통과");
