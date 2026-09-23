// 고객이슈 «대상상품» 표기 — 사진을 되찾기 위한 매칭 규칙
import assert from "node:assert/strict";
import { issueProductLabel, issueProductSummary, pickIssueProductRows } from "../lib/issueProductLabel.ts";

// ① 실제 이슈 문구와 글자까지 같아야 한다 (order-return/route.ts 가 만들던 것)
assert.equal(
  issueProductLabel({ product_name: "폴로 청남방", color: "", size: "XL", qty: 1 }),
  "폴로 청남방(XL)×1",
);
assert.equal(
  issueProductLabel({ product_name: "알로 뮬 2컬러", color: "회베이지", size: "240", qty: 1 }),
  "알로 뮬 2컬러(회베이지/240)×1",
);
assert.equal(
  issueProductLabel({ product_name: "BB(버버리)-78 트렌치코트", color: "", size: "12", qty: 1 }),
  "BB(버버리)-78 트렌치코트(12)×1",
);

// ② 「없음」은 옵션이 아니다 — 붙으면 안 된다
assert.equal(issueProductLabel({ product_name: "알로가방", color: "없음", size: "없음", qty: 1 }), "알로가방×1");

// ③ 수량은 최소 1
assert.equal(issueProductLabel({ product_name: "상품", qty: 0 }), "상품×1");
assert.equal(issueProductLabel({ product_name: "상품", qty: 3 }), "상품×3");
assert.equal(issueProductLabel({}), "상품×1");

// ④ 여러 개는 쉼표+공백 (본문 저장 형식)
const rows = [
  { id: 1, product_name: "꽃티 폴로", color: "", size: "S", qty: 1 },
  { id: 2, product_name: "메종 쭈리 후드티", color: "블랙", size: "L", qty: 1 },
];
assert.equal(issueProductSummary(rows), "꽃티 폴로(S)×1, 메종 쭈리 후드티(블랙/L)×1");

// ⑤ 한 주문서에 상품이 여러 개여도 «이슈에 적힌 것»만 골라야 한다
const orderRows = [
  ...rows,
  { id: 3, product_name: "나이키 후드티", color: "소라", size: "S", qty: 2 },
];
const picked = pickIssueProductRows(orderRows, "꽃티 폴로(S)×1, 메종 쭈리 후드티(블랙/L)×1");
assert.deepEqual(picked.map((r) => r.id), [1, 2], "고르지 않은 상품까지 딸려오면 엉뚱한 사진이 붙는다");

// ⑥ 못 찾으면 빈 배열 — 엉뚱한 사진보다 «없음»이 낫다
assert.deepEqual(pickIssueProductRows(orderRows, "전혀 다른 상품×1"), []);
assert.deepEqual(pickIssueProductRows(orderRows, ""), []);
assert.deepEqual(pickIssueProductRows([], "꽃티 폴로(S)×1"), []);

// ⑦ 수량이 다르면 다른 상품으로 본다(사장님이 수량을 고쳐 등록한 경우 엉뚱하게 안 붙게)
assert.deepEqual(pickIssueProductRows(orderRows, "나이키 후드티(소라/S)×1"), []);
assert.deepEqual(pickIssueProductRows(orderRows, "나이키 후드티(소라/S)×2").map((r) => r.id), [3]);

console.log("✅ issue product label OK");
