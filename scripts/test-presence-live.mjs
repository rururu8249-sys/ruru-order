// scripts/test-presence-live.mjs — 「지금 접속」 합치기(카카오 계정 우선·닉네임 폴백·장바구니·오늘 주문·활동 문구) + 드로어 칩 필터 순수 검사
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const load = createUiLoader();
const { buildLiveVisitors, summarizeLiveVisitors, filterLiveVisitors, sortLiveVisitors } = load("lib/presenceLive.ts");
const { presenceActivityText, presenceStatusText, normalizePresenceActivity, PRESENCE_ACTIVITY_MAX_AGE_MS } = load("lib/presenceActivity.ts");

const now = Date.parse("2026-11-09T05:00:00Z");
const iso = (msAgo) => new Date(now - msAgo).toISOString();

const rows = [
  // 임현아: 카카오 계정으로 붙음 — 닉네임은 바뀌었어도(옛 주문 닉 「임현아」·지금 신호 「현아」) 장바구니·주문이 따라옴
  { id: "p1", visitor_key: "k1", nickname: "현아", kakao_id: "K1", page_type: "order_form", last_seen_at: iso(20_000), activity: "option", activity_label: "PD-202 가방", activity_at: iso(30_000) },
  // 핑크링: 옛 신호(kakao_id 없음) → 닉네임 글자로 폴백
  { id: "p2", visitor_key: "k2", nickname: "핑크링", page_type: "order_form", last_seen_at: iso(31_000), activity: "sheet", activity_at: iso(5_000) },
  // 로그인 전 비회원
  { id: "p3", visitor_key: "k3", nickname: null, page_type: "page", last_seen_at: iso(40_000) },
  // 관리자
  { id: "p4", visitor_key: "k4", nickname: "루루동이", kakao_id: "KA", page_type: "admin", last_seen_at: iso(1_000) },
  // 오래된 활동(11분 전)은 안 씀 → 「상품 보는 중」
  { id: "p5", visitor_key: "k5", nickname: "렝", kakao_id: "K5", page_type: "order_form", last_seen_at: iso(50_000), activity: "cart", activity_label: "MC-1", activity_at: iso(PRESENCE_ACTIVITY_MAX_AGE_MS + 1000) },
];
const customers = [
  { kakao_id: "K1", youtube_nickname: "현아", customer_name: "임현아" },
  { kakao_id: "K2", youtube_nickname: "핑크링", customer_name: "김핑크" },
];
const carts = [
  { kakao_id: "K1", nickname: "현아", qty: 2, unit_price: 219000, product_name: "프라다", detail_name: "PD-202", expires_at: iso(-3_600_000) },
  { kakao_id: "K1", nickname: "현아", qty: 1, unit_price: null, product_name: "몽클레어", detail_name: "MC-1", expires_at: iso(-3_600_000) },
  { kakao_id: "", nickname: "핑크링", qty: 1, unit_price: 50000, product_name: "니트", detail_name: "", expires_at: iso(-3_600_000) },
  { kakao_id: "K1", nickname: "현아", qty: 9, unit_price: 1, product_name: "만료", detail_name: "", expires_at: iso(10) }, // 만료 → 제외
];
const orders = [
  { id: 1, order_group_id: "G1", kakao_id: "K1", youtube_nickname: "임현아", admin_order_status_v2: "입금확인", final_amount: 190000, created_at: iso(600_000), product_name: "MC-311 블랙" },
  { id: 2, order_group_id: "G1", kakao_id: "K1", youtube_nickname: "임현아", admin_order_status_v2: "입금확인", final_amount: 0, created_at: iso(600_000), product_name: "MC-312" },
  { id: 3, order_group_id: "G2", kakao_id: "K1", youtube_nickname: "임현아", admin_order_status_v2: "미설정", final_amount: 50000, created_at: iso(100_000), product_name: "BB-1" },
  { id: 4, order_group_id: "G3", kakao_id: "K1", youtube_nickname: "임현아", admin_order_status_v2: "주문취소", final_amount: 99999, created_at: iso(100_000), product_name: "취소된것" },
  { id: 5, order_group_id: "G4", kakao_id: null, youtube_nickname: "핑크링", admin_order_status_v2: "카드결제완료", final_amount: 30000, created_at: iso(100_000), product_name: "니트" },
  { id: 6, order_group_id: "G5", kakao_id: "K1", youtube_nickname: "임현아", admin_order_status_v2: "입금확인", final_amount: 1, is_test_order: true, created_at: iso(100_000), product_name: "테스트" },
];

const list = buildLiveVisitors({ rows, customers, carts, orders, now });
const by = Object.fromEntries(list.map((v) => [v.id, v]));

// 임현아 — 카카오 계정 매칭
assert.equal(by.p1.name, "임현아");
assert.equal(by.p1.nickname, "현아");
assert.equal(by.p1.status, "옵션 고르는 중 · PD-202 가방");
assert.deepEqual([by.p1.cart.count, by.p1.cart.qty, by.p1.cart.amount, by.p1.cart.unknownPrice], [2, 3, 438000, true]);
assert.deepEqual([by.p1.orders.count, by.p1.orders.paid, by.p1.orders.unpaid, by.p1.orders.amount], [2, 1, 1, 240000]); // 취소·테스트 제외, 그룹 1건으로
assert.equal(by.p1.orders.items.find((o) => o.status === "canceled")?.name, "취소된것");
assert.equal(by.p1.orders.items[0].name, "MC-311 블랙 외 1개");

// 핑크링 — 닉네임 폴백
assert.equal(by.p2.name, "김핑크");
assert.equal(by.p2.isMember, true);
assert.equal(by.p2.status, "주문서 확인 중");
assert.deepEqual([by.p2.cart.count, by.p2.cart.amount], [1, 50000]);
assert.deepEqual([by.p2.orders.count, by.p2.orders.paid], [1, 1]);

// 비회원
assert.equal(by.p3.isMember, false);
assert.equal(by.p3.status, "사이트 접속");
assert.equal(by.p3.cart.count, 0);

// 관리자
assert.equal(by.p4.status, "관리자");

// 오래된 활동 무시
assert.equal(by.p5.activity, null);
assert.equal(by.p5.status, "상품 보는 중");

// 요약(관리자 제외)
const s = summarizeLiveVisitors(list, 9);
assert.deepEqual(s, { total: 9, orderForm: 3, withCart: 2, ordered: 2, guests: 1 });

// 활동 문구
assert.equal(presenceActivityText("cart", "MC-1"), "담았어요 · MC-1");
assert.equal(presenceActivityText("submitted", ""), "주문 완료");
assert.equal(presenceStatusText({ pageType: "order_lookup", pageLabel: "주문조회", activity: null }), "주문조회");
assert.equal(normalizePresenceActivity({ kind: "hack", label: "x" }), null);
assert.equal(normalizePresenceActivity({ kind: "sheet", label: "y".repeat(100), at: 5 }).label.length, 80);

// 드로어 칩·정렬
const sorted = sortLiveVisitors(list);
assert.equal(sorted[sorted.length - 1].id, "p4", "관리자는 맨 아래");
assert.deepEqual(filterLiveVisitors(list, "cart", "").map((v) => v.id), ["p1", "p2"]);
assert.deepEqual(filterLiveVisitors(list, "ordered", "").map((v) => v.id), ["p1", "p2"]);
assert.deepEqual(filterLiveVisitors(list, "guest", "").map((v) => v.id), ["p3"]);
assert.deepEqual(filterLiveVisitors(list, "all", "임현").map((v) => v.id), ["p1"]); // 이름으로도 검색
console.log("PASS presence-live");
