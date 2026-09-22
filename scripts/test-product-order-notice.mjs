import assert from "node:assert/strict";
import {
  resolveProductOrderNotice,
  parseProductNoticeMode,
  PRODUCT_NOTICE_PRESETS,
  PRODUCT_NOTICE_MAX_LEN,
} from "../lib/productOrderNotice.ts";

// 모르는 값·빈값은 «표시 안 함»으로 떨어진다(손님 화면에 이상한 게 뜨지 않게)
assert.equal(parseProductNoticeMode(undefined), "off");
assert.equal(parseProductNoticeMode(""), "off");
assert.equal(parseProductNoticeMode("이상한값"), "off");
assert.equal(parseProductNoticeMode("live_only"), "live_only");
assert.equal(resolveProductOrderNotice("off", "무시됨"), "");

// 기본 문구 2종
const live = resolveProductOrderNotice("live_only", "");
const instant = resolveProductOrderNotice("instant", "");
assert.ok(live.includes("접수") && live.startsWith("📺"), live);
assert.ok(instant.includes("바로 주문") && instant.startsWith("🛒"), instant);
// 손님 화면에서 두 줄을 넘기지 않는 길이
for (const t of [live, instant]) assert.ok([...t].length <= PRODUCT_NOTICE_MAX_LEN, t);

// 직접 입력 — 앞뒤 공백 제거 + 상한 자르기
assert.equal(resolveProductOrderNotice("custom", "  방송 중에만 주문돼요  "), "방송 중에만 주문돼요");
assert.equal(resolveProductOrderNotice("custom", ""), "");
assert.equal([...resolveProductOrderNotice("custom", "가".repeat(200))].length, PRODUCT_NOTICE_MAX_LEN);

// 라디오 목록은 4개(표시 안 함 / 접수 후 / 바로 / 직접입력)이고 mode 가 겹치지 않는다
assert.equal(PRODUCT_NOTICE_PRESETS.length, 4);
assert.equal(new Set(PRODUCT_NOTICE_PRESETS.map((p) => p.mode)).size, 4);

console.log("✅ product order notice OK");

// ── [2026-09-22 2차] 상품별 개별 설정 ──────────────────────────────
{
  const { resolveProductNoticeFor, parseProductNoticeProductMode, PRODUCT_NOTICE_PRODUCT_OPTIONS } =
    await import("../lib/productOrderNotice.ts");

  // 예전 상품(키 없음)·빈값·모르는 값 → 「기본값 따름」
  assert.equal(parseProductNoticeProductMode(undefined), "inherit");
  assert.equal(parseProductNoticeProductMode(""), "inherit");
  assert.equal(parseProductNoticeProductMode("아무거나"), "inherit");
  assert.equal(parseProductNoticeProductMode("off"), "off");

  // 기본값 따름 → 전체 설정을 그대로 쓴다
  assert.equal(resolveProductNoticeFor({ globalMode: "instant" }), resolveProductOrderNotice("instant", ""));
  assert.equal(resolveProductNoticeFor({ productMode: "inherit", globalMode: "off" }), "");
  // 전체가 «표시 안 함»(기본)이면 아무것도 안 보인다 — 사장님 기준
  assert.equal(resolveProductNoticeFor({}), "");

  // 상품 설정이 전체보다 «먼저»
  assert.equal(resolveProductNoticeFor({ productMode: "off", globalMode: "live_only" }), "", "상품만 끄기");
  assert.ok(resolveProductNoticeFor({ productMode: "live_only", globalMode: "off" }).includes("접수"), "전체 꺼져도 이 상품만 켜기");
  assert.equal(
    resolveProductNoticeFor({ productMode: "custom", productCustom: " 이 상품은 예약만 받아요 ", globalMode: "instant" }),
    "이 상품은 예약만 받아요",
  );
  // 상품 직접입력이 비었으면 빈 줄(아무것도 안 그림) — 전체로 내려가지 않는다(사장님이 «이 상품만» 고른 것이므로)
  assert.equal(resolveProductNoticeFor({ productMode: "custom", productCustom: "", globalMode: "live_only" }), "");

  // 선택지 5개, mode 중복 없음, 맨 위가 기본값
  assert.equal(PRODUCT_NOTICE_PRODUCT_OPTIONS.length, 5);
  assert.equal(PRODUCT_NOTICE_PRODUCT_OPTIONS[0].mode, "inherit");
  assert.equal(new Set(PRODUCT_NOTICE_PRODUCT_OPTIONS.map((o) => o.mode)).size, 5);
}
console.log("✅ product order notice (상품별) OK");

// ── [2026-09-22 3차] 두 줄 고정 (· 기준) ───────────────────────────
{
  const { splitProductOrderNotice, PRODUCT_NOTICE_ONE_LINE_MAX } = await import("../lib/productOrderNotice.ts");

  // [2026-09-22 4차] 기본 문구 2종은 «한 줄»이다(사장님: 「두줄 별로인거 같음」)
  const live = resolveProductOrderNotice("live_only", "");
  const a = splitProductOrderNotice(live);
  assert.ok(a.head.startsWith("📺") && a.head.includes("주문할 수 있어요"), JSON.stringify(a));
  assert.equal(a.sub, "", "기본 문구는 두 줄로 나뉘지 않는다");

  const b = splitProductOrderNotice(resolveProductOrderNotice("instant", ""));
  assert.ok(b.head.includes("바로 주문"), JSON.stringify(b));
  assert.equal(b.sub, "");

  // ★ 좁은 폰에서 한 줄을 지키는 길이 상한 — 여기를 넘기면 다시 두 줄이 된다
  for (const t of [live, resolveProductOrderNotice("instant", "")]) {
    assert.ok([...t].length <= PRODUCT_NOTICE_ONE_LINE_MAX, `한 줄 상한 초과: ${t} (${[...t].length}자)`);
  }
  // 끝맺음을 맞춰 나란히 읽히게 — 둘 다 「주문할 수 있어요」로 끝난다
  for (const t of [live, resolveProductOrderNotice("instant", "")]) {
    assert.ok(t.endsWith("주문할 수 있어요"), t);
  }

  // 빈값·점만 있는 값도 안전하게
  assert.deepEqual(splitProductOrderNotice(""), { head: "", sub: "" });
  assert.deepEqual(splitProductOrderNotice(undefined), { head: "", sub: "" });
  assert.deepEqual(splitProductOrderNotice("· 바로 주문 가능"), { head: "바로 주문 가능", sub: "" });
  assert.deepEqual(splitProductOrderNotice("바로 주문 가능 ·"), { head: "바로 주문 가능", sub: "" });

  // 직접 입력도 · 로 나눌 수 있다
  assert.deepEqual(splitProductOrderNotice("예약만 받아요 · 방송 때 말씀해 주세요"), {
    head: "예약만 받아요",
    sub: "방송 때 말씀해 주세요",
  });
}
console.log("✅ product order notice (두 줄) OK");
