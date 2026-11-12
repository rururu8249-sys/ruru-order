// node --experimental-strip-types scripts/test-cart-draft-sync.mjs
import assert from "node:assert/strict";
import { sameCartDraftItems } from "../lib/cartDraftSync.ts";
const a = { product_id: "751", product_name: "BB-202", color: "없음", size: "S", qty: "1", product_price: "129000", cart_seq: 1323 };
const blank = { product_name: "", color: "", size: "", qty: "", product_price: "" };
assert.equal(sameCartDraftItems([a], [{ ...a }]), true, "같은 목록");
assert.equal(sameCartDraftItems([a, blank], [a]), true, "빈 줄 무시");
assert.equal(sameCartDraftItems([blank], []), true, "둘 다 빈 장바구니");
assert.equal(sameCartDraftItems([a], []), false, "한쪽만 빔");
assert.equal(sameCartDraftItems([a], [{ ...a, qty: "2" }]), false, "수량 다름");
assert.equal(sameCartDraftItems([a], [{ ...a, size: "M" }]), false, "옵션 다름");
assert.equal(sameCartDraftItems([a], [{ ...a, cart_seq: -1 }]), false, "담은 번호 다름");
assert.equal(sameCartDraftItems([a, { ...a, size: "M" }], [{ ...a, size: "M" }, a]), false, "순서 다름");
assert.equal(sameCartDraftItems(null, undefined), true, "없음끼리");
console.log("cart-draft-sync 9 통과");
