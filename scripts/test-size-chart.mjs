// [2026-08-29] 사이즈 실측표 안전 검수 — 어긋난 표는 손님에게 절대 안 보이게 한다.
//   실행: node scripts/test-size-chart.mjs
import { normalizeSizeChart, resolveSizeChart, sizeColumnIndex } from "../lib/sizeChart.ts";

let failed = 0;
const assert = (c, l) => { if (!c) { failed++; console.error("❌", l); } };
const eq = (a, b, l) => assert(a === b, `${l} (기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)})`);

// 1) 정상 표
const ok = normalizeSizeChart({
  sizes: ["4", "6", "8", "10", "12"],
  rows: [
    { label: "어깨너비", values: [38, 39, 40, 41, 42] },
    { label: "가슴둘레", values: [90, 94, 98, 102, 106] },
  ],
  unit: "cm",
});
assert(ok !== null, "정상 표는 통과");
eq(ok.sizes.length, 5, "사이즈 5개");
eq(ok.rows.length, 2, "행 2개");
eq(ok.rows[0].values[0], "38", "값은 문자로 정규화");
eq(ok.unit, "cm", "단위 cm");

// 2) 🔴 핵심 안전장치 — 사이즈 개수와 값 개수가 다르면 그 행을 버린다
//    (BB-76 실제 사례: 헤더 4칸인데 숫자가 5개라 어느 값이 어느 사이즈인지 알 수 없었다)
const mismatch = normalizeSizeChart({
  sizes: ["4", "6", "8", "10"],
  rows: [{ label: "어깨너비", values: [40, 41, 42, 43, 44] }],
});
eq(mismatch, null, "칸 수가 어긋나면 표 자체를 버린다");

// 3) 일부 행만 어긋나면 그 행만 버리고 나머지는 살린다
const partial = normalizeSizeChart({
  sizes: ["4", "6"],
  rows: [
    { label: "정상", values: [1, 2] },
    { label: "어긋남", values: [1, 2, 3] },
  ],
});
eq(partial.rows.length, 1, "어긋난 행만 제거");
eq(partial.rows[0].label, "정상", "정상 행은 유지");

// 4) 빈 값이 섞이면 그 행을 버린다(빈칸을 보고 손님이 오해하면 안 된다)
eq(normalizeSizeChart({ sizes: ["4", "6"], rows: [{ label: "x", values: [1, ""] }] }), null, "빈칸 있는 행 제거");

// 5) 사이즈가 1개뿐이면 표로 의미가 없다
eq(normalizeSizeChart({ sizes: ["4"], rows: [{ label: "x", values: [1] }] }), null, "사이즈 1개는 표 아님");

// 6) 쓰레기 입력에도 절대 안 터진다
for (const junk of [null, undefined, 0, "", "abc", [], {}, { sizes: null }, { sizes: ["4","6"], rows: null }]) {
  eq(normalizeSizeChart(junk), null, `쓰레기 입력 안전: ${JSON.stringify(junk)}`);
}

// 7) product_note에서 세부상품명으로 찾기 (문자열 JSON / 객체 둘 다)
const note = {
  size_charts: {
    "BB(버버리)-65 트렌치코트": { sizes: ["4", "6"], rows: [{ label: "가슴둘레", values: [90, 94] }] },
  },
};
assert(resolveSizeChart(note, "BB(버버리)-65 트렌치코트") !== null, "객체 note에서 찾기");
assert(resolveSizeChart(JSON.stringify(note), "BB(버버리)-65 트렌치코트") !== null, "문자열 note에서 찾기");
eq(resolveSizeChart(note, "없는상품"), null, "없는 상품이면 null");
eq(resolveSizeChart(note, ""), null, "이름 없으면 null");
eq(resolveSizeChart(null, "BB-65"), null, "note 없으면 null");
eq(resolveSizeChart("{망가진 JSON", "BB-65"), null, "깨진 JSON도 안전");

// 8) 선택한 사이즈 강조 위치
const chart = resolveSizeChart(note, "BB(버버리)-65 트렌치코트");
eq(sizeColumnIndex(chart, "6"), 1, "선택 사이즈 칸 위치");
eq(sizeColumnIndex(chart, "99"), -1, "없는 사이즈는 -1");
eq(sizeColumnIndex(null, "6"), -1, "표 없으면 -1");

if (failed > 0) { console.error(`\n${failed}건 실패`); process.exit(1); }
console.log("size chart tests passed");
