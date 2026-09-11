// 위젯 사이즈 축약 규칙 — 2026-09-11 사장님 지침: 이어지면 「S ~ XXL」, 중간이 비면 따로따로.
//   케이스는 products.size_options 실측 상위 형태(2026-09-11) 그대로.
import assert from "node:assert/strict";
import { compressSizeList } from "../lib/sizeRange.ts";

// ① 이어진 알파벳 3개 이상 → 한 토막
assert.deepEqual(compressSizeList(["S", "M", "L"]), ["S ~ L"]);                          // ×46
assert.deepEqual(compressSizeList(["S", "M", "L", "XL"]), ["S ~ XL"]);                   // ×35
assert.deepEqual(compressSizeList(["XS", "S", "M", "L"]), ["XS ~ L"]);                   // ×6
assert.deepEqual(compressSizeList(["M", "L", "XL", "XXL"]), ["M ~ XXL"]);                // ×5
assert.deepEqual(compressSizeList(["XXS", "XS", "S", "M"]), ["XXS ~ M"]);                // ×2
// ② 2XL 은 XXL 과 같은 칸
assert.deepEqual(compressSizeList(["S", "M", "L", "XL", "2XL"]), ["S ~ 2XL"]);           // ×5
assert.deepEqual(compressSizeList(["L", "XL", "XXL", "3XL"]), ["L ~ 3XL"]);
// ③ 중간이 비면 따로따로 (사장님 예시)
assert.deepEqual(compressSizeList(["S", "M", "XXL"]), ["S", "M", "XXL"]);
assert.deepEqual(compressSizeList(["XS", "XL"]), ["XS", "XL"]);                          // ×1
// ④ 2개는 줄여도 안 짧아지니 그대로
assert.deepEqual(compressSizeList(["S", "M"]), ["S", "M"]);
assert.deepEqual(compressSizeList(["55", "66"]), ["55", "66"]);                          // ×9
// ⑤ 숫자 등차 — 36/38/40(표시 변환 뒤에도), 4·6·8·10·12, 신발 5단위
assert.deepEqual(compressSizeList(["36(S)", "38(M)", "40(L)"]), ["36(S) ~ 40(L)"]);      // ×122 (표시변환 후)
assert.deepEqual(compressSizeList(["4", "6", "8", "10", "12"]), ["4 ~ 12"]);             // ×7
assert.deepEqual(compressSizeList(["225", "230", "235", "240", "245", "250"]), ["225 ~ 250"]);
assert.deepEqual(compressSizeList(["225(US5.5)", "230(US6)", "235(US6.5)", "240(US7)"]), ["225(US5.5) ~ 240(US7)"]);
// ⑥ 숫자 간격이 깨지면 거기서 끊김
assert.deepEqual(compressSizeList(["230", "235", "240", "250"]), ["230 ~ 240", "250"]);
// ⑦ 섞인 목록 — 종류별로 이어진 것만 묶임 (실제 저장 형태)
assert.deepEqual(compressSizeList(["36", "38", "40", "S", "M", "L"]), ["36 ~ 40", "S ~ L"]);
assert.deepEqual(
  compressSizeList(["S", "M", "L", "XL", "4", "6", "8", "10", "XL", "48", "50", "52", "54"]),
  ["S ~ XL", "4 ~ 10", "XL", "48 ~ 54"],
);
// ⑧ 사다리에 없는 값은 그대로
assert.deepEqual(compressSizeList(["XS-S", "M-L", "XL-XXL"]), ["XS-S", "M-L", "XL-XXL"]); // ×2
assert.deepEqual(compressSizeList(["FREE"]), ["FREE"]);                                  // ×8
assert.deepEqual(compressSizeList(["S/44", "M/46", "L/48"]), ["S/44", "M/46", "L/48"]);
// ⑨ 괄호 꼬리 — 앞부분으로 판단, 표시는 원문
assert.deepEqual(compressSizeList(["S(2)", "M(4)", "L(6)", "XL(8)"]), ["S(2) ~ XL(8)"]);
// ⑩ 저장 순서 유지 — 내림차순이면 그대로
assert.deepEqual(compressSizeList(["XL", "L", "M", "S"]), ["XL ~ S"]);
// ⑪ 빈 값·공백
assert.deepEqual(compressSizeList([]), []);
assert.deepEqual(compressSizeList([" ", "M"]), ["M"]);
console.log("✅ test-size-range 25개 통과");
