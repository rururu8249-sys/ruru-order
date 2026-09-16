// 방송 피드 상품명 정리 — 꼬리표·코드 떼고 20자, 여러 개는 「외 N종」
import assert from "node:assert/strict";
import { cleanProductNameForFeed, feedOrderDetail, feedOrderLines, feedOrderProducts, feedOrderParts, feedProductLabel, feedShownProducts, feedRowFitsOneLine, feedDetailLineCount, feedPinFitsOneLine, feedPinFontSize, estimateTextWidth } from "../lib/feedText.ts";
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
  "나이키 쭈리후드티_센터자수  블랙 / 사이즈 L  2개",
);
assert.equal(
  feedOrderProducts([{ name: "뉴발란스740", color: "없음", size: "240" }, { name: "아미반팔", color: "없음", size: "없음" }], opt),
  "뉴발란스740  사이즈 240  1개 / 아미반팔  1개",
);
// [2026-09-16] 개수가 아니라 «줄 수»로 자른다 — 3줄에 들어가는 만큼 다 넣고 남으면 「외 N종」
// 상품 하나가 한 줄 → 3줄까지만 보여주고 나머지는 「외 N종」
assert.equal(feedOrderProducts([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }], opt), "A  1개 / B  1개 / 외 3종");
// 진짜 긴 주문도 3줄 안에서 최대한 보여준다
{
  const many = Array.from({ length: 12 }, (_, i) => ({ name: `상품${i + 1}번 이름` }));
  const t = feedOrderProducts(many, opt);
  assert.ok(t.includes("외 10종"), t);
  const { shown, rest } = feedShownProducts(feedOrderParts(many, opt));
  assert.equal(shown.length, 2);   // 「외 N종 더」가 한 줄을 먹으므로 상품은 2줄
  assert.equal(rest, 10);
  assert.equal(feedDetailLineCount(12), 3);
}
// 주문내역 줄 수 = 상품 수(최대 3)
assert.equal(feedDetailLineCount(1), 1);
assert.equal(feedDetailLineCount(5), 3);
assert.equal(feedDetailLineCount(0), 0);
assert.equal(feedOrderProducts([], opt), "");
// feedOrderLines 는 그 문구를 한 줄로 감싼다(금액 칸 비움)
assert.deepEqual(feedOrderLines([{ name: "가격없음", price: 0 }], opt), [{ left: "가격없음  1개", right: "" }]);
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

// ── 📌 공지 한 줄 기준 (관리자 입력칸이 이 판정을 그대로 쓴다) ────────────────
assert.equal(feedPinFitsOneLine("입금자명은 닉네임으로 보내주세요 🙏"), true);
// 사장님이 쓰던 문구는 2줄로 넘어간다
// [2026-09-16] 길면 «글자를 줄여서» 한 줄에 맞춘다 → 사장님 문구도 한 줄(29px)
assert.equal(feedPinFitsOneLine("주문방법 💚 방송접수 후 👉 카톡채널 👉 주문서&입금메뉴"), true);
assert.equal(feedPinFontSize("주문방법 💚 방송접수 후 👉 카톡채널 👉 주문서&입금메뉴"), 28);
assert.equal(feedPinFontSize("입금자명은 닉네임으로 보내주세요 🙏"), 34);   // 짧으면 안 줄인다
// «무한대로 작아지지 않는다» — 26px 이 바닥이고, 그보다 길면 2줄로 간다
assert.equal(feedPinFontSize("가".repeat(22)), 34);   // 22자까지는 제일 큰 글자
assert.equal(feedPinFontSize("가".repeat(26)), 29);   // 길어지는 만큼 조금씩 작아지고
assert.equal(feedPinFontSize("가".repeat(29)), 26);   // 29자에서 바닥
assert.equal(feedPinFitsOneLine("가".repeat(29)), true);
assert.equal(feedPinFitsOneLine("가".repeat(30)), false);  // 30자부터는 2줄(더 안 작아진다)
assert.equal(feedPinFontSize("가".repeat(40)), 26);        // 아무리 길어도 26px 아래로는 안 간다
// 한글 22자까지는 한 줄, 24자는 넘침
assert.equal(feedPinFitsOneLine("가".repeat(22)), true);
// 폭 추정 실측 보정 — 실제 브라우저(Pretendard 900)에서 잰 값과 ±6% 안에서 맞아야 한다
//   실측 @34px: 「가」×22 = 748px · 「주문방법 💚 … 입금메뉴」 = 898px · 「🛒 주문 감사합니다」 = 299px
{
  const near = (got, real) => Math.abs(got - real) / real <= 0.06;
  assert.ok(near(estimateTextWidth("가".repeat(22), 34), 748), `한글 추정: ${estimateTextWidth("가".repeat(22), 34)}`);
  assert.ok(near(estimateTextWidth("주문방법 💚 방송접수 후 👉 카톡채널 👉 주문서&입금메뉴", 34), 898), `이모지 섞인 추정: ${estimateTextWidth("주문방법 💚 방송접수 후 👉 카톡채널 👉 주문서&입금메뉴", 34)}`);
  assert.ok(near(estimateTextWidth("🛒 주문 감사합니다", 34), 299), `인사말 추정: ${estimateTextWidth("🛒 주문 감사합니다", 34)}`);
}
assert.equal(feedPinFitsOneLine("가".repeat(24)), true);   // 줄여서 한 줄

// 상품 조각 — 화면에서 상품/옵션을 다른 모양으로 그리기 위한 구조
{
  const parts = feedOrderParts([{ name: "나이키 바람막이 DX1234-100", color: "없음", size: "M", qty: 2 }], opt);
  assert.deepEqual(parts, [{ name: "나이키 바람막이", opt: "사이즈 M", qty: 2 }]);
  assert.equal(feedProductLabel(parts[0]), "나이키 바람막이  사이즈 M  2개");
}
console.log("✅ test-feed-text 41개 통과");
