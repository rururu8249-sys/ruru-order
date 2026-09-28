// [2026-09-28] 제출 서버 게이트 — missingCartHoldRows(선점 없는 상품 이름)
import assert from "node:assert/strict";
import { missingCartHoldRows } from "../lib/cartHoldDetail.ts";

let pass = 0;
const eq = (a, e, m) => { assert.deepEqual(a, e, m); pass++; };

const row = (product_id, color, size, product_name) => ({ product_id, color, size, product_name });
const hold = (product_id, color, size) => ({ product_id, color, size });

// ① 모두 선점 있음 → []
eq(missingCartHoldRows(
  [row("101", "블랙", "M", "니트"), row("102", "", "", "치마")],
  [hold("101", "블랙", "M"), hold("102", "", "")],
), [], "① 모두 있음 → []");

// ② 하나 없음 → 그 이름
eq(missingCartHoldRows(
  [row("101", "블랙", "M", "니트"), row("102", "레드", "L", "치마")],
  [hold("101", "블랙", "M")],
), ["치마"], "② 하나 없음 → 이름");

// ③ 직접입력(product_id 없음)만 → []
eq(missingCartHoldRows(
  [row("", "블랙", "M", "직접입력상품"), row(null, "", "", "그냥메모")],
  [],
), [], "③ 직접입력만 → []");

// ④ '없음' vs '' 동치 (주문=없음, 선점='' 저장)
eq(missingCartHoldRows(
  [row("201", "없음", "없음", "옵션없는상품")],
  [hold("201", "", "")],
), [], "④ '없음' vs '' 동치 → []");

// ⑤ trim 동치 (앞뒤 공백)
eq(missingCartHoldRows(
  [row("301", " 블랙 ", " M ", "니트")],
  [hold("301", "블랙", "M")],
), [], "⑤ trim 동치 → []");

// (보강) 이름 없으면 productId 반환
eq(missingCartHoldRows([row("999", "블랙", "M", "")], []), ["999"], "이름 없으면 productId");

console.log(`✅ cart-hold-gate ${pass}건 통과`);
