// [2026-08-29 개선 A] "실제 판매가 직접 입력" 역산 규칙 검증
//
// 왜 필요한가 — 돈이 걸린 변경이다.
//   예전: 관리자가 "추가금"을 넣었다.  판매가 = 대표가 + 추가금
//   지금: 관리자가 "판매가"를 넣는다.  추가금 = 판매가 - 대표가  (저장값·계산식은 그대로)
//   역산이 한 번이라도 틀리면 손님이 내는 금액이 바뀐다.
//
// ⚠ 저장되는 값은 여전히 "추가금"이고, 손님 화면 계산식(detailPricePresentation)은 손대지 않았다.
//   그래서 역산 → 저장 → 손님화면 계산 을 한 바퀴 돌려 원래 판매가가 그대로 나오는지 본다.

import assert from "node:assert";
import { detailPricePresentation } from "../lib/productDetailModel.ts";

// 폼의 applySalePrice 와 같은 규칙
function backCalcPlus(typed, basePrice) {
  const digits = String(typed ?? "").replace(/[^0-9]/g, "");
  if (!digits) return { plus: "", applied: false, reason: "빈 값" };
  const sale = Number(digits) || 0;
  const base = Math.max(0, Math.floor(Number(basePrice) || 0));
  if (sale < base) return { plus: null, applied: false, reason: "대표가보다 낮음" };
  return { plus: String(sale - base), applied: true, reason: "" };
}

const roundTrip = (typed, base) => {
  const r = backCalcPlus(typed, base);
  if (!r.applied) return r;
  return { ...r, sale: detailPricePresentation(base, r.plus).actualPrice };
};

// ── ① 기본 왕복: 넣은 판매가가 그대로 나와야 한다 ──
for (const [base, typed] of [[129000, "265000"], [139000, "139000"], [199000, "329000"], [0, "89000"]]) {
  const r = roundTrip(typed, base);
  assert.ok(r.applied, `${typed} 적용돼야 함`);
  assert.equal(r.sale, Number(typed), `판매가 ${typed} → 저장 → 다시 계산하면 ${typed} 이어야 함 (나온 값 ${r.sale})`);
}

// ── ② 콤마·원 표기가 섞여도 같은 결과 ──
assert.equal(roundTrip("265,000", 129000).sale, 265000);
assert.equal(roundTrip("265000원", 129000).sale, 265000);
assert.equal(roundTrip(" 265,000 ", 129000).sale, 265000);

// ── ③ 대표가와 같으면 추가금 0 ──
assert.equal(backCalcPlus("129000", 129000).plus, "0");

// ── ④ 대표가보다 낮으면 적용하지 않는다 (추가금 음수 금지) ──
{
  const r = backCalcPlus("99000", 129000);
  assert.equal(r.applied, false, "대표가보다 낮은 판매가는 적용하면 안 된다");
  assert.equal(r.plus, null, "값을 건드리지 않고 그대로 둔다");
}

// ── ⑤ 빈 값이면 추가금을 비운다 (0원 강제 저장 금지) ──
assert.equal(backCalcPlus("", 129000).plus, "");

// ── ⑥ 저장 계산식은 예전 그대로 (추가금을 직접 넣던 방식과 결과가 같아야 한다) ──
assert.equal(detailPricePresentation(129000, 136000).actualPrice, 265000, "대표가 + 추가금 = 판매가");
assert.equal(detailPricePresentation(129000, 0).actualPrice, 129000);
assert.equal(detailPricePresentation(129000, -5000).actualPrice, 129000, "음수 추가금은 0으로 막혀 있어야 한다");

// ── ⑦ 대표가를 바꾸면 판매가가 같이 움직인다 (경고를 띄우는 근거) ──
{
  const plus = backCalcPlus("265000", 129000).plus;      // 136,000
  const afterBaseChange = detailPricePresentation(139000, plus).actualPrice;
  assert.equal(afterBaseChange, 275000, "대표가를 올리면 세부상품 판매가도 그만큼 올라간다");
}

console.log("test-sale-price-backcalc: 통과 (16개 검사)");
