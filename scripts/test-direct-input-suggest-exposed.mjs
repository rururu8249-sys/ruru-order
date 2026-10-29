// [2026-10-29] 직접 입력 「혹시 이 상품인가요?」 추천이 «지금 손님 화면에 보이는 상품»에서만 나오는지(숨김 포함 전체 카탈로그 금지).
//   사고: 노출 안 한 롱샴(546)이 손님 직접 입력 추천으로 연결돼 장바구니에 담김(10/29).
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("app/order/page.tsx", "utf8");
const at = src.indexOf("const filteredBroadcastProducts = useMemo(");
assert.ok(at > 0, "filteredBroadcastProducts 를 찾지 못함");
const block = src.slice(at, src.indexOf("]);", at) + 3);

assert.match(block, /return quickGroupBuyProducts\s*\n?\s*\.filter/, "추천 원본은 quickGroupBuyProducts 여야 함");
assert.doesNotMatch(block, /groupBuyQuickProductsFromCatalog/, "전체 카탈로그(숨김 포함)에서 추천하면 안 됨");
assert.doesNotMatch(block, /broadcastProducts\]/, "방송 상품을 따로 섞지 않음(quickGroupBuyProducts 에 이미 포함)");
assert.match(block, /\[quickGroupBuyProducts, productSearchText\]/);

// quickGroupBuyProducts 가 먼저 선언돼야(선언 전 참조 = 화면 오류)
assert.ok(src.indexOf("const quickGroupBuyProducts = useMemo(") < at, "quickGroupBuyProducts 선언 뒤에 있어야 함");

// 노출 목록 규칙 그대로: 숨김·삭제·is_visible false 제외
const q = src.slice(src.indexOf("const quickGroupBuyProducts = useMemo("), at);
assert.match(q, /product\.status !== "숨김" && product\.status !== "deleted"/);
assert.match(q, /is_visible !== false/);

console.log("direct-input-suggest-exposed tests passed");
