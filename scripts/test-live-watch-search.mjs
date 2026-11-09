// [2026-11-10] 방송 화면 상품 목록 검색 = 주문서 검색과 같은 함수 — 프509·pd509·pd-509·프라다509 모두 PD-509 세부상품 줄
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const { liveWatchList } = createUiLoader({})("lib/liveWatch.ts");
const items = [
  { id: "677", name: "프라다", imageUrl: "", priceText: "", soldOut: false, pinned: false, brand: true, count: 3, searchTexts: ["프라다"],
    details: [{ name: "PD-509 블랙", imageUrl: "a", priceText: "420,000원", soldOut: false }, { name: "PD-222", imageUrl: "b", priceText: "1원", soldOut: false }, { name: "PD-5090", imageUrl: "", priceText: "", soldOut: false }] },
  { id: "1", name: "니트 가디건", imageUrl: "", priceText: "", soldOut: false, pinned: false, searchTexts: ["니트 가디건", "울가디건"] },
];
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("✗", m); } else console.log("✓", m); };
for (const q of ["509", "pd509", "pd-509", "PD 509", "프509", "프라509", "프라다509", "prada509", "라다509", "rada509"]) {
  const r = liveWatchList(items, q);
  ok(r.some((x) => x.detailName === "PD-509 블랙" && x.id === "677"), `${q} → PD-509 블랙 줄`);
}
ok(liveWatchList(items, "프라다").some((x) => x.id === "677" && !x.detailName), "프라다 → 묶음 줄");
ok(liveWatchList(items, "울가디건").length === 1, "관리자 검색어로도 찾음");
ok(liveWatchList(items, "").length === 2, "빈 검색 = 전부");
ok(liveWatchList(items, "없는상품").length === 0, "없으면 0");
if (fail) process.exit(1);
