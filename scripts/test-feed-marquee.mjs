// [2026-09-27] 방송 위젯 마퀴 — marqueePlan(static/loop/once) + alertOneLine
import assert from "node:assert/strict";
import {
  marqueePlan, alertOneLine,
  FEED_MARQUEE_SPEED, FEED_MARQUEE_GAP, FEED_MARQUEE_HOLD_START_MS, FEED_MARQUEE_HOLD_END_MS,
} from "../lib/feedText.ts";

let pass = 0;
const eq = (a, e, m) => { assert.equal(a, e, m); pass++; };
const near = (a, e, m) => { assert.ok(Math.abs(a - e) < 0.5, `${m}: ${a} vs ${e}`); pass++; };

// ── static: 글자가 가용폭 이하면 흐르지 않음 (loop·once 각 1) ──
eq(marqueePlan({ textW: 400, availW: 800, kind: "loop" }).mode, "static", "loop static(짧음)");
eq(marqueePlan({ textW: 800, availW: 800, kind: "once" }).mode, "static", "once static(딱 경계)");

// ── 경계: textW == availW → static ──
eq(marqueePlan({ textW: 814, availW: 814, kind: "loop" }).mode, "static", "경계 textW==availW → static");

// ── loop: 계속 흐름 durationMs = (textW+GAP)/SPEED*1000 (2케이스) ──
{ const p = marqueePlan({ textW: 1000, availW: 800, kind: "loop" });
  eq(p.mode, "loop", "loop mode");
  near(p.durationMs, ((1000 + FEED_MARQUEE_GAP) / FEED_MARQUEE_SPEED) * 1000, "loop dur 1000"); }
{ const p = marqueePlan({ textW: 1600, availW: 778, kind: "loop" });
  near(p.durationMs, ((1600 + FEED_MARQUEE_GAP) / FEED_MARQUEE_SPEED) * 1000, "loop dur 1600"); }

// ── once: 1회 흐르고 끝부분이 중간(availW/2)에서 멈춤 (2케이스) ──
{ const availW = 814, textW = 1400;
  const p = marqueePlan({ textW, availW, kind: "once" });
  eq(p.mode, "once", "once mode");
  near(p.scrollPx, textW - availW / 2, "once scrollPx = textW - availW/2");
  near(p.scrollMs, (textW - availW / 2) / FEED_MARQUEE_SPEED * 1000, "once scrollMs");
  near(p.totalMs, FEED_MARQUEE_HOLD_START_MS + p.scrollMs + FEED_MARQUEE_HOLD_END_MS, "once totalMs = holdStart+scroll+holdEnd"); }
{ const availW = 900, textW = 1200;
  const p = marqueePlan({ textW, availW, kind: "once" });
  near(p.scrollPx, textW - availW / 2, "once2 scrollPx"); }

// ── alertOneLine: 닉네임님 + 아이콘 인사말 + 상품 " | " ──
eq(
  alertOneLine({ nick: "공기뼈", icon: "🛒", verb: "주문 감사합니다", products: [
    { name: "폴로 니트", opt: "레드/S", qty: 1 }, { name: "꽃티", opt: "L", qty: 2 },
  ] }),
  "공기뼈님 🛒 주문 감사합니다  폴로 니트 레드/S 1개 | 꽃티 L 2개",
  "alertOneLine 상품 있음",
);
eq(alertOneLine({ nick: "루루짱929", icon: "💳", verb: "카드결제 감사합니다", products: [] }),
  "루루짱929님 💳 카드결제 감사합니다", "alertOneLine 상품 없음");

console.log(`✅ feed-marquee ${pass}건 통과`);
