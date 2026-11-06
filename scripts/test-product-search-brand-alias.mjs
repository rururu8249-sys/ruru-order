import assert from "node:assert/strict";
import { productSearchMatches, brandQueryVariants, registerBrandSearchAliases, detailCodePrefix } from "../lib/productSearch.ts";
import { registerBrandAliasesFromProducts } from "../lib/brandSearchAliases.ts";

// 기본값만으로: 사장님 예시 전부 CH-202 를 찾음
for (const q of ["샤넬202", "샤넬-202", "샤넬 202", "샤202", "ch-202", "ch202", "CH 202", "chanel202", "Chanel-202"]) {
  assert.equal(productSearchMatches("CH-202 블랙 트위드 자켓", q), true, q);
}
assert.equal(productSearchMatches("PD-202", "프라다202"), true);
assert.equal(productSearchMatches("PD-202", "프202"), true);
assert.equal(productSearchMatches("GC-1", "구찌1"), true);
assert.equal(productSearchMatches("BB-64", "버버리64"), true);
// 다른 브랜드·다른 번호는 안 걸림
assert.equal(productSearchMatches("PD-202", "샤넬202"), false);
assert.equal(productSearchMatches("CH-2021", "샤넬202"), false);
assert.equal(productSearchMatches("CH-20", "샤넬202"), false);
// 영어 앞부분이 짧으면(2글자 이하) 바꾸지 않음 — 우연한 섞임 방지
assert.deepEqual(brandQueryVariants("ch202"), []);
assert.deepEqual(brandQueryVariants("c202"), []);
// 숫자 없는 검색어는 예전 그대로
assert.deepEqual(brandQueryVariants("샤넬"), []);
assert.equal(productSearchMatches("니트 가디건", "니트"), true);
assert.equal(productSearchMatches("MIU-20", "miu2"), false);

// 데이터에서 자동: 몽클레어 묶음 세부상품이 MC-… 이면 「몽클레어12」→ MC-12
assert.equal(detailCodePrefix("MC-12 블랙 패딩"), "mc");
assert.equal(detailCodePrefix("상품명 없음-7"), "");
registerBrandAliasesFromProducts([
  { id: 1, product_name: "몽클레어", product_note: { brand_group: { enabled: true }, combo_mode: "brand" }, color_options: ["MC-12 블랙 패딩", "MC-13 화이트", "MC-14"] },
]);
// detailProducts 가 이 형태를 못 읽어도 직접 등록 경로로 확인
registerBrandSearchAliases([{ brandName: "몽클레어", detailNames: ["MC-12 블랙 패딩", "MC-13 화이트", "MC-14"] }]);
assert.equal(productSearchMatches("MC-12 블랙 패딩", "몽클레어12"), true);
assert.equal(productSearchMatches("MC-12 블랙 패딩", "몽12"), true);
// 한 번만 섞인 앞 글자(우연)는 등록 안 함
registerBrandSearchAliases([{ brandName: "기타브랜드", detailNames: ["XY-1", "BC-201", "BC-101", "폴로 셔츠"] }]);
assert.equal(productSearchMatches("XY-1", "기타1"), false);
assert.equal(productSearchMatches("BC-201", "기타201"), true);

console.log("brand alias search tests passed");
