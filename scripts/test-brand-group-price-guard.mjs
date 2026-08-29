// [2026-08-29 P0-6] 브랜드 대표상품 엑셀 추가병합 — 기존 세부상품 "실제 판매가" 불변 검사
//
// 배경:
//   세부상품 실제가 = products.price(대표가) + product_note.option_pricing[세부상품명](추가금)
//   병합 시 대표가를 더 싼 쪽(Math.min)으로 낮추면서 추가금을 그대로 두면
//   기존 세부상품 수십 개의 판매가가 한꺼번에 내려간다(방송 중이면 그대로 팔림).
//
// 이 테스트가 지키는 것:
//   병합 전후로 "모든 세부상품의 실제 판매가"가 1원도 달라지지 않는다.
//   (대표가와 추가금이 어떻게 재배분되든 실제가는 고정)

import { mergeBrandGroupProduct } from "../lib/brandGroupMerge.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected=${String(expected)} actual=${String(actual)}`);
}

const DETAIL_A = "BB(버버리)-401M 남성용 패딩 아우터 · 블랙"; // 실제가 239,000
const DETAIL_B = "BB(버버리)-203 상의";                        // 실제가 129,000
const DETAIL_C = "BB(버버리)-900 신상 상의";                    // 실제가 149,000 (신규)

function makeExisting(price) {
  return {
    id: 673,
    product_name: "버버리",
    price,
    stock: 10,
    detail_image_urls: ["a1.jpg", "b1.jpg"],
    product_note: {
      combo_mode: true,
      stock_management_enabled: true,
      stock_variants: [
        { color: `${DETAIL_A} / 블랙`, size: "L", stock: 3 },
        { color: DETAIL_B, size: "M", stock: 2 },
      ],
      option_pricing: { [DETAIL_A]: 110000, [DETAIL_B]: 0 },
      detail_photos: { [DETAIL_A]: "a1.jpg", [DETAIL_B]: "b1.jpg" },
      detail_photo_sets: { [DETAIL_A]: ["a1.jpg"], [DETAIL_B]: ["b1.jpg"] },
      combo_hidden: [],
      brand_group: {
        enabled: true,
        brand_ko: "버버리",
        brand_en: "BURBERRY",
        detail_categories: { [DETAIL_A]: "아우터", [DETAIL_B]: "상의" },
        detail_options: {
          [DETAIL_A]: { colors: ["블랙"], sizes: ["L"], variants: [{ color: "블랙", size: "L", stock: 3 }] },
          [DETAIL_B]: { colors: [], sizes: ["M"], variants: [{ color: "", size: "M", stock: 2 }] },
        },
      },
      import_batch: "batch-old",
    },
  };
}

function makeIncoming(price, plus) {
  return {
    product_name: "버버리",
    price,
    stock: 5,
    detail_image_urls: ["c1.jpg"],
    product_note: {
      combo_mode: true,
      stock_management_enabled: true,
      stock_variants: [{ color: DETAIL_C, size: "M", stock: 5 }],
      option_pricing: { [DETAIL_C]: plus },
      detail_photos: { [DETAIL_C]: "c1.jpg" },
      detail_photo_sets: { [DETAIL_C]: ["c1.jpg"] },
      combo_hidden: [],
      brand_group: {
        enabled: true,
        brand_ko: "버버리",
        brand_en: "BURBERRY",
        detail_categories: { [DETAIL_C]: "상의" },
        detail_options: {
          [DETAIL_C]: { colors: [], sizes: ["M"], variants: [{ color: "", size: "M", stock: 5 }] },
        },
      },
    },
  };
}

function actualPrices(result) {
  const note = JSON.parse(result.values.product_note);
  const base = Number(result.values.price);
  const pricing = note.option_pricing || {};
  const out = {};
  for (const name of Object.keys(pricing)) out[name] = base + Number(pricing[name] || 0);
  return out;
}

// ── 1. 위험 케이스: 더 싼 상품을 추가 병합 (대표가 129,000 → 99,000으로 내려감) ──
{
  const existing = makeExisting(129000);
  const incoming = makeIncoming(99000, 50000); // 신규 실제가 149,000
  const result = mergeBrandGroupProduct(existing, incoming, "batch-new");
  const prices = actualPrices(result);

  equal(prices[DETAIL_A], 239000, "기존 세부상품 A 실제 판매가가 변하면 안 된다");
  equal(prices[DETAIL_B], 129000, "기존 세부상품 B 실제 판매가가 변하면 안 된다");
  equal(prices[DETAIL_C], 149000, "신규 세부상품 C 실제 판매가가 맞아야 한다");
  equal(Number(result.values.price), 99000, "대표가는 최저가로 내려간다(최저가 표기 유지)");

  const note = JSON.parse(result.values.product_note);
  assert(
    Object.values(note.option_pricing).every((v) => Number(v) >= 0),
    "추가금이 음수가 되면 안 된다",
  );
}

// ── 2. 정상 케이스: 더 비싼 상품을 추가 병합 (대표가 유지) ──
{
  const existing = makeExisting(129000);
  const incoming = makeIncoming(199000, 0); // 신규 실제가 199,000
  const result = mergeBrandGroupProduct(existing, incoming, "batch-new");
  const prices = actualPrices(result);

  equal(Number(result.values.price), 129000, "대표가가 유지돼야 한다");
  equal(prices[DETAIL_A], 239000, "기존 A 실제가 유지");
  equal(prices[DETAIL_B], 129000, "기존 B 실제가 유지");
  equal(prices[DETAIL_C], 199000, "신규 C 실제가 유지");

  const note = JSON.parse(result.values.product_note);
  equal(Number(note.option_pricing[DETAIL_A]), 110000, "대표가가 그대로면 기존 추가금도 그대로여야 한다");
}

// ── 3. 결과에 검수용 가격 대조표가 실려 있어야 한다 (UI/로그가 확인할 수 있게) ──
{
  const existing = makeExisting(129000);
  const incoming = makeIncoming(99000, 50000);
  const result = mergeBrandGroupProduct(existing, incoming, "batch-new");

  assert(Array.isArray(result.detailPriceChecks), "detailPriceChecks 배열이 있어야 한다");
  equal(result.detailPriceChecks.length, 3, "세부상품 3개 전부 대조되어야 한다");
  assert(
    result.detailPriceChecks.every((row) => row.before === row.after),
    "대조표의 before/after 실제가가 전부 같아야 한다",
  );
  equal(result.basePriceBefore, 129000, "병합 전 대표가");
  equal(result.basePriceAfter, 99000, "병합 후 대표가");
}

// ── 4. 기존 보호장치가 그대로 살아 있는지 (회귀 방지) ──
{
  // 같은 세부상품명이 겹치면 중단
  const existing = makeExisting(129000);
  const dup = makeIncoming(199000, 0);
  dup.product_note.option_pricing = { [DETAIL_A]: 0 };
  dup.product_note.detail_photo_sets = { [DETAIL_A]: ["dup.jpg"] };
  dup.product_note.detail_photos = { [DETAIL_A]: "dup.jpg" };
  dup.product_note.brand_group.detail_categories = { [DETAIL_A]: "아우터" };
  dup.product_note.brand_group.detail_options = {
    [DETAIL_A]: { colors: ["블랙"], sizes: ["L"], variants: [{ color: "블랙", size: "L", stock: 1 }] },
  };
  let blocked = false;
  try { mergeBrandGroupProduct(existing, dup, "batch-dup"); } catch { blocked = true; }
  assert(blocked, "중복 세부상품 병합은 여전히 차단돼야 한다");

  // 대표상품명이 다르면 중단
  const other = makeIncoming(199000, 0);
  other.product_name = "몽클레어";
  let blocked2 = false;
  try { mergeBrandGroupProduct(makeExisting(129000), other, "b"); } catch { blocked2 = true; }
  assert(blocked2, "대표상품명이 다르면 여전히 차단돼야 한다");

  // 사진 없는 신규 세부상품은 중단
  const noPhoto = makeIncoming(199000, 0);
  noPhoto.product_note.detail_photo_sets = {};
  let blocked3 = false;
  try { mergeBrandGroupProduct(makeExisting(129000), noPhoto, "b"); } catch { blocked3 = true; }
  assert(blocked3, "상세사진 없는 세부상품은 여전히 차단돼야 한다");
}

console.log("brand group price guard tests passed");
