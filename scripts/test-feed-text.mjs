// 방송 피드 상품명 정리 — 꼬리표·코드 떼고 20자, 여러 개는 「외 N종」
import assert from "node:assert/strict";
import { cleanProductNameForFeed, feedOrderDetail, feedOrderLines, feedOrderProducts, feedOrderParts, feedProductLabel, feedShownProducts, feedProductPages, feedRowFitsOneLine, feedDetailLineCount, feedPinFitsOneLine, feedPinFontSize, estimateTextWidth, FEED_DETAIL_LINES_PER_PAGE } from "../lib/feedText.ts";
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
  "나이키 쭈리후드티_센터자수 블랙/L 2개",
);
assert.equal(
  feedOrderProducts([{ name: "뉴발란스740", color: "없음", size: "240" }, { name: "아미반팔", color: "없음", size: "없음" }], opt),
  "뉴발란스740 240 1개 / 아미반팔 1개",
);
// [2026-09-16] 개수가 아니라 «줄 수»로 자른다 — 3줄에 들어가는 만큼 다 넣고 남으면 「외 N종」
// 상품 하나가 한 줄 → 3줄까지만 보여주고 나머지는 「외 N종」
assert.equal(feedOrderProducts([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }], opt), "A 1개 / 외 4종");
// 진짜 긴 주문도 3줄 안에서 최대한 보여준다
{
  const many = Array.from({ length: 12 }, (_, i) => ({ name: `상품${i + 1}번 이름` }));
  const t = feedOrderProducts(many, opt);
  assert.ok(t.includes("외 11종"), t);
  const { shown, rest } = feedShownProducts(feedOrderParts(many, opt));
  assert.equal(shown.length, 1);
  assert.equal(rest, 11);
  assert.equal(feedDetailLineCount(12), 2);
}
// 주문내역 줄 수 = 상품 수(최대 3)
assert.equal(feedDetailLineCount(1), 1);
assert.equal(feedDetailLineCount(5), 2);
assert.equal(feedDetailLineCount(0), 0);
assert.equal(feedOrderProducts([], opt), "");
// feedOrderLines 는 그 문구를 한 줄로 감싼다(금액 칸 비움)
assert.deepEqual(feedOrderLines([{ name: "가격없음", price: 0 }], opt), [{ left: "가격없음 1개", right: "" }]);
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
  assert.deepEqual(parts, [{ name: "나이키 바람막이", opt: "M", qty: 2 }]);
  assert.equal(feedProductLabel(parts[0]), "나이키 바람막이 M 2개");
}
// ── 상품이 많으면 «넘겨가며» 보여준다 (화면 높이는 그대로) ─────────────────────
{
  const one = feedOrderParts([{ name: "아미반팔", color: "블랙", size: "L" }], opt);
  assert.equal(feedProductPages(one).length, 1, "상품 1개는 한 장");

  const many = feedOrderParts(
    Array.from({ length: 8 }, (_, i) => ({ name: `아주긴상품이름${i + 1}번입니다`, color: "베이지", size: "L", qty: 2 })),
    opt,
  );
  const pages = feedProductPages(many);
  assert.ok(pages.length >= 2, `여러 장으로 나뉜다: ${pages.length}`);
  // 빠짐 없이 전부 들어가야 한다 — 「외 N종」으로 버리지 않는다
  assert.equal(pages.flat().length, 8);
  // [2026-09-20] 한 장이 «허용된 줄 수» 폭을 안 넘는다. 예전엔 2줄로 못박아 놨는데
  //   사장님 「주문상품이 짤리는데 3줄로」 요청으로 한도가 3이 됐다 → 상수를 보게 바꾼다.
  for (const pg of pages) {
    if (pg.length === 1) continue;
    assert.ok(
      estimateTextWidth(pg.map(feedProductLabel).join("  |  "), 28) <= 814 * FEED_DETAIL_LINES_PER_PAGE,
      `한 장이 ${FEED_DETAIL_LINES_PER_PAGE}줄을 넘었다`,
    );
  }
  // 짧은 상품이면 한 장에 여러 개 — 「1개 출력당 최대한 많이」
  const short = feedOrderParts(Array.from({ length: 6 }, (_, i) => ({ name: `꽃티${i + 1}`, size: "L" })), opt);
  assert.equal(feedProductPages(short).length, 1, "짧은 상품 6개는 한 장에 다 들어간다");
}
// [2026-09-20 사장님] 「주문상품이 짤리는데 줄바꿈해서 3줄로 안내를 하던지」
//   배포 위젯 DOM에서 직접 잰 값:
//     「나이키 쭈리 후드티2 색N/M 1개」 5개 · 줄한도 2 → scrollHeight 초과 = «잘림»  ← 사장님이 보신 화면
//                                    · 줄한도 3 → 3줄(105px)에 전부 들어감 · 잘림 없음
//   이 한도가 다시 2로 내려가면 같은 잘림이 재발한다. 여기서 막는다.
{
  assert.equal(FEED_DETAIL_LINES_PER_PAGE, 3, "상품 줄 한도는 3줄 (2로 내리면 상품 많은 주문이 잘린다)");

  const opt = (c, s2) => formatOrderOptionText(c, s2);
  const five = feedOrderParts(
    Array.from({ length: 5 }, (_, i) => ({ name: "나이키 쭈리 후드티2", color: `색${i}`, size: "M", qty: 1 })),
    opt,
  );
  const fivePages = feedProductPages(five);
  assert.equal(fivePages.length, 1, `상품 5개는 한 장(3줄)에 다 들어가야 한다: ${fivePages.length}장`);
  assert.equal(fivePages[0].length, 5, "다섯 개가 한 장에");
  const w = estimateTextWidth(fivePages[0].map(feedProductLabel).join("  |  "), 28);
  assert.ok(w <= 814 * 3, `5개가 3줄을 넘었다: ${Math.round(w)}px`);
  assert.ok(w > 814 * 2, `5개는 2줄로는 부족해야 한다(이 검사의 전제): ${Math.round(w)}px`);
}

console.log("✅ test-feed-text 통과 (상품 줄 3줄 한도 포함)");
