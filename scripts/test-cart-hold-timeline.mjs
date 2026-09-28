// [2026-09-28] 장바구니 남은시간 계산 — cartHoldTimeline 경계값
import assert from "node:assert/strict";
import { cartHoldTimeline } from "../lib/cartHoldDetail.ts";

let pass = 0;
const eq = (a, e, m) => { assert.equal(a, e, m); pass++; };
const ok = (c, m) => { assert.ok(c, m); pass++; };

const NOW = 1_700_000_000_000;
const min = (n) => n * 60000;
// created 는 표시엔 안 중요(progress만) — 넉넉히 3시간 전으로 두고 남은시간만 조절
const T = (remainMinutes) => cartHoldTimeline({ createdAtMs: NOW - min(180), expiresAtMs: NOW + min(remainMinutes), nowMs: NOW });

// ── level 경계 (danger ≤30 · warn ≤120 · ok) ──
eq(T(29).level, "danger", "29분 → danger");
eq(T(30).level, "danger", "30분(경계) → danger");
eq(T(31).level, "warn", "31분 → warn");
eq(T(120).level, "warn", "120분(경계) → warn");
eq(T(121).level, "ok", "121분 → ok");

// ── remainText 포맷 ──
eq(T(29).remainText, "29분 남음", "29분 텍스트");
eq(T(90).remainText, "1시간 30분 남음", "90분 → 1시간 30분");
eq(T(120).remainText, "2시간 0분 남음", "120분 → 2시간 0분");

// ── 만료(expires ≤ now) ──
{ const t = cartHoldTimeline({ createdAtMs: NOW - min(60), expiresAtMs: NOW - min(1), nowMs: NOW });
  eq(t.remainText, "만료", "만료 텍스트");
  eq(t.remainMin, 0, "만료 남은분 0");
  eq(t.level, "danger", "만료 level danger");
  eq(t.progress, 1, "만료 progress 1"); }

// ── progress 0~1 · 절반 경과 ──
{ const t = cartHoldTimeline({ createdAtMs: NOW - min(60), expiresAtMs: NOW + min(60), nowMs: NOW });
  ok(Math.abs(t.progress - 0.5) < 0.01, "절반 경과 progress≈0.5"); }

// ── created > expires 방어(이상값) → progress·remain 안전 ──
{ const t = cartHoldTimeline({ createdAtMs: NOW + min(100), expiresAtMs: NOW - min(10), nowMs: NOW });
  ok(t.progress >= 0 && t.progress <= 1, "이상값 progress 0~1 범위");
  eq(t.remainText, "만료", "이상값도 만료 처리"); }

console.log(`✅ cart-hold-timeline ${pass}건 통과`);
