// [2026-11-10] 짧은 글 상품 안내 — 「에어랩」「다이슨」(묻는 말 없이 이름만)
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const B = createUiLoader({})("lib/liveChatBot.ts");
const c = (pid, name, detail = "", group = "") => ({ productId: pid, detailName: detail, texts: [detail || name], line: `🛍 ${detail || name} / 100,000원`, soldOut: false, sizes: [], groupName: group || undefined });
const cands = [c("781", "다이슨 에어랩HS05"), c("782", "다이슨 슈퍼소닉HD1"), c("677", "", "PD-202 블랙", "프라다"), c("677", "", "PD-203 화이트", "프라다"), c("700", "블랙 니트")];
assert.deepEqual(B.pickProductsForShortChat("에어랩", cands).map((x) => x.productId), ["781"]);
assert.deepEqual(B.pickProductsForShortChat("다이슨", cands).map((x) => x.productId), ["781", "782"]);
const pr = B.pickProductsForShortChat("프라다", cands);
assert.equal(pr.length, 1);
assert.equal(pr[0].detailName, "");
assert.match(pr[0].text, /프라다 — 세부상품 2가지/);
assert.equal(B.pickProductsForShortChat("블랙", cands).length, 0); // 흔한 색 이름
assert.equal(B.pickProductsForShortChat("예뻐요", cands).length, 0);
assert.equal(B.pickProductsForShortChat("에어랩 너무 예쁘네요 저도 갖고 싶어요", cands).length, 0); // 긴 글은 안 함
assert.equal(B.pickProductsForShortChat("에어랩이요", cands).length, 1); // 조사 떼고
console.log("✅ live-chat-bot-short 통과");
