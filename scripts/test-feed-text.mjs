// 방송 피드 상품명 정리 — 꼬리표·코드 떼고 20자, 여러 개는 「외 N종」
import assert from "node:assert/strict";
import { cleanProductNameForFeed, feedOrderDetail, feedOrderLines } from "../lib/feedText.ts";
import { formatOrderOptionText } from "../lib/orderOptionText.ts";

assert.equal(cleanProductNameForFeed("[👽주말마지막] 나이키 쭈리후드티_센터자수 FB7789"), "나이키 쭈리후드티_센터자수");
assert.equal(cleanProductNameForFeed("【특가】(재입고) 룰루레몬 데일리 멀티 포켓 토트백 블랙 20L"), "룰루레몬 데일리 멀티 포켓 토트백…");
assert.equal(cleanProductNameForFeed("반집업 룰루레몬"), "반집업 룰루레몬");
assert.equal(cleanProductNameForFeed("나이키 바람막이 DX1234-100"), "나이키 바람막이");
assert.equal(cleanProductNameForFeed("버버리 BB-80"), "버버리 BB-80");           // 숫자 3자리 미만 코드는 이름의 일부
assert.equal(cleanProductNameForFeed("FB7789"), "FB7789");                      // 코드만 있으면 그대로(비우지 않음)
assert.equal(feedOrderDetail(["[👽주말마지막] 나이키 쭈리후드티_센터자수 FB7789", "나이키 바람막이", "양말"]), "나이키 쭈리후드티_센터자수 외 2종");
assert.equal(feedOrderDetail(["반집업 룰루레몬"]), "반집업 룰루레몬");
assert.equal(feedOrderDetail([]), "");
// [2026-09-13] 옵션·수량·금액 줄 — 왼쪽/오른쪽 분리
const opt = formatOrderOptionText;
assert.deepEqual(
  feedOrderLines([{ name: "[👽주말마지막] 나이키 쭈리후드티_센터자수 FB7789", color: "블랙", size: "L", qty: 2, price: 59000 }], opt),
  [{ left: "나이키 쭈리후드티_센터자수 · 블랙/L", right: "2개 · 118,000원" }],
);
assert.deepEqual(
  feedOrderLines([{ name: "뉴발란스740", color: "없음", size: "240", qty: 1, price: 129000 }, { name: "아미반팔", color: "없음", size: "없음", qty: "1", price: "30000" }], opt),
  [{ left: "뉴발란스740 · 240", right: "129,000원" }, { left: "아미반팔", right: "30,000원" }],
);
assert.deepEqual(
  feedOrderLines([{ name: "A", price: 10000 }, { name: "B", price: 20000, qty: 2 }, { name: "C", price: 5000 }], opt),
  [{ left: "A", right: "10,000원" }, { left: "외 2종", right: "합계 55,000원" }],
);
assert.deepEqual(feedOrderLines([{ name: "가격없음", price: 0 }], opt), [{ left: "가격없음", right: "" }]);
assert.deepEqual(feedOrderLines([], opt), []);
console.log("✅ test-feed-text 14개 통과");
