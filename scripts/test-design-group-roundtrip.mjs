// [2026-08-29] 같은 디자인 묶기 — 관리자 저장값이 고객 화면까지 그대로 이어지는지 시뮬레이션 검수
//   관리자 후보계산(suggestDesignGroups) → 저장형태(appendDesignGroups) → 고객화면(resolveDesignGroups)
//   실행: node scripts/test-design-group-roundtrip.mjs
import { suggestDesignGroups, appendDesignGroups } from "../lib/designGroupSuggest.ts";
import { resolveDesignGroups, detailProducts, detailCode } from "../lib/productDetailModel.ts";

let failed = 0;
const assert = (cond, label) => { if (!cond) { failed++; console.error("❌", label); } };
const equal = (a, b, label) => assert(a === b, `${label} (기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)})`);

// 실제 브랜드 대표상품 형태 — 대표가 179,000 / 세부상품 4개
//   401M 블랙 · 402M 브라운 : 같은 설명·같은 가격·같은 사이즈 → 묶음 후보
//   삼각형 가방            : 설명이 다름 → 후보 아님
//   409M(색상 미기재)      : 색상이 없으므로 확정 후보 금지(색상 추정 금지 원칙)
const detailNames = [
  "BB(버버리)-401M 남성용 패딩 아우터 · 블랙",
  "BB(버버리)-402M 남성용 패딩 아우터 · 브라운",
  "BB(버버리)-501M 여성용 숄더백",
  "BB(버버리)-409M 남성용 패딩 아우터",
];
const product = {
  id: "p-1",
  product_name: "버버리",
  price: 179000,
  color_options: detailNames,
  product_note: {
    brand_group: {
      enabled: true,
      detail_options: {
        [detailNames[0]]: { colors: ["블랙"], sizes: ["M", "L"] },
        [detailNames[1]]: { colors: ["브라운"], sizes: ["M", "L"] },
        [detailNames[2]]: { colors: ["베이지"], sizes: ["FREE"] },
        [detailNames[3]]: { colors: [], sizes: ["M", "L"] },
      },
    },
    option_pricing: { [detailNames[2]]: 40000 },
  },
};

// 1) 관리자 화면이 넘기는 입력값 만들기 (QuickProductFastForm.designGroupInputs 와 같은 공식)
const base = 179000;
const plus = product.product_note.option_pricing;
const inputs = detailNames.map((name) => ({
  detailName: name,
  code: detailCode(name),
  price: base + Math.max(0, Number(plus[name]) || 0),
  colors: product.product_note.brand_group.detail_options[name].colors,
  sizes: product.product_note.brand_group.detail_options[name].sizes,
}));

const suggestion = suggestDesignGroups(inputs, []);

// 색상 추정 금지 — 같은 무리에 색상이 안 적힌 상품(409M)이 하나라도 있으면 확정 후보로 올리지 않는다.
equal(suggestion.confident.length, 0, "색상 미기재가 섞이면 확정 후보 0건");
equal(suggestion.needsColor.length, 1, "대신 '확인 필요' 후보 1건");
equal(suggestion.needsColor[0].members.length, 3, "401M·402M·409M 세 개가 한 무리");
assert(!suggestion.needsColor[0].members.includes(detailNames[2]), "설명 다른 숄더백은 후보 아님");
assert(suggestion.needsColor[0].colors.length === 0, "색상이 불완전하면 색상목록을 채우지 않는다");

// 1-2) 409M 에 색상을 채워 넣으면 그때는 확정 후보가 된다 (사람이 색상만 채우면 바로 묶인다)
const filled = inputs.map((d) => (d.detailName === detailNames[3] ? { ...d, colors: ["네이비"] } : d));
const suggestion2 = suggestDesignGroups(filled, []);
equal(suggestion2.confident.length, 1, "색상 채우면 확정 후보 1건");
equal(suggestion2.confident[0].members.length, 3, "확정 후보 3개 묶음");
assert(suggestion2.confident[0].members.includes(detailNames[0]), "401M 포함");
assert(suggestion2.confident[0].members.includes(detailNames[1]), "402M 포함");
assert(!suggestion2.confident.some((c) => c.members.includes(detailNames[2])), "숄더백은 여전히 제외");

// 2) 저장 형태로 변환 — 사장님이 '확인 필요' 후보를 눈으로 보고 체크한 상황
const saved = appendDesignGroups([], suggestion.needsColor.map((c) => ({ id: c.id, members: c.members })));
equal(saved.length, 1, "저장 묶음 1개");

// 3) 고객 화면이 읽는 함수에 그대로 넣어보기
const withGroups = { ...product, product_note: { ...product.product_note, design_groups: saved } };
const rendered = resolveDesignGroups(withGroups);
equal(rendered.length, 1, "고객 화면에 묶음 1개로 보인다");
equal(rendered[0].members.length, 3, "묶음 안에 옵션 3개");

// 4) 가격 방어 — 묶어도 판매가는 그대로여야 한다
const before = new Map(detailProducts(product, { includeHidden: false }).map((d) => [d.detailName, d.price]));
const after = new Map(detailProducts(withGroups, { includeHidden: false }).map((d) => [d.detailName, d.price]));
for (const [name, price] of before) equal(after.get(name), price, `판매가 불변: ${name}`);
equal(before.get(detailNames[2]), 219000, "추가금 상품 실제가 = 대표가+추가금");

// 5) 이미 묶인 것은 다시 후보로 올리지 않는다
const again = suggestDesignGroups(inputs, saved.flatMap((g) => g.members));
equal(again.confident.length, 0, "이미 묶인 건 확정 후보에서 빠진다");
equal(again.needsColor.length, 0, "이미 묶인 건 확인필요 후보에서도 빠진다");

// 6) 한 상품이 두 묶음에 들어가면 막는다
let blocked = false;
try { appendDesignGroups(saved, [{ id: "x", members: [detailNames[0], detailNames[2]] }]); }
catch { blocked = true; }
assert(blocked, "중복 소속은 에러로 막는다");

if (failed > 0) { console.error(`\n${failed}건 실패`); process.exit(1); }
console.log("design group roundtrip tests passed");
