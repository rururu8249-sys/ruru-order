// [2026-09-26] 차단사유 파서 — 실제 저장 문자열 변형(개행/공백/전각/불릿) 파싱 + 회귀 방지
import { parseBlockReason, buildBlockReason, blockReasonSummary } from "../lib/customerBlockReason.ts";

let pass = 0;
function eq(a, e, m) { if (a !== e) throw new Error(`${m}: expected=${JSON.stringify(e)} actual=${JSON.stringify(a)}`); pass++; }
function ok(c, m) { if (!c) throw new Error(m); pass++; }

const ITEM = "폴로 울캐시 가디건 (핫핑크/M) ×1 68,480원";

// ── 사장님 실제 케이스 + 변형: 모두 label·item 로 갈라져야 한다(전부 memo 로 뭉치면 버그) ──
const variants = {
  "정상(개행+·공백)": `[거래파기(거파)]\n· ${ITEM}`,
  "한줄(공백 구분)": `[거래파기(거파)] · ${ITEM}`,
  "CRLF": `[거래파기(거파)]\r\n· ${ITEM}`,
  "·뒤 공백 없음": `[거래파기(거파)]\n·${ITEM}`,
  "전각 가운뎃점 ・": `[거래파기(거파)]\n・ ${ITEM}`,
  "라벨 뒤 전각공백": `[거래파기(거파)]　· ${ITEM}`,
  "리터럴 backslash-n": `[거래파기(거파)]\\n· ${ITEM}`,
  "불릿 • (U+2022)": `[거래파기(거파)]\n• ${ITEM}`,
  "라벨 트레일링 공백": `[거래파기(거파)] \n· ${ITEM}`,
};
for (const [name, raw] of Object.entries(variants)) {
  const p = parseBlockReason(raw);
  eq(p.label, "거래파기(거파)", `${name}: label`);
  eq(p.type, "deal_break", `${name}: type`);
  eq(p.items.length, 1, `${name}: 품목 1개`);
  eq(p.items[0], ITEM, `${name}: 품목 내용`);
  eq(p.memo, "", `${name}: memo 비어야`);
}

// ── 상품명에 가운뎃점(·)이 들어간 품목은 쪼개지 않는다(가드: · 는 이름의 일부) ──
{
  const p = parseBlockReason(`[거래파기(거파)]\n· 알로 뮬 2컬러 · 블랙/230 ×1`);
  eq(p.label, "거래파기(거파)", "이름속 가운뎃점: label");
  eq(p.items.length, 1, "이름속 가운뎃점: 한 품목(쪼개지 않음)");
  eq(p.items[0], "알로 뮬 2컬러 · 블랙/230 ×1", "이름속 가운뎃점: 원문 보존");
}
// ── 품목은 «줄바꿈»으로만 나뉜다 ──
{
  const p = parseBlockReason(`[거래파기(거파)]\n· A상품 ×1\n· B상품 ×2`);
  eq(p.items.length, 2, "줄바꿈 다품목: 2개");
  eq(p.items[0], "A상품 ×1", "줄바꿈 다품목: 1");
  eq(p.items[1], "B상품 ×2", "줄바꿈 다품목: 2");
}

// ── 메모 포함 well-formed ──
{
  const p = parseBlockReason(`[거래파기(거파)]\n· ${ITEM}\n메모: 연락 두절`);
  eq(p.items.length, 1, "메모포함: 품목 1");
  eq(p.memo, "연락 두절", "메모포함: 메모");
}
// 전각 콜론 메모
{
  const p = parseBlockReason(`[반복 미입금]\n메모： 3회 미입금`);
  eq(p.type, "unpaid", "전각콜론: type");
  eq(p.memo, "3회 미입금", "전각콜론: 메모");
}

// ── build ↔ parse 왕복(정식 저장 형식은 그대로) ──
{
  const built = buildBlockReason({ type: "deal_break", items: ["가디건 ×1", "니트 ×2"], memo: "잠수" });
  const p = parseBlockReason(built);
  eq(p.label, "거래파기(거파)", "왕복 label");
  eq(p.items.length, 2, "왕복 품목수");
  eq(p.memo, "잠수", "왕복 메모");
}

// ── 회귀 방지: 옛 자유 텍스트(대괄호 없음)는 통째로 메모 ──
{
  const p = parseBlockReason("그냥 잠수함 연락 안됨");
  eq(p.label, "", "자유텍스트: label 없음");
  eq(p.items.length, 0, "자유텍스트: 품목 없음");
  eq(p.memo, "그냥 잠수함 연락 안됨", "자유텍스트: 통째 메모");
}
// 문장 중간 가운뎃점은 불릿이 아니다(줄 시작이 아니므로) → 메모 유지
{
  const p = parseBlockReason("연락 두절 · 계속 잠수");
  eq(p.items.length, 0, "중간 가운뎃점: 품목 아님");
  eq(p.memo, "연락 두절 · 계속 잠수", "중간 가운뎃점: 메모 그대로");
}
// 메모가 우연히 대괄호로 시작 + 아는 유형 아님 + 뒤가 일반 글자 → 유형 아님(메모)
{
  const p = parseBlockReason("[중요] 확인 요망");
  eq(p.label, "", "미지 대괄호: 유형 아님");
  eq(p.memo, "[중요] 확인 요망", "미지 대괄호: 메모 통째");
}
// 빈 값
{
  const p = parseBlockReason("");
  eq(p.label, "", "빈값 label");
  eq(p.items.length, 0, "빈값 items");
}

// ── 요약(목록 배지 2줄용) — 품목은 줄바꿈으로 나뉜 것만 카운트 ──
{
  eq(blockReasonSummary(`[거래파기(거파)]\n· A\n· B\n· C`), "A 외 2개", "요약: 첫품목 외 N");
}

console.log(`✅ 차단사유 파서 ${pass}건 통과`);
