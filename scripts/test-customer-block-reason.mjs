// 차단사유 «유형 + 품목 + 메모» 형식 — 저장/읽기 테스트
import assert from "node:assert/strict";
import {
  buildBlockReason,
  parseBlockReason,
  blockReasonSummary,
  blockReasonPicksItems,
} from "../lib/customerBlockReason.ts";

// ① 사장님이 실제로 하신 차단(카라멜 님) — 이제 고르기만 하면 이 모양으로 저장된다
const saved = buildBlockReason({
  type: "deal_break",
  items: ["노다001신더 (235) ×1 79,000원", "젤NYC 오이스터그레이 (화이트/265) ×1 68,000원"],
  memo: "연락 두절",
});
assert.equal(
  saved,
  "[거래파기(거파)]\n· 노다001신더 (235) ×1 79,000원\n· 젤NYC 오이스터그레이 (화이트/265) ×1 68,000원\n메모: 연락 두절",
);

const back = parseBlockReason(saved);
assert.equal(back.type, "deal_break");
assert.equal(back.label, "거래파기(거파)");
assert.deepEqual(back.items, ["노다001신더 (235) ×1 79,000원", "젤NYC 오이스터그레이 (화이트/265) ×1 68,000원"]);
assert.equal(back.memo, "연락 두절");
assert.equal(blockReasonSummary(saved), "노다001신더 (235) ×1 79,000원 외 1개");

// ② 옛 자유 텍스트는 그대로 읽혀야 한다(하위호환) — 지우거나 깨뜨리면 안 된다
const legacy = "노다001신더 (235) ×1 79,000원 젤NYC 오이스터그레이 (화이트/265) ×1 거파";
const legacyParts = parseBlockReason(legacy);
assert.equal(legacyParts.type, null);
assert.equal(legacyParts.label, "");
assert.deepEqual(legacyParts.items, []);
assert.equal(legacyParts.memo, legacy);
assert.equal(blockReasonSummary(legacy), legacy);

// ③ 「나현경 / 알로밴딩바지 초크자국, 원단 주름진 상태로 왔다고 진상 부림」 같은 옛 기록도 그대로
const legacy2 = "나현경 / 알로밴딩바지 초크자국, 원단 주름진 상태로 왔다고 진상 부림";
assert.equal(parseBlockReason(legacy2).memo, legacy2);

// ④ 「·」는 상품 이름의 일부다 — 구분자로 쓰지 않으므로 이름이 깨지면 안 된다
const dotName = buildBlockReason({ type: "unpaid", items: ["알로 뮬 2컬러 · 블랙/230 ×1"], memo: "" });
assert.deepEqual(parseBlockReason(dotName).items, ["알로 뮬 2컬러 · 블랙/230 ×1"]);

// ⑤ 메모 안의 대괄호가 «유형»으로 둔갑하면 안 된다
const bracketMemo = parseBlockReason("[거래파기(거파)]\n메모: [주의] 번호 바꿔서 또 옴");
assert.equal(bracketMemo.type, "deal_break");
assert.equal(bracketMemo.memo, "[주의] 번호 바꿔서 또 옴");

// ⑥ 첫 줄이 대괄호로만 된 «옛» 메모면 모르는 라벨 → 직접 입력으로 읽고 글자는 살린다
const unknown = parseBlockReason("[내가 만든 분류]\n메모: 어쩌고");
assert.equal(unknown.type, "custom");
assert.equal(unknown.label, "내가 만든 분류");

// ⑦ 품목 없이 유형만 — 진상/허위정보는 품목 고르기가 없다
assert.equal(buildBlockReason({ type: "harassment", items: [], memo: "폭언" }), "[악성문의·진상]\n메모: 폭언");
assert.equal(blockReasonPicksItems("harassment"), false);
assert.equal(blockReasonPicksItems("deal_break"), true);
assert.equal(blockReasonPicksItems(null), false);

// ⑧ 줄바꿈이 섞여 들어와도 형식이 안 깨진다
const dirty = buildBlockReason({ type: "deal_break", items: ["가\n나"], memo: "다\n라" });
assert.equal(dirty, "[거래파기(거파)]\n· 가 나\n메모: 다 라");

// ⑨ 빈 값
assert.equal(buildBlockReason({ type: null, items: [], memo: "" }), "");
assert.deepEqual(parseBlockReason(""), { type: null, label: "", items: [], memo: "" });
assert.equal(blockReasonSummary(""), "");

console.log("✅ customer block reason OK");
