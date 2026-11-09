// scripts/test-live-alert-effect.mjs — 방송 알림 효과(받은 사람 → 사이트 접속 → 주문 → 결제) 순수 계산 검사
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const { computeAlertEffect, normNick } = createUiLoader()("lib/liveAlertEffect.ts");

const alerted = [
  { phone: "01011112222", kakao: "k1", nicks: ["루루 언니"] },   // 접속O 주문O(결제)
  { phone: "01033334444", kakao: "", nicks: ["보라"] },          // 접속O 주문X
  { phone: "01055556666", kakao: "k3", nicks: ["새닉"] },        // 접속X, 번호 바꿔 다른 번호로 주문(카카오로 붙음·미결제)
  { phone: "01077778888", kakao: "", nicks: [] },                // 아무것도 없음
];
const groups = [
  { phone: "01011112222", who: "k:k1", amount: 50000, paid: true, canceled: false, isTest: false },
  { phone: "01011112222", who: "k:k1", amount: 20000, paid: true, canceled: false, isTest: false }, // 같은 사람 두 번
  { phone: "01099990000", who: "k:k3", amount: 30000, paid: false, canceled: false, isTest: false },
  { phone: "01012121212", who: "", amount: 40000, paid: true, canceled: false, isTest: false },      // 알림 안 받은 사람
  { phone: "01033334444", who: "", amount: 99999, paid: true, canceled: true, isTest: false },     // 취소 — 안 셈
  { phone: "01077778888", who: "", amount: 11111, paid: true, canceled: false, isTest: true },     // 테스트 — 안 셈
];
const r = computeAlertEffect({ alerted, sentCount: 4, groups, visitNicks: new Set(["루루언니", "보라", "남"].map(normNick)) });
assert.equal(r.alerted, 4);
assert.equal(r.cost, 52);
assert.equal(r.siteVisitors, 3);
assert.equal(r.alertedVisited, 2, "닉네임 띄어쓰기 무시하고 맞춤");
assert.equal(r.buyers, 3);
assert.equal(r.alertedBuyers, 2, "번호 바뀌어도 카카오 계정으로 같은 사람");
assert.equal(r.alertedPaidBuyers, 1);
assert.equal(r.paidSum, 110000);
assert.equal(r.alertedPaidSum, 70000);
console.log("test-live-alert-effect PASS");
