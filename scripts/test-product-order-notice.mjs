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
