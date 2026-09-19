// 옵션 정렬 규칙 검수 — 숫자 → 글자 사이즈 → FREE → 기타, 색상 가나다
import { compareSizes, compareOrderOptions, cleanOptionValue } from "../lib/orderOptionSort.ts";
import assert from "node:assert/strict";

const sorted = (arr) => [...arr].sort(compareSizes);
assert.deepEqual(sorted(["66", "55", "77", "55"]), ["55", "55", "66", "77"]);
assert.deepEqual(sorted(["245", "230", "250"]), ["230", "245", "250"]);
assert.deepEqual(sorted(["XL", "S", "M", "2XL", "L", "XS", "XXL"]), ["XS", "S", "M", "L", "XL", "2XL", "XXL"]);
assert.deepEqual(sorted(["라지", "스몰", "미듐"]), ["스몰", "미듐", "라지"]);
assert.deepEqual(sorted(["FREE", "66", "M", "기타"]), ["66", "M", "FREE", "기타"]);
assert.deepEqual(sorted(["100", "95", "105"]), ["95", "100", "105"]);
assert.equal(cleanOptionValue("없음"), "");
assert.equal(cleanOptionValue(" 베이지 "), "베이지");

const rows = [
  { color: "베이지", size: "66" }, { color: "카멜", size: "55" }, { color: "베이지", size: "55" }, { color: "베이지", size: "55" },
];
const r = [...rows].sort(compareOrderOptions).map((x) => `${x.color}/${x.size}`);
assert.deepEqual(r, ["베이지/55", "베이지/55", "베이지/66", "카멜/55"]);
// 없음은 빈 값 → 맨 앞
assert.deepEqual([{ color: "없음", size: "L" }, { color: "없음", size: "없음" }].sort(compareOrderOptions).map((x) => x.size), ["없음", "L"]);
console.log("✅ order-option-sort 통과");
