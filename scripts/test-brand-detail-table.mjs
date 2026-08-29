// [2026-08-29] 브랜드 상품 "표에서 바로 고치기" 시뮬레이션 검사
//
// 사장님이 직접 눌러보지 않아도 되도록, 실제 화면이 쓰는 계산 함수를 그대로 돌려서
// 손님 화면 함수(detailProducts)에 넣었을 때 결과가 맞는지 확인한다.
//
// 특히 확인하는 것 — 여기가 어긋나면 돈·재고 사고가 난다:
//   · 재고 키가 "세부상품 / 색상" + 사이즈 형태로 유지되는가
//   · 이름을 바꿔도 사진·가격·재고·숨김이 따라오는가
//   · 판매가를 넣으면 손님이 보는 금액이 정확히 그 금액인가

import assert from "node:assert";
import {
  AXIS_JOIN,
  addDetailRow,
  buildRowsForDetail,
  productNameFromFileName,
  removeDetailRow,
  renameDetail,
  salePriceToPlus,
  setDetailAxis,
  splitCsv,
} from "../lib/brandDetailTableOps.ts";
import { detailProducts, isBrandGroup } from "../lib/productDetailModel.ts";

const BASE = 179000;
let pass = 0;
const ok = (label) => { pass += 1; console.log("  ✓ " + label); };

// 폼 상태 → 실제 저장되는 상품 행(손님 화면이 읽는 형태)
function toProductRow(state, basePrice) {
  const note = {
    brand_group: {
      enabled: true,
      brand_ko: "버버리",
      brand_en: "BURBERRY",
      detail_categories: state.categories,
      detail_options: state.options,
    },
    detail_photo_sets: state.photoSets,
    combo_mode: true,
    option_label: "종류",
    option_pricing: Object.fromEntries(
      state.details.map((n) => [n, Math.max(0, Number(state.detailPlus[n]) || 0)]),
    ),
    combo_hidden: state.hidden,
    detail_photos: state.detailPhotos,
    stock_mode: "option",
    stock_variants: state.variantRows.map((r) => ({ color: r.color, size: r.size, stock: r.stock })),
    stock_management_enabled: false,
    option_axes: [
      { key: "detail", label: "종류", values: state.details },
      { key: "color", label: "색상", values: [...new Set(Object.values(state.options).flatMap((o) => o.colors))] },
      { key: "size", label: "사이즈", values: [...new Set(Object.values(state.options).flatMap((o) => o.sizes))] },
    ],
    combo_detail_values: state.details.filter((n) => !state.hidden.includes(n)),
  };
  return {
    id: "9001",
    product_name: "버버리",
    price: basePrice,
    color_options: note.combo_detail_values,
    product_note: JSON.stringify(note),
  };
}

function emptyState() {
  return { details: [], detailPlus: {}, detailPhotos: {}, photoSets: {}, categories: {}, options: {}, hidden: [], variantRows: [] };
}

console.log("\n[1] 빈 상태에서 브랜드 상품 만들기 (사장님이 실제로 하실 순서)");
let s = emptyState();

// ① 사진 3장을 몽땅 끌어다 놓았다고 가정 → 파일 이름이 상품명이 된다
const dropped = ["BB-39.jpg", "BB-40.JPEG", "BB-80 트렌치.png"];
dropped.forEach((f) => {
  const r = addDetailRow(s, { basePrice: BASE });
  s = r.state;
  const named = renameDetail(s, r.name, productNameFromFileName(f));
  assert.ok(named.ok, "파일 이름으로 이름짓기 실패: " + (named.ok ? "" : named.reason));
  s = named.state;
  s.photoSets = { ...s.photoSets, [productNameFromFileName(f)]: [`https://img/${f}`] };
  s.detailPhotos = { ...s.detailPhotos, [productNameFromFileName(f)]: `https://img/${f}` };
});
assert.deepEqual(s.details, ["BB-39", "BB-40", "BB-80 트렌치"]);
ok("사진 3장 → 줄 3개 생성 + 파일 이름이 상품명 (BB-39.jpg → BB-39)");

// ② 첫 줄에 색상·사이즈를 넣는다
s = setDetailAxis(s, "BB-39", "colors", "블랙");
s = setDetailAxis(s, "BB-39", "sizes", "4, 6, 8, 10, 12");
assert.deepEqual(s.options["BB-39"].sizes, ["4", "6", "8", "10", "12"]);
assert.equal(s.variantRows.filter((r) => r.detail === "BB-39").length, 5);
ok("색상·사이즈를 쉼표로 적으면 조합 5개가 만들어진다");

// ③ 재고 키가 "세부상품 / 색상" 형태인지 — 여기가 사고 지점
const keys = s.variantRows.filter((r) => r.detail === "BB-39").map((r) => `${r.color}|${r.size}`);
assert.deepEqual(keys, [
  "BB-39 / 블랙|4", "BB-39 / 블랙|6", "BB-39 / 블랙|8", "BB-39 / 블랙|10", "BB-39 / 블랙|12",
]);
ok('재고 키가 "세부상품 / 색상" + 사이즈 로 정확히 만들어진다');

// ④ 판매가 입력 → 추가금 역산
const p1 = salePriceToPlus("265,000", BASE);
assert.ok(p1.applied && p1.plus === "86000");
s.detailPlus = { ...s.detailPlus, "BB-80 트렌치": p1.plus };
ok("판매가 265,000 입력 → 추가금 86,000 자동 계산");

const p2 = salePriceToPlus("99000", BASE);
assert.equal(p2.applied, false);
assert.equal(p2.reason, "belowBase");
ok("대표가보다 낮은 금액은 적용하지 않는다 (추가금 마이너스 방지)");

console.log("\n[2] 손님 화면에서 제대로 보이는가");
let row = toProductRow(s, BASE);
assert.equal(isBrandGroup(row), true);
let list = detailProducts(row, { includeHidden: false });
assert.equal(list.length, 3);
ok("브랜드 상품으로 인식되고 세부상품 3개가 나온다");

assert.equal(list[0].price, 179000, "BB-39 는 추가금 없음");
assert.equal(list[2].price, 265000, "BB-80 은 대표가+추가금 = 넣은 판매가 그대로");
ok("손님이 보는 금액이 사장님이 넣은 판매가와 정확히 같다 (265,000원)");

assert.deepEqual(list[0].sizes, ["4", "6", "8", "10", "12"]);
assert.deepEqual(list[0].colors, ["블랙"]);
assert.equal(list[0].image, "https://img/BB-39.jpg");
ok("세부상품마다 색상·사이즈·사진이 따로 붙는다");

console.log("\n[3] 이름을 바꿔도 사진·가격·재고가 따라오는가 (제일 위험한 동작)");
const before = { photos: s.photoSets["BB-80 트렌치"], plus: s.detailPlus["BB-80 트렌치"] };
const renamed = renameDetail(s, "BB-80 트렌치", "BB-80 롱트렌치코트");
assert.ok(renamed.ok);
s = renamed.state;

assert.deepEqual(s.photoSets["BB-80 롱트렌치코트"], before.photos, "사진이 따라와야 한다");
assert.equal(s.detailPlus["BB-80 롱트렌치코트"], before.plus, "가격(추가금)이 따라와야 한다");
assert.equal(s.photoSets["BB-80 트렌치"], undefined, "옛 이름은 남으면 안 된다");
assert.equal(s.variantRows.some((r) => r.detail === "BB-80 트렌치"), false, "옛 이름 재고행이 남으면 안 된다");
ok("이름을 바꾸면 사진·가격·재고·구분이 전부 함께 옮겨진다");

row = toProductRow(s, BASE);
list = detailProducts(row, { includeHidden: false });
const renamedItem = list.find((d) => d.detailName === "BB-80 롱트렌치코트");
assert.ok(renamedItem, "바뀐 이름이 손님 화면에 나와야 한다");
assert.equal(renamedItem.price, 265000, "이름을 바꿔도 금액이 그대로여야 한다");
ok("이름을 바꿔도 손님 화면 금액이 265,000원 그대로");

console.log("\n[4] 막아야 하는 것");
assert.equal(renameDetail(s, "BB-39", "BB-40").ok, false);
ok("같은 이름 두 개는 막는다");
assert.equal(renameDetail(s, "BB-39", "").ok, false);
ok("빈 이름은 막는다");
assert.equal(renameDetail(s, "BB-39", "BB-39 / 블랙").ok, false);
ok('상품명에 "/" 는 막는다 (재고 키와 충돌)');

console.log("\n[5] 줄 빼기");
const removed = removeDetailRow(s, "BB-40");
assert.ok(removed.ok);
assert.equal(removed.state.details.includes("BB-40"), false);
assert.equal(removed.state.variantRows.some((r) => r.detail === "BB-40"), false);
ok("줄을 빼면 그 상품의 재고행도 같이 사라진다");

const one = { ...emptyState(), details: ["하나뿐"] };
assert.equal(removeDetailRow(one, "하나뿐").ok, false);
ok("마지막 한 줄은 뺄 수 없다 (고를 게 없는 브랜드 방지)");

console.log("\n[6] 숨김 처리");
s.hidden = ["BB-39"];
row = toProductRow(s, BASE);
assert.equal(detailProducts(row, { includeHidden: false }).length, 2, "손님 화면에서 빠져야 한다");
assert.equal(detailProducts(row, { includeHidden: true }).length, 3, "관리자 화면에는 남아야 한다");
ok("숨긴 상품은 손님 화면에서만 빠진다");

console.log("\n[7] 수량을 넣어둔 뒤 색상을 바꿔도 수량이 살아있는가");
let t = emptyState();
t = addDetailRow(t, { name: "AA-1", basePrice: BASE }).state;
t = setDetailAxis(t, "AA-1", "colors", "블랙");
t = setDetailAxis(t, "AA-1", "sizes", "S,M");
t.variantRows = t.variantRows.map((r) => (r.size === "M" ? { ...r, stock: 7 } : r));
t = setDetailAxis(t, "AA-1", "colors", "블랙,화이트");
const kept = t.variantRows.find((r) => r.colorOnly === "블랙" && r.size === "M");
assert.equal(kept.stock, 7, "원래 있던 수량이 살아있어야 한다");
assert.equal(t.variantRows.filter((r) => r.detail === "AA-1").length, 4, "블랙·화이트 × S·M = 4조합");
ok("색상을 추가해도 이미 넣어둔 수량은 그대로 살아있다");

console.log("\n[8] 자잘한 입력 처리");
assert.deepEqual(splitCsv(" 블랙 , 베이지 ,, 블랙 "), ["블랙", "베이지"]);
ok("쉼표 입력의 공백·중복·빈칸을 정리한다");
assert.equal(productNameFromFileName("BB-39.jpg"), "BB-39");
assert.equal(productNameFromFileName("몽클레어 MC-101M.HEIC"), "몽클레어 MC-101M");
ok("파일 이름에서 확장자만 떼고 상품명으로 쓴다");
assert.deepEqual(
  buildRowsForDetail("X", [], [], []).map((r) => `${r.color}|${r.size}`),
  ["X / 없음|"],
  "색상·사이즈가 없으면 없음 조합 하나",
);
ok("색상·사이즈가 없는 상품도 조합이 깨지지 않는다");

console.log(`\ntest-brand-detail-table: 통과 (${pass}개 항목)\n`);
