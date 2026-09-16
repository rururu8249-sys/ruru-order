// 방송 피드 상품명 정리 — 꼬리표·코드 떼고 20자, 여러 개는 「외 N종」
import assert from "node:assert/strict";
import { cleanProductNameForFeed, feedOrderDetail, feedOrderLines, feedOrderProducts, feedRowFitsOneLine, estimateTextWidth } from "../lib/feedText.ts";
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
// [2026-09-16 사장님 «바람잡이»] 주문내역 = 상품 이름 위주, 금액 없음
const opt = formatOrderOptionText;
assert.equal(
  feedOrderProducts([{ name: "[👽주말마지막] 나이키 쭈리후드티_센터자수 FB7789", color: "블랙", size: "L", qty: 2, price: 59000 }], opt),
  "나이키 쭈리후드티_센터자수 · 블랙/L · 2개",
);
assert.equal(
  feedOrderProducts([{ name: "뉴발란스740", color: "없음", size: "240" }, { name: "아미반팔", color: "없음", size: "없음" }], opt),
  "뉴발란스740 · 240, 아미반팔",
);
// 4개 이상이면 앞 3개 + 「외 N종」
assert.equal(
  feedOrderProducts([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }], opt),
  "A, B, C 외 2종",
);
assert.equal(feedOrderProducts([], opt), "");
// feedOrderLines 는 그 문구를 한 줄로 감싼다(금액 칸 비움)
assert.deepEqual(feedOrderLines([{ name: "가격없음", price: 0 }], opt), [{ left: "가격없음", right: "" }]);
assert.deepEqual(feedOrderLines([], opt), []);

// ── 「한 줄에 들어가면 한 줄」 판정 (방송화면을 덜 가리려고 한 줄 우선) ──────────
// 짧은 주문 = 한 줄
assert.equal(feedRowFitsOneLine("루루짱929", "🛒 주문 감사합니다", "아미반팔 · L"), true);
// 닉네임·상품이 길면 2줄로 내린다
assert.equal(feedRowFitsOneLine("내가사는세상-88", "🛒 주문 감사합니다", "나이키 바람막이 · M, 꽃티 · L"), false);
// 주문내역이 없는 입금·카드 줄은 언제나 한 줄
assert.equal(feedRowFitsOneLine("내가사는세상-88", "💰 입금 감사합니다", ""), true);
// 폭 추정: 한글이 숫자보다 넓다
assert.ok(estimateTextWidth("가나다", 40) > estimateTextWidth("123", 40));

console.log("✅ test-feed-text 19개 통과");
