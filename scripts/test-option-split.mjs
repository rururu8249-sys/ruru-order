// 옵션 구분 규칙 — 쉼표(와 줄바꿈)만. / | · . 는 «옵션 이름의 일부».
import assert from "node:assert/strict";
import { splitOptionText, toOptionList } from "../lib/optionSplit.ts";

// ① 사장님이 신고한 그 케이스 — 한 묶음 사이즈
assert.deepEqual(splitOptionText("XS/S, M/L, XL/XXL"), ["XS/S", "M/L", "XL/XXL"]);
// ② 평범한 사이즈
assert.deepEqual(splitOptionText("220, 230, 240"), ["220", "230", "240"]);
// ③ 신발 US 표기 — 마침표로 안 쪼개짐(2026-08-11 수정 유지)
assert.deepEqual(splitOptionText("225(US5.5), 235(US6.5)"), ["225(US5.5)", "235(US6.5)"]);
// ④ 가운뎃점·파이프도 이름의 일부
assert.deepEqual(splitOptionText("블랙·화이트, 네이비|그레이"), ["블랙·화이트", "네이비|그레이"]);
// ⑤ 줄바꿈은 구분자(여러 줄 붙여넣기)
assert.deepEqual(splitOptionText("XS/S\nM/L"), ["XS/S", "M/L"]);
// ⑥ 공백·빈 항목 정리
assert.deepEqual(splitOptionText("  XS/S ,, M/L ,  "), ["XS/S", "M/L"]);
// ⑦ 배열은 «원소 하나 = 옵션 하나» — 다시 쪼개지 않는다 (이번 버그의 직접 원인)
assert.deepEqual(toOptionList(["XS/S", "M/L"]), ["XS/S", "M/L"]);
// ⑧ 배열 안 문자열도 그대로
assert.deepEqual(toOptionList(["블랙·화이트"]), ["블랙·화이트"]);
// ⑨ 문자열이면 쉼표로 나눔
assert.deepEqual(toOptionList("XS/S, M/L"), ["XS/S", "M/L"]);
// ⑩ 빈 값
assert.deepEqual(toOptionList(null), []);
assert.deepEqual(toOptionList(""), []);
console.log("✅ test-option-split 10/10");
