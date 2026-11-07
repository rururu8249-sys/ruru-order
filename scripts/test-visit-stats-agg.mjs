// scripts/test-visit-stats-agg.mjs — 접속 기록 집계(1인 1회·처음·주문) 순수 함수 검사
import assert from "node:assert/strict";
import { aggregateVisits, seoulDate } from "../lib/visitStatsAgg.ts";

const d = "2026-11-07";
const t = (h) => `${d}T${String(h).padStart(2, "0")}:00:00+09:00`;
const iso = (h) => new Date(t(h)).toISOString();

const rows = [
  // 또요: 폰 2대(브라우저 2개)로 3번 들어옴 → 사람 1명 · 3회
  { visitor_key: "k-a1", nickname: "또요", broadcast_id: "bc1", shop_mode: "live", started_at: iso(20), last_seen_at: iso(20) },
  { visitor_key: "k-a1", nickname: null, broadcast_id: "bc1", shop_mode: "live", started_at: iso(19), last_seen_at: iso(19) }, // 로그인 전 기록 — 같은 브라우저라 또요로 붙음
  { visitor_key: "k-a2", nickname: "또요", broadcast_id: null, shop_mode: "shop", started_at: iso(10), last_seen_at: iso(10) },
  // 심지예: 1회, 방송 중, 주문함
  { visitor_key: "k-b", nickname: "심지예", broadcast_id: "bc1", shop_mode: "live", started_at: iso(21), last_seen_at: iso(21) },
  // 비회원 브라우저 2개 → 2명
  { visitor_key: "k-g1", nickname: null, broadcast_id: null, shop_mode: "shop", started_at: iso(9), last_seen_at: iso(9) },
  { visitor_key: "k-g2", nickname: null, broadcast_id: null, shop_mode: "shop", started_at: iso(9), last_seen_at: iso(9) },
  // 어제 기록
  { visitor_key: "k-c", nickname: "몽몽이", broadcast_id: null, shop_mode: "shop", started_at: new Date("2026-11-06T12:00:00+09:00").toISOString(), last_seen_at: null },
];

const out = aggregateVisits({
  rows,
  firstDayByNick: new Map([["심지예", d], ["또요", "2026-09-01"]]),
  orders: [
    { nickname: "심지예", date: d, broadcastId: "bc1" },
    { nickname: "엉뚱이", date: d, broadcastId: "" }, // 접속 기록 없는 주문자 → 안 셈
  ],
  broadcastStart: new Map([["bc1", iso(19)]]),
});

assert.equal(seoulDate(iso(0)), d);
assert.equal(out.totalVisitors, 5, "30일 전체 사람 수 = 또요·심지예·비회원2·몽몽이");
assert.equal(out.totalVisits, rows.length);

const today = out.daily.find((x) => x.date === d);
assert.ok(today);
assert.equal(today.visitors, 4, "오늘 사람 = 또요·심지예·비회원 2");
assert.equal(today.visits, 6, "오늘 중복 포함 6회");
assert.equal(today.newcomers, 1, "처음 온 사람 = 심지예");
assert.equal(today.liveVisitors, 2, "방송 중 = 또요·심지예");
assert.equal(today.buyers, 1, "주문 = 심지예");

const ttoyo = today.people.find((p) => p.name === "또요");
assert.equal(ttoyo.visits, 3);
assert.equal(ttoyo.member, true);
assert.equal(ttoyo.isNew, false);
assert.equal(ttoyo.ordered, false);
assert.equal(today.people.filter((p) => !p.member).length, 2);
assert.equal(today.people[0].name, "심지예", "최근 접속 순");

const bc = out.broadcasts.find((b) => b.broadcastId === "bc1");
assert.equal(bc.visitors, 2);
assert.equal(bc.visits, 3);
assert.equal(bc.buyers, 1);
assert.equal(bc.newcomers, 1, "방송 시작일 = 가입일인 심지예");
assert.equal(bc.startedAt, iso(19));

console.log("test-visit-stats-agg OK");
