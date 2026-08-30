// scripts/test-admin-detail-search.mjs
// 관리자 상품 검색 검증 — lib/productDetailModel.ts 의 adminDetailSearch 를 그대로 불러서 확인한다.
//
// 막으려는 사고 (2026-08-30 사장님 지적)
//   방송 중 「68」 로 찾았는데 66·67·69 까지 다 나왔다.
//   예전 코드가 이름·코드·색상·사이즈를 이어붙인 뒤 공백을 지워서
//   사이즈 4,6,8,10,12 가 "4681012" 가 되고 그 안에 "68" 이 생겼기 때문이다.
//   방송 중에 엉뚱한 상품을 고정·채팅에 올리면 바로 사고다.
import { adminDetailSearch } from "../lib/productDetailModel.ts";

let fail = 0;
const ok = (c, l) => { if (c) console.log(`✅ ${l}`); else { console.log(`❌ ${l}`); fail = 1; } };
const names = (row, q) => adminDetailSearch(row, q).map((d) => d.detailName);

const brand = (details) => ({
  id: "p1", product_name: "버버리", price: 229000,
  product_note: { brand_group: { enabled: true, detail_options: details } },
});

// 실제 화면과 같은 모양 — 사이즈가 전부 4,6,8,10,12
const row = brand({
  "BB(버버리)-66 트렌치코트": { colors: ["베이지"], sizes: ["4", "6", "8", "10", "12"] },
  "BB(버버리)-67 트렌치코트": { colors: ["블랙"], sizes: ["4", "6", "8", "10", "12"] },
  "BB(버버리)-68 트렌치코트": { colors: ["베이지"], sizes: ["4", "6", "8", "10", "12"] },
  "BB(버버리)-69 트렌치코트": { colors: ["카키"], sizes: ["4", "6", "8", "10", "12"] },
});

console.log("── 사고 재발 방지 (제일 중요) ──");
{
  const r = names(row, "68");
  ok(r.length === 1 && r[0].includes("-68"), `「68」 → 68 하나만 (나온 것: ${r.length}건)`);
}
{
  const r = names(row, "610");
  ok(r.length === 0, `「610」 → 0건 — 사이즈 6과 10이 붙어 만들어지던 가짜 (나온 것: ${r.length}건)`);
}
{
  const r = names(row, "1012");
  ok(r.length === 0, `「1012」 → 0건 — 사이즈 10과 12가 붙던 가짜 (나온 것: ${r.length}건)`);
}
{
  const r = names(row, "코트bb");
  ok(r.length === 0, `「코트bb」 → 0건 — 이름 끝과 코드 앞이 붙던 가짜 (나온 것: ${r.length}건)`);
}

console.log("\n── 원래 되던 검색은 그대로 (회귀 확인) ──");
ok(names(row, "67").length === 1, "「67」 → 67 하나");
ok(names(row, "트렌치").length === 4, "「트렌치」 → 이름에 들어간 4건 전부");
ok(names(row, "트렌치 코트").length === 4, "「트렌치 코트」(띄어씀) → 「트렌치코트」 를 찾는다");
ok(names(row, "블랙").length === 1, "「블랙」 → 색상으로 1건");
ok(names(row, "블").length === 1, "「블」 → 색상 부분일치");
ok(names(row, "BB(버버리)-68").length === 1, "전체 이름으로도 찾는다");
ok(names(row, "bb-68").length === 1, "코드(bb-68) 로도 찾는다 — 대소문자 무시");

console.log("\n── 사이즈는 정확히 같을 때만 ──");
{
  const sizeRow = brand({
    "AA-1 원피스": { colors: ["블랙"], sizes: ["8"] },
    "AA-2 원피스": { colors: ["화이트"], sizes: ["18"] },
    "AA-3 원피스": { colors: ["네이비"], sizes: ["XL"] },
  });
  const r8 = names(sizeRow, "8");
  ok(r8.length === 1 && r8[0].includes("AA-1"), `사이즈 「8」 → 8만. 18은 안 걸린다 (나온 것: ${r8.length}건)`);
  ok(names(sizeRow, "XL").length === 1, "사이즈 「XL」 도 찾는다");
  ok(names(sizeRow, "xl").length === 1, "사이즈는 대소문자 무시");
}

console.log("\n── 빈 값 방어 ──");
ok(names(row, "").length === 0, "빈 검색어 → 0건");
ok(names(row, "   ").length === 0, "공백만 → 0건");
ok(adminDetailSearch({}, "68").length === 0, "세부상품이 없는 상품 → 0건 (안 깨짐)");
ok(names(row, "존재하지않는말").length === 0, "없는 말 → 0건");

console.log(fail ? "\n관리자 상품 검색 테스트 실패" : "\n관리자 상품 검색 테스트 통과");
process.exit(fail);
