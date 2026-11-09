// [2026-11-10 07:39] 장바구니 담음 알림 — 닉네임 가림·글·단가 믿기
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const { maskChatNick, cartAnnounceText, trustedCartPrice, parseBotRef, botRefOfCart, parseLiveChatBotSetting } = createUiLoader({})("lib/liveChatBot.ts");
let seed = 1; const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
assert.equal(maskChatNick("루"), "루");
assert.equal(maskChatNick("루루"), "루*");
assert.equal(maskChatNick("루루동"), "루*동");
for (let i = 0; i < 200; i++) {
  const m = maskChatNick("루루동이", r);
  const stars = [...m].filter((c) => c === "*").length;
  assert.ok(m.startsWith("루") && stars >= 1 && stars <= 2, m);
  const m2 = maskChatNick("에이치 더블", r);
  assert.ok(m2.startsWith("에") && m2.includes(" ") && [...m2].filter((c) => c === "*").length <= 2, m2);
}
assert.equal(cartAnnounceText("루*동이", [{ name: "PD-202", color: "블랙", size: "M", price: 259000 }]), "🛍️ 루*동이님 장바구니 담음 · PD-202 블랙/M · 259,000원");
assert.equal(cartAnnounceText("루*", [{ name: "니트", color: "없음", size: "", price: null }, { name: "B", color: "", size: "", price: 1 }]), "🛍️ 루*님 장바구니 담음 · 니트 외 1종");
assert.equal(trustedCartPrice(259000, { priceMin: 259000, priceMax: 259000 }), 259000);
assert.equal(trustedCartPrice(1, { priceMin: 259000, priceMax: 259000 }), 259000);
assert.equal(trustedCartPrice(30000, { priceMin: 25000, priceMax: 32000 }), 30000);
assert.equal(trustedCartPrice(5000, { }), null);
assert.deepEqual(parseBotRef(botRefOfCart({ productId: "677", detailName: "PD-202" })), { productId: "677", detailName: "PD-202" });
assert.equal(parseLiveChatBotSetting("").cart, true);
assert.equal(parseLiveChatBotSetting(JSON.stringify({ cart: false })).cart, false);
console.log("test-live-cart-announce 통과");
// [08:10] 담은 사람 지문 — 같은 장바구니 열쇠면 같은 지문, 다르면 다름, 담기 버튼은 그대로
{
  const L = createUiLoader({})("lib/liveChatBot.ts");
  const a = L.cartOwnerTag("sess-aaaaaa"), b = L.cartOwnerTag("sess-bbbbbb");
  assert.match(a, /^[0-9a-f]{8}$/); assert.notEqual(a, b); assert.equal(a, L.cartOwnerTag("sess-aaaaaa"));
  const ref = L.botRefOfCart({ productId: "818", detailName: "MC-322" }, a);
  assert.equal(L.cartRefOwner(ref), a);
  assert.deepEqual(L.parseBotRef(ref), { productId: "818", detailName: "MC-322" });
  assert.equal(L.cartRefOwner("p:818|MC-322"), "");
  console.log("cart owner tag 통과");
}
