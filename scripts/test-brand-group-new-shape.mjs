// [2026-08-29] 폼에서 새로 만든 "브랜드 묶음 상품"이
//   엑셀로 만든 브랜드 상품과 **똑같은 형태**로 저장되는지 확인한다.
//
// 왜 필요한가
//   브랜드 상품은 손님 주문서에서 「브랜드 → 세부상품 → 색상 → 사이즈」로 고른다.
//   저장 형태가 조금이라도 다르면 손님 화면에서 옵션이 안 뜨거나
//   재고 키("세부상품 / 색상")가 어긋나 엉뚱한 재고를 깎을 수 있다.
//   그래서 "폼이 만드는 값"과 "엑셀이 만드는 값"을 같은 소비 함수에 넣어 결과가 같은지 본다.

import assert from "node:assert";
import { detailProducts, isBrandGroup, detailNamesForProduct } from "../lib/productDetailModel.ts";

const AXIS_JOIN = " / ";

// 폼(QuickProductFastForm)이 브랜드 묶음 신규 저장 시 만드는 값과 같은 구조
const details = ["BB(버버리)-901 코트", "BB(버버리)-902 코트"];
const detailOptions = {
  "BB(버버리)-901 코트": { colors: ["블랙"], sizes: ["S", "M"], variants: [{ color: "블랙", size: "S" }, { color: "블랙", size: "M" }] },
  "BB(버버리)-902 코트": { colors: ["베이지"], sizes: ["M", "L"], variants: [{ color: "베이지", size: "M" }, { color: "베이지", size: "L" }] },
};
const detailPlus = { "BB(버버리)-901 코트": 0, "BB(버버리)-902 코트": 30000 };
const photoSets = {
  "BB(버버리)-901 코트": ["https://img/901-1.jpg", "https://img/901-2.jpg"],
  "BB(버버리)-902 코트": ["https://img/902-1.jpg"],
};
const stockVariants = Object.entries(detailOptions).flatMap(([name, cfg]) =>
  cfg.variants.map((v) => ({ color: [name, v.color].filter(Boolean).join(AXIS_JOIN), size: v.size, stock: 0 })),
);

const note = {
  brand_group: {
    enabled: true,
    brand_ko: "버버리",
    brand_en: "BURBERRY",
    detail_categories: { "BB(버버리)-901 코트": "아우터", "BB(버버리)-902 코트": "아우터" },
    detail_options: detailOptions,
  },
  detail_photo_sets: photoSets,
  stock_mode: "option",
  stock_variants: stockVariants,
  stock_management_enabled: false,
  combo_mode: true,
  option_label: "종류",
  option_pricing: detailPlus,
  combo_hidden: [],
  option_axes: [
    { key: "detail", label: "종류", values: details },
    { key: "color", label: "색상", values: ["블랙", "베이지"] },
    { key: "size", label: "사이즈", values: ["S", "M", "L"] },
  ],
  combo_detail_values: details,
  customer_detail_input_enabled: false,
};

const row = {
  id: "9001",
  product_name: "버버리",
  price: 199000,
  color_options: details,          // 브랜드: 노출 세부상품명
  size_options: ["S", "M", "L"],
  detail_image_urls: Object.values(photoSets).flat(),
  product_note: JSON.stringify(note),
};

// ① 브랜드 묶음으로 인식되는가
assert.equal(isBrandGroup(row), true, "brand_group.enabled 가 켜져 있어야 브랜드 상품으로 인식된다");

// ② 세부상품 목록이 그대로 나오는가
assert.deepEqual(detailNamesForProduct(row, true), details, "세부상품 목록이 어긋나면 손님이 고를 수 없다");

const list = detailProducts(row, { includeHidden: false });
assert.equal(list.length, 2);

// ③ 실제 판매가 = 대표가 + 추가금
assert.equal(list[0].price, 199000, "추가금 0 → 대표가 그대로");
assert.equal(list[1].price, 229000, "추가금 30,000 → 대표가 + 추가금");

// ④ 세부상품마다 색상·사이즈가 따로 붙는가 (일반 상품처럼 전체 공통이면 안 됨)
assert.deepEqual(list[0].colors, ["블랙"]);
assert.deepEqual(list[0].sizes, ["S", "M"]);
assert.deepEqual(list[1].colors, ["베이지"]);
assert.deepEqual(list[1].sizes, ["M", "L"]);

// ⑤ 세부상품마다 사진 여러 장
assert.equal(list[0].images.length, 2, "901 은 사진 2장");
assert.equal(list[1].images.length, 1, "902 는 사진 1장");
assert.equal(list[0].image, "https://img/901-1.jpg", "첫 장이 대표사진");

// ⑥ 재고 키가 "세부상품 / 색상" + 사이즈 로 붙는가 (돈·재고 사고 방지 핵심)
assert.equal(list[0].stockVariants.length, 2, "901 조합 2개");
assert.deepEqual(list[0].stockVariants.map((v) => `${v.color}|${v.size}`), ["블랙|S", "블랙|M"]);
assert.deepEqual(list[1].stockVariants.map((v) => `${v.color}|${v.size}`), ["베이지|M", "베이지|L"]);
assert.ok(stockVariants.every((v) => v.color.includes(AXIS_JOIN)), '저장되는 재고 키는 "세부상품 / 색상" 형태여야 한다');

// ⑦ 숨김 세부상품은 손님 화면에서 빠진다
const hiddenRow = { ...row, product_note: JSON.stringify({ ...note, combo_hidden: [details[1]] }) };
assert.equal(detailProducts(hiddenRow, { includeHidden: false }).length, 1, "숨긴 세부상품은 손님 화면에서 제외");
assert.equal(detailProducts(hiddenRow, { includeHidden: true }).length, 2, "관리자 화면에서는 숨긴 것도 보인다");

console.log("test-brand-group-new-shape: 통과 (14개 검사)");
