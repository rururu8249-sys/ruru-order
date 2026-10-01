import assert from "node:assert/strict";

import {
  normalizeProductSearchText,
  productSearchMatches,
} from "../lib/productSearch.ts";

assert.equal(normalizeProductSearchText(" MIU-2 "), "miu2");
assert.equal(normalizeProductSearchText("MIU_2"), "miu2");
assert.equal(normalizeProductSearchText("ＭＩＵ－２"), "miu2");
assert.equal(normalizeProductSearchText("상품 · 1"), "상품1");

assert.equal(productSearchMatches("MIU-2", "miu2"), true);
assert.equal(productSearchMatches("MIU 2 여성 상의", "miu-2"), true);
assert.equal(productSearchMatches("상품-1", "상품1"), true);
assert.equal(productSearchMatches("MIU-20", "miu2"), false);
assert.equal(productSearchMatches("MIU-2", ""), false);

console.log("product search normalization tests passed");
