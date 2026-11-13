// scripts/test-presence-live.mjs — 「지금 접속」 합치기(카카오 계정 우선·닉네임 폴백·장바구니·오늘 주문·활동 문구) + 드로어 칩 필터 순수 검사
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const load = createUiLoader();
const { buildLiveVisitors, summarizeLiveVisitors, filterLiveVisitors, sortLiveVisitors, excludePresenceRows } = load("lib/presenceLive.ts");
const { presenceActivityText, presenceStatusText, normalizePresenceActivity, normalizePresenceEvents, PRESENCE_ACTIVITY_MAX_AGE_MS } = load("lib/presenceActivity.ts");

const now = Date.parse("2026-11-09T05:00:00Z");
const iso = (msAgo) => new Date(now - msAgo).toISOString();

const rows = [
  // 임현아: 카카오 계정으로 붙음 — 닉네임은 바뀌었어도(옛 주문 닉 「임현아」·지금 신호 「현아」) 장바구니·주문이 따라옴
  { id: "p1", visitor_key: "k1", nickname: "현아", kakao_id: "K1", page_type: "order_form", last_seen_at: iso(20_000), activity: "option", activity_label: "PD-202 가방", activity_at: iso(30_000),
    activity_log: [ { k: "search", l: "프라다", at: now - 120_000 }, { k: "option", l: "PD-202 가방", at: now - 90_000 }, { k: "color", l: "블랙", at: now - 80_000 }, { k: "qty", l: "2", at: now - 70_000 }, { k: "hack", l: "x", at: now - 60_000 }, { k: "cart", l: "PD-202 가방", at: now - 50_000 }, { k: "cart", l: "PD-202 가방", at: now - 42_000 }, { k: "option", l: "PD-202 가방", at: now - 30_000 }, { k: "sheet", l: "", at: now - 4 * 3600_000 } ] },
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

// [2026-11-09 ②] 타임라인 — 최신이 앞, 모르는 종류 제외, 2초 안 같은 동작 하나로, 3시간 넘은 건 제외
assert.deepEqual(by.p1.timeline.map((e) => e.text), [
  "옵션 고르는 중 · PD-202 가방", "담았어요 · PD-202 가방", "수량 2개", "색상 블랙 고름", "옵션 고르는 중 · PD-202 가방", "검색 「프라다」",
]);
assert.equal(by.p1.timeline[1].at, now - 42_000, "10초 안 연속 중복은 나중 시각으로 합침");
assert.equal(normalizePresenceEvents([{ k: "size", l: "3", at: now - 20_000 }, { k: "size", l: "3", at: now - 9_000 }], now).length, 2, "11초 간격은 둘 다");
assert.equal(normalizePresenceEvents([{ k: "size", l: "3", at: now - 20_000 }, { k: "size", l: "3", at: now - 12_000 }], now).length, 1, "8초 간격은 하나로");
assert.deepEqual(by.p3.timeline, []);
// 동작 목록 정리(서버 쓰기와 같은 함수): 30개 상한·미래 시각 제외
const many = Array.from({ length: 40 }, (_, i) => ({ k: "search", l: `q${i}`, at: now - (40 - i) * 10_000 }));
assert.equal(normalizePresenceEvents(many, now).length, 30);
assert.equal(normalizePresenceEvents([{ k: "cart", l: "a", at: now + 120_000 }], now).length, 0);
assert.equal(normalizePresenceEvents("nope", now).length, 0);
assert.equal(presenceActivityText("cart_remove", "BB-1"), "장바구니에서 뺌 · BB-1");
assert.equal(presenceActivityText("sheet_close", ""), "주문서 닫음(제출 안 함)");

// [2026-11-09 ③] 관리자·제외 계정 빼기 — 관리자 화면 줄(p4), 제외 카카오(K5), 제외 닉네임(핑크링)
const kept = excludePresenceRows(rows, { kakaoIds: ["K5"], names: ["핑크링"] }).map((r) => r.id);
assert.deepEqual(kept, ["p1", "p3"]);
assert.deepEqual(excludePresenceRows(rows, {}).map((r) => r.id), ["p1", "p2", "p3", "p5"], "목록 없어도 관리자 줄은 뺌");
const actors=buildLiveVisitors({now,rows:[{id:'a',nickname:'First',kakao_id:'shared',automation_actor_id:'actor-a'},{id:'b',nickname:'Second',kakao_id:'shared',automation_actor_id:'actor-b'}],customers:[{kakao_id:'shared',customer_name:'Owner'}],carts:[{automation_actor_id:'actor-a',nickname:'First',qty:2,unit_price:100}],orders:[{id:90,order_group_id:'ag',kakao_id:'shared',youtube_nickname:'Second',automation_actor_id:'actor-b',is_test_order:true,total_price:100}]});
assert.equal(actors[0].cart.qty,2);assert.equal(actors[1].cart.qty,0);
assert.equal(actors[0].orders.count,0);assert.equal(actors[1].orders.count,1);
assert.equal(actors[0].name,'','shared technical owner must not replace actor identity');
console.log("PASS presence-live");

const verifiedAuto={id:'auto',visitor_key:'live-auto:verified',automation_actor_id:'actor-1',kakao_id:'990000000077',nickname:'윤정희',page_type:'order_form'};
assert.equal(excludePresenceRows([verifiedAuto],{kakaoIds:['990000000077']}).length,1,'verified generated visitor must remain visible to admin');
assert.equal(excludePresenceRows([{...verifiedAuto,automation_actor_id:undefined}],{kakaoIds:['990000000077']}).length,0,'a visitor key alone cannot override exclusion');
assert.equal(excludePresenceRows([{...verifiedAuto,page_type:'admin'}],{}).length,0,'admin page sessions remain excluded');
