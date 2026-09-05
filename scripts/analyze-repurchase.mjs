// [2026-09-05] 고객 구매주기·재구매율 전수 분석 — 읽기 전용. 아무것도 수정하지 않습니다.
//
// 실행:  node scripts/analyze-repurchase.mjs
//        (네트워크가 필요합니다. 맥 터미널에서 실행하세요)
//
// 뽑는 것
//   1) 재구매율: 2회 이상 구매한 고객 비율 (취소 주문 제외)
//   2) 구매 횟수 분포 (1회 / 2회 / 3~5회 / 6회 이상)
//   3) 구매 간격: 같은 고객의 연속 구매 사이 일수 (중앙값·사분위)
//   4) 복귀 대상 규모: 마지막 구매 30/60/90/180일 지난 "재구매 경험 고객" 수
//   5) 월별 신규 vs 재구매 고객 수
// 고객 식별: kakao_id 우선, 없으면 전화번호(숫자만). 구매 1건 = order_group_id 1개.

import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const envText = fs.readFileSync(path.join(repoRoot, ".env.local"), "utf8");
const readEnv = (key) => (envText.match(new RegExp(`^${key}=(.*)$`, "m")) || [])[1]?.trim() || "";
const SUPABASE_URL = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(".env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}

async function selectAll(pathAndQuery) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Range: `${from}-${from + pageSize - 1}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

const digits = (v) => String(v ?? "").replace(/[^0-9]/g, "");
const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");

console.log("주문 데이터를 읽는 중…");
// [컬럼 자동 감지] 테이블마다 상태 컬럼명이 달라서, 실제 한 줄을 먼저 보고 있는 컬럼만 쓴다.
const probeRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=*&limit=1`, {
  headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
});
if (!probeRes.ok) throw new Error(`probe ${probeRes.status} ${await probeRes.text()}`);
const probeRow = (await probeRes.json())[0] || {};
const allCols = Object.keys(probeRow);
const statusCols = allCols.filter((c) => /status|취소|cancel/i.test(c));
const baseCols = ["id", "created_at", "customer_phone", "kakao_id", "youtube_nickname", "order_group_id"].filter((c) => allCols.includes(c) || c === "id" || c === "created_at");
const selectCols = Array.from(new Set([...baseCols, ...statusCols])).join(",");
console.log(`상태 컬럼 감지: ${statusCols.join(", ") || "(없음)"}`);
const orders = await selectAll(
  `orders?select=${selectCols}&order=created_at.asc`
);
console.log(`주문 행 ${fmt(orders.length)}건 로드`);

// 취소 제외: 감지된 상태 컬럼 값에 cancel/취소 가 들어가면 제외
const isCanceledRow = (o) => statusCols.some((c) => /cancel|취소/i.test(String(o[c] ?? "")));
const purchasesByCustomer = new Map(); // custKey -> Map(groupKey -> {date})
const nickOf = new Map();
for (const o of orders) {
  if (isCanceledRow(o)) continue;
  const custKey = String(o.kakao_id || "").trim() || digits(o.customer_phone);
  if (!custKey) continue;
  const groupKey = String(o.order_group_id || o.id);
  const t = new Date(o.created_at).getTime();
  if (!Number.isFinite(t)) continue;
  if (!purchasesByCustomer.has(custKey)) purchasesByCustomer.set(custKey, new Map());
  const g = purchasesByCustomer.get(custKey);
  if (!g.has(groupKey) || t < g.get(groupKey)) g.set(groupKey, t);
  const nick = String(o.youtube_nickname || "").trim();
  if (nick) nickOf.set(custKey, nick);
}

// 같은 날 여러 그룹(방송 중 추가주문)은 1회 구매로 합침
const buyDatesByCustomer = new Map();
for (const [cust, groups] of purchasesByCustomer) {
  const dayset = new Set();
  for (const t of groups.values()) dayset.add(new Date(t).toISOString().slice(0, 10));
  buyDatesByCustomer.set(cust, Array.from(dayset).sort());
}

const customers = Array.from(buyDatesByCustomer.entries());
const total = customers.length;
const counts = { 1: 0, 2: 0, "3-5": 0, "6+": 0 };
const gaps = [];
const lapsed = { 30: 0, 60: 0, 90: 0, 180: 0 };
const lapsedRepeat = { 30: 0, 60: 0, 90: 0, 180: 0 };
const now = Date.now();
for (const [, dates] of customers) {
  const n = dates.length;
  if (n === 1) counts[1]++; else if (n === 2) counts[2]++; else if (n <= 5) counts["3-5"]++; else counts["6+"]++;
  for (let i = 1; i < n; i++) gaps.push(Math.round((new Date(dates[i]) - new Date(dates[i - 1])) / 86400000));
  const daysSinceLast = Math.floor((now - new Date(dates[n - 1]).getTime()) / 86400000);
  for (const d of [30, 60, 90, 180]) {
    if (daysSinceLast >= d) { lapsed[d]++; if (n >= 2) lapsedRepeat[d]++; }
  }
}
gaps.sort((a, b) => a - b);
const q = (p) => (gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] : 0);

const repeaters = total - counts[1];
console.log("\n===== 재구매율 =====");
console.log(`구매 고객 ${fmt(total)}명 중 2회 이상 구매 ${fmt(repeaters)}명 → 재구매율 ${(total ? (repeaters / total) * 100 : 0).toFixed(1)}%`);
console.log(`분포: 1회 ${fmt(counts[1])} · 2회 ${fmt(counts[2])} · 3~5회 ${fmt(counts["3-5"])} · 6회+ ${fmt(counts["6+"])}`);

console.log("\n===== 구매 간격 (연속 구매 사이 일수, 같은 날 합침) =====");
console.log(`표본 ${fmt(gaps.length)}건 · 25% ${q(0.25)}일 · 중앙값 ${q(0.5)}일 · 75% ${q(0.75)}일 · 90% ${q(0.9)}일`);

console.log("\n===== 복귀 대상 규모 (마지막 구매 후 경과) =====");
for (const d of [30, 60, 90, 180]) {
  console.log(`${String(d).padStart(3)}일↑ 무구매: 전체 ${fmt(lapsed[d])}명 · 그중 재구매 경험자(단골 후보) ${fmt(lapsedRepeat[d])}명`);
}

console.log("\n===== 월별 신규 vs 재구매 구매자 =====");
const monthly = new Map();
for (const [cust, dates] of customers) {
  dates.forEach((day, i) => {
    const m = day.slice(0, 7);
    if (!monthly.has(m)) monthly.set(m, { nw: 0, rp: 0 });
    monthly.get(m)[i === 0 ? "nw" : "rp"]++;
  });
}
for (const m of Array.from(monthly.keys()).sort()) {
  const v = monthly.get(m);
  console.log(`${m}: 신규 ${fmt(v.nw)}명 · 재구매 ${fmt(v.rp)}명 (재구매 비중 ${((v.rp / Math.max(1, v.nw + v.rp)) * 100).toFixed(0)}%)`);
}

console.log("\n===== 6회 이상 산 최상위 단골 TOP 15 (닉네임 · 구매횟수 · 마지막 구매) =====");
const top = customers
  .map(([cust, dates]) => ({ cust, n: dates.length, last: dates[dates.length - 1] }))
  .sort((a, b) => b.n - a.n)
  .slice(0, 15);
for (const t of top) console.log(`${(nickOf.get(t.cust) || t.cust).padEnd(16)} ${String(t.n).padStart(3)}회 · 마지막 ${t.last}`);

console.log("\n(읽기 전용 분석 — 아무것도 수정하지 않았습니다)");
