// [2026-11-01] 안내 팝업 설정 규칙 — 켜기/끄기·끝나는 날·24시간·내용 바꾸면 다시·버튼 주소
import assert from "node:assert/strict";
import {
  DEFAULT_PROMO_POPUP, PROMO_POPUP_KEY, PROMO_POPUP_LEGACY_KEY, parsePromoPopup, serializePromoPopup,
  isPromoPopupLive, isPromoHidden, promoHideRecord, promoBodyLines, isValidPromoUrl, kstDateString,
} from "../lib/promoPopup.ts";

// 새 키 없음 → 기본값(켜짐·유튜브 그림·날짜 문구), 예전 키 false 면 꺼짐
assert.equal(parsePromoPopup([]).enabled, true);
assert.equal(parsePromoPopup([]).icon, "youtube");
assert.ok(parsePromoPopup([]).body.includes("11월 1일(일)"));
assert.equal(parsePromoPopup([{ key: PROMO_POPUP_LEGACY_KEY, value: "false" }]).enabled, false);
// 깨진 값 → 안 뜸
assert.equal(parsePromoPopup([{ key: PROMO_POPUP_KEY, value: "{깨짐" }]).enabled, false);

// 저장 → 다시 읽기: 잘못된 버튼 주소는 빠짐, 최대 3개
const t0 = Date.UTC(2026, 10, 1, 3, 0);
const draft = { ...DEFAULT_PROMO_POPUP, buttons: [
  { label: "A", url: "https://a.com" }, { label: "", url: "https://b.com" }, { label: "C", url: "javascript:alert(1)" },
  { label: "D", url: "/notice" }, { label: "E", url: "https://e.com" }, { label: "F", url: "https://f.com" },
] };
const saved = parsePromoPopup([{ key: PROMO_POPUP_KEY, value: serializePromoPopup(draft, DEFAULT_PROMO_POPUP, t0) }]);
assert.deepEqual(saved.buttons.map((b) => b.label), ["A", "D", "E"]);
assert.equal(saved.version, String(t0)); // 내용 바뀜 → 새 version
// 켜기/끄기·날짜만 바꾸면 version 그대로(24시간 누른 손님에게 다시 안 뜸)
const same = parsePromoPopup([{ key: PROMO_POPUP_KEY, value: serializePromoPopup({ ...saved, endDate: "2026-11-30" }, saved, t0 + 5000) }]);
assert.equal(same.version, saved.version);
assert.equal(same.endDate, "2026-11-30");

// 끝나는 날: 그날까지 뜨고 다음 날 안 뜸(한국 날짜)
const cfg = { ...same };
assert.equal(isPromoPopupLive(cfg, Date.UTC(2026, 10, 30, 14, 59)), true);  // 11/30 23:59 KST
assert.equal(isPromoPopupLive(cfg, Date.UTC(2026, 10, 30, 15, 0)), false);  // 12/1 00:00 KST
assert.equal(isPromoPopupLive({ ...cfg, enabled: false }, t0), false);
assert.equal(kstDateString(Date.UTC(2026, 9, 31, 15, 0)), "2026-11-01");

// 24시간: 지나면 다시, 내용 바뀌면 바로 다시
const rec = promoHideRecord("v1", t0);
assert.equal(isPromoHidden(rec, "v1", t0 + 23 * 3600e3), true);
assert.equal(isPromoHidden(rec, "v1", t0 + 24 * 3600e3 + 1), false);
assert.equal(isPromoHidden(rec, "v2", t0 + 1000), false);
assert.equal(isPromoHidden(null, "v1", t0), false);

// 굵게·줄바꿈
assert.deepEqual(promoBodyLines("a **b** c\n\nd"), [
  [{ text: "a ", bold: false }, { text: "b", bold: true }, { text: " c", bold: false }], [], [{ text: "d", bold: false }],
]);
assert.equal(isValidPromoUrl("//evil.com"), false);
console.log("promo popup: ok");
