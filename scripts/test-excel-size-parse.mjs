// [2026-08-29] 엑셀 대량등록 — 사이즈 읽기 회귀 테스트
//
// 왜 만들었나
//   실제 원본 2개(삼촌 의류.xlsx / 의류260827셀러.xlsx) 201개 상품을 검사했더니
//   176개가 틀린 사이즈로 읽히고 있었다. 원인 2가지:
//     ① 사이즈 칸이 비어 있으면 머리글 글자로 메웠다  → 「36,38,40」이 「36,38,40,XL」로
//     ② 머리글이 비어 있는 4·5번째 사이즈 칸을 아예 안 읽었다 → 2XL·54·12 가 사라짐
//   그리고 숫자 사이즈(4,6,8,10,12 / 1,2,3,4,5)는 머리글(S,M,L,XL)로 통째로 바뀌어 있었다.
//
// 이 테스트는 그 형태들을 그대로 재현한다. 실패하면 같은 사고가 다시 난 것이다.

import assert from "node:assert";
import { autoGuessConfig, buildDraftCores, isSizeLabel } from "../lib/excelBulkParse.ts";

const H = ["", "품명", "이미지", "컬러", "S", "M", "L", "XL", "XXL", "수량", "세일가"];
const blank = ["", "", "", "", "", "", "", "", "", 0, ""];
const block = (no, code, color, sizes, price) => {
  const row = ["", "", "", "", "", "", "", "", "", "", ""];
  row[0] = String(no); row[1] = code; row[3] = color; row[10] = price;
  sizes.forEach((s, i) => { row[4 + i] = s; });
  return [row, [...blank], [...blank], [...blank], [...blank]];
};

const sizesOf = (rows, code) => {
  const cfg = autoGuessConfig(rows);
  const core = buildDraftCores(rows, cfg).find((c) => (c.code || c.name || "").trim() === code);
  assert.ok(core, `${code} 를 못 읽음`);
  return core.sizes.join(",");
};

// ── ① 사이즈가 머리글보다 적을 때: 빈 칸을 머리글로 메우면 안 된다 ──
{
  const rows = [H, ...block(1, "CH-2", "", ["36", "38", "40"], 225000)];
  assert.equal(sizesOf(rows, "CH-2"), "36,38,40", "빈 칸을 머리글(XL)로 메우면 안 됨");
}
{
  const rows = [H, ...block(1, "BB-47", "", ["S", "M", "L"], 169000)];
  assert.equal(sizesOf(rows, "BB-47"), "S,M,L", "S,M,L 인데 XL 이 붙으면 안 됨");
}

// ── ② 숫자 사이즈를 머리글 글자로 바꾸면 안 된다 ──
{
  const rows = [H, ...block(1, "BB-80", "女肯长款风衣", ["4", "6", "8", "10", "12"], 265000)];
  assert.equal(sizesOf(rows, "BB-80"), "4,6,8,10,12", "버버리 여성 숫자 사이즈가 S,M,L,XL 로 바뀌면 안 됨");
}
{
  const rows = [H, ...block(1, "MC-101M", "몽클", ["1", "2", "3", "4", "5"], 165000)];
  assert.equal(sizesOf(rows, "MC-101M"), "1,2,3,4,5", "몽클레어 1~5 사이즈가 S,M,L,XL 로 바뀌면 안 됨");
}
{
  const rows = [H, ...block(1, "MC-207", "", ["0", "1", "2", "3"], 199000)];
  assert.equal(sizesOf(rows, "MC-207"), "0,1,2,3", "0 부터 시작하는 사이즈도 그대로");
}

// ── ③ 머리글이 비어 있는 사이즈 칸도 읽어야 한다 ──
{
  const H2 = ["", "품명", "이미지", "컬러", "S", "M", "L", "", "", "수량", "세일가"];
  const rows = [H2, ...block(1, "BB-404M", "", ["M", "L", "XL", "2XL"], 219000)];
  assert.equal(sizesOf(rows, "BB-404M"), "M,L,XL,2XL", "머리글 없는 4번째 칸(2XL)이 사라지면 안 됨");
}
{
  const H2 = ["", "품명", "이미지", "컬러", "S", "M", "L", "", "", "수량", "세일가"];
  const rows = [H2, ...block(1, "BB-406M", "", ["48", "50", "52", "54"], 239000)];
  assert.equal(sizesOf(rows, "BB-406M"), "48,50,52,54", "머리글 없는 4번째 칸(54)이 사라지면 안 됨");
}
{
  const rows = [H, ...block(1, "ZEG-1M", "ZEGNA", ["48", "50", "52", "54", "56"], 189000)];
  assert.equal(sizesOf(rows, "ZEG-1M"), "48,50,52,54,56", "5개 사이즈 전부");
}

// ── ④ S/44 같은 합쳐진 표기도 그대로 ──
{
  const rows = [H, ...block(1, "BB-84M", "", ["S/44", "M/46", "L/48", "XL/50", "XXL/52"], 199000)];
  assert.equal(sizesOf(rows, "BB-84M"), "S/44,M/46,L/48,XL/50,XXL/52", "합쳐진 표기 그대로");
}

// ── ⑤ 2XL·3XL 을 사이즈 글자로 인정 ──
assert.equal(isSizeLabel("2XL"), true);
assert.equal(isSizeLabel("3XL"), true);
assert.equal(isSizeLabel("XXL"), true);

// ── ⑥ 수량 칸이 없는 "머리글 자체가 사이즈" 형식(신발)은 예전 동작 유지 ──
{
  const HS = ["번호", "상품명", "230", "240", "250", "세일가"];
  const rows = [HS, ["1", "운동화", 3, 0, 2, 89000]];
  const cfg = autoGuessConfig(rows);
  const core = buildDraftCores(rows, cfg)[0];
  assert.deepEqual(core.sizes, ["230", "240", "250"], "머리글이 사이즈인 형식은 머리글을 그대로 씀");
}

console.log("test-excel-size-parse: 통과 (11개 검사)");
