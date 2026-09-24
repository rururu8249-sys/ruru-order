// [2026-09-24 사장님] 「왼쪽 오른쪽 여백을 최대한으로 활용해서 길게 만들 수 있을까?」
//   위젯 폭이 «프리즘 네모 가로»를 따라가게 바꿨다. 이 테스트가 지키는 것 두 가지:
//     1) 넓어지면 줄이 실제로 길어진다(2줄이던 공지가 한 줄로 붙는다)
//     2) 좁아져도 «지금보다 짧아지지 않는다»(기존 값이 바닥) — 방송 중 갑자기 글이 잘리는 사고 방지
import assert from "node:assert/strict";
import {
  feedRowAvailW, feedPinAvailW, feedPinLayout, feedProductPages, feedRowFitsOneLine,
  FEED_ROW_AVAIL_W, FEED_PIN_AVAIL_W, FEED_ROW_PAD_W, FEED_PIN_PAD_W, FEED_PIN_SIZE,
  feedRowLayout, FEED_ROW_ONELINE_MIN_SIZE,
} from "../lib/feedText.ts";

// ── 1) 바닥 보장 — 어떤 값이 와도 기존보다 짧아지지 않는다 ──────────────────
for (const w of [0, 1, 200, 640, 860, NaN, undefined, null]) {
  assert.ok(feedRowAvailW(w) >= FEED_ROW_AVAIL_W, `알림 폭이 기존(${FEED_ROW_AVAIL_W})보다 짧아짐: ${w}`);
  assert.ok(feedPinAvailW(w) >= FEED_PIN_AVAIL_W, `공지 폭이 기존(${FEED_PIN_AVAIL_W})보다 짧아짐: ${w}`);
}

// ── 2) 지금 네모(880×300)에서는 예전과 같은 값 ────────────────────────────
assert.equal(feedPinAvailW(860), 860 - FEED_PIN_PAD_W, "공지 폭 = 위젯 폭 − 안쪽 여백");
assert.equal(feedRowAvailW(860), 860 - FEED_ROW_PAD_W, "알림 폭 = 위젯 폭 − 안쪽 여백");
assert.ok(feedPinAvailW(860) > FEED_PIN_AVAIL_W, "[09-24 2차] 여백을 줄인 만큼 글자 칸이 넓어져야 한다");
assert.ok(feedRowAvailW(860) > FEED_ROW_AVAIL_W, "[09-24 2차] 여백을 줄인 만큼 글자 칸이 넓어져야 한다");

// ── 3) 네모를 넓히면 그만큼 길어진다 ───────────────────────────────────────
assert.equal(feedRowAvailW(1200), 1200 - FEED_ROW_PAD_W);
assert.equal(feedPinAvailW(1200), 1200 - FEED_PIN_PAD_W);
assert.ok(feedRowAvailW(1200) > feedRowAvailW(860), "넓은 네모가 더 길어야 한다");
assert.ok(feedPinAvailW(1200) > feedPinAvailW(860), "넓은 네모가 더 길어야 한다");

// ── 4) 실제 효과 — 2줄이던 공지가 넓은 네모에서는 한 줄 ────────────────────
const 긴공지 = "9/21~9/27 주문건은 합배송되며, 9/28~29 순차 출고 예정입니다 감사합니다";
const 좁게 = feedPinLayout(긴공지, feedPinAvailW(860));
const 넓게 = feedPinLayout(긴공지, feedPinAvailW(1400));
assert.equal(넓게.lines, 1, "넓은 네모에서는 한 줄로 붙어야 한다");
assert.equal(넓게.fontSize, FEED_PIN_SIZE, "한 줄로 붙었으면 글자를 줄일 이유가 없다");
assert.ok(넓게.maxWidth > 좁게.maxWidth, "글자 칸이 더 넓어야 한다");

// ── 5) 상품 많은 주문 — 넓으면 장 수가 줄거나 같다(늘어나면 안 된다) ────────
const 상품 = Array.from({ length: 6 }, (_, i) => ({ name: `나이키 쭈리 후드티${i} 차콜`, option: "M", qty: 1 }));
const 장좁게 = feedProductPages(상품, feedRowAvailW(860)).length;
const 장넓게 = feedProductPages(상품, feedRowAvailW(1400)).length;
assert.ok(장넓게 <= 장좁게, `넓은데 장이 더 늘었다 (${장좁게} → ${장넓게})`);

// ── 6) 한 줄 판정도 폭을 따라간다 ─────────────────────────────────────────
const 긴줄 = ["내가사는세상-88", "🛒 주문 감사합니다", "나이키 바람막이 · M, 꽃티 · L"];
assert.equal(feedRowFitsOneLine(...긴줄, undefined, feedRowAvailW(860)), false);
assert.equal(feedRowFitsOneLine(...긴줄, undefined, feedRowAvailW(1400)), true, "넓으면 한 줄에 들어가야 한다");

// ── 7) [09-24 2차] 주문 알림 — 조금만 줄이면 한 줄인 경우 글자를 줄여서라도 한 줄 ──────
{
  // 사장님 캡쳐 실제 줄: 28px 로는 45px 모자라 2줄이 됐다 → 이제 글자를 줄여 한 줄
  const 실제 = ["에이치_더블", "🛒 주문 감사합니다", "폴로 올캐시 가디건 핫핑크/S 1개"];
  const L = feedRowLayout(...실제, feedRowAvailW(860));
  assert.equal(L.oneLine, true, "45px 모자란 줄은 글자를 줄여서라도 한 줄이어야 한다");
  assert.ok(L.fontSize < 28 && L.fontSize >= FEED_ROW_ONELINE_MIN_SIZE, `글자 크기 범위: ${L.fontSize}px`);

  // 짧은 줄은 원래 크기 그대로
  const S = feedRowLayout("루루짱929", "🛒 주문 감사합니다", "아미반팔 · L", feedRowAvailW(860));
  assert.deepEqual(S, { fontSize: 28, oneLine: true }, "짧은 줄은 손대지 않는다");

  // 아주 긴 줄은 24px 밑으로 내려가지 않고 2줄로 간다(원래 크기 유지)
  const 긴 = feedRowLayout("내가사는세상-88", "🛒 주문 감사합니다",
    "나이키 바람막이 차콜 M 1개  |  폴로 울캐시 가디건 핫핑크 S 1개  |  아디다스 트레이닝 세트 블랙 L 2개", feedRowAvailW(860));
  assert.equal(긴.oneLine, false, "아무리 줄여도 안 되는 줄은 2줄");
  assert.equal(긴.fontSize, 28, "2줄로 갈 때는 원래 크기를 지킨다");

  // 넓은 네모에서는 줄이지 않고도 한 줄
  const W = feedRowLayout(...실제, feedRowAvailW(1400));
  assert.deepEqual(W, { fontSize: 28, oneLine: true }, "넓으면 글자를 줄일 이유가 없다");
}

console.log("✅ 위젯 폭 자동확장 · 한 줄 최대화 테스트 통과");
