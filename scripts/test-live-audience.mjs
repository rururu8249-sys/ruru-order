// [2026-11-12] 방송 화면 시청자 수 — 방송 보는 중 / 사이트 전체 세기(순수 계산)
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const load = createUiLoader({});
const A = load("lib/liveAudienceServer.ts");
const P = load("lib/presenceActivity.ts");
const now = Date.parse("2026-11-12T13:00:00Z");
const ago = (s) => new Date(now - s * 1000).toISOString();
const rows = [
  { visitor_key: "v1", nickname: "봄", kakao_id: "1", page_type: "order_form", path: "/order#live", last_seen_at: ago(10) },   // 방송 보는 중
  { visitor_key: "v2", nickname: "여름", kakao_id: "2", page_type: "order_form", path: "/order", last_seen_at: ago(20) },      // 사이트만
  { visitor_key: "v3", nickname: "가을", kakao_id: "3", page_type: "order_form", path: "/order#live", last_seen_at: ago(90) }, // 오래됨 → 빠짐
  { visitor_key: "v4", nickname: "관리", kakao_id: "", page_type: "admin", path: "/admin-live", last_seen_at: ago(5) },       // 관리자 화면 → 빠짐
  { visitor_key: "v5", nickname: "루루실장", kakao_id: "9", page_type: "order_form", path: "/order#live", last_seen_at: ago(5) }, // 제외 계정 → 숫자엔 넣고 staff 표시
  { visitor_key: "v6", nickname: "", kakao_id: "", page_type: "page", path: "/#live", last_seen_at: ago(70) },               // 75초 안 → 셈
];
const a = A.computeAudience(rows, { kakaoIds: ["9"], names: [] }, now);
assert.equal(a.total, 4);
assert.equal(a.watching, 3);
assert.deepEqual(a.watchers.map((w) => w.visitorKey), ["v5", "v1", "v6"]);
assert.deepEqual(a.watchers.map((w) => w.staff), [true, false, false]);
assert.deepEqual(a.others.map((w) => w.visitorKey), ["v2"]);
assert.equal(a.others[0].staff, false);
const automated={visitor_key:'live-auto:one',automation_session_id:'session-one',nickname:'달빛상자',kakao_id:'990000000077',page_type:'order_form',path:'/order#live',last_seen_at:ago(10)};
const valid=new Map([['live-auto:one','session-one']]);
const included=A.computeAudience([...rows,automated],{kakaoIds:[],names:[]},now,valid);
assert.equal(included.watching,4,'verified server sessions count in the same public number');
assert.ok(included.watchers.some(w=>w.nickname==='달빛상자'));
assert.equal(A.computeAudience([...rows,automated],{},now,new Map()).watching,3,'stopped or unverified sessions disappear');
assert.equal(A.computeAudience([...rows,{...automated,visitor_key:'forged'}],{},now,valid).watching,3,'session ID alone cannot forge a second viewer');
assert.equal(P.isLiveWatchPath("/order#live"), true);
assert.equal(P.isLiveWatchPath("/order"), false);
assert.equal(P.isLiveWatchPath(null), false);
// 서버(창 없음)에서 불러도 안 터짐
P.setLiveWatching(true); assert.equal(P.isLiveWatching(), true); P.setLiveWatching(false); assert.equal(P.isLiveWatching(), false);
console.log("live-audience OK");
