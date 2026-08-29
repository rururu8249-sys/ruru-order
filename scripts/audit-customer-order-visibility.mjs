// [2026-08-29] 손님 「주문내역」 노출 전수 조사 — 읽기 전용. 아무것도 수정하지 않습니다.
//
// 실행:  node scripts/audit-customer-order-visibility.mjs
//        (네트워크가 필요합니다. 맥 터미널에서 실행하세요)
//
// 확인하는 것
//   1) 기존 7일 규칙에서 손님 화면에 안 보이던 주문이 몇 건인지
//   2) 새 규칙(180일 + 카카오ID 우선)으로 몇 건이 되살아나는지
//   3) 같은 닉네임인데 전화번호가 다른 고객 (루루짱929 님 같은 케이스)
//   4) 같은 카카오ID인데 전화번호가 여러 개 / 같은 전화번호에 카카오ID가 여러 개
//   5) kakao_id 가 비어 있는 주문 비율 (전화번호가 바뀌면 사라질 위험군)
//   6) 특정 닉네임 상세 추적:  node scripts/audit-customer-order-visibility.mjs 루루짱929

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

const LOOKUP_DAYS = 180; // lib/customerOrderLookup.ts 의 CUSTOMER_ORDER_LOOKUP_DAYS 와 같은 값

async function selectAll(pathAndQuery) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${from}-${from + pageSize - 1}`,
      },
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
const days = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

const targetNickname = process.argv[2] || "";

console.log("주문 데이터를 읽는 중…");
const orders = await selectAll(
  "orders?select=id,created_at,customer_name,customer_phone,kakao_id,youtube_nickname,nickname,product_name,order_group_id,payment_status,order_status&order=created_at.desc"
);
console.log(`전체 주문 행: ${fmt(orders.length)}건\n`);

const nickOf = (o) => String(o.youtube_nickname || o.nickname || "").trim();

// ── 1. 조회 기간 때문에 안 보이던 주문 ──────────────────────────────────────
const older7 = orders.filter((o) => days(o.created_at) > 7);
const within180 = older7.filter((o) => days(o.created_at) <= LOOKUP_DAYS);
console.log("── 1. 조회 기간 영향 ──");
console.log(`  7일이 지나 손님 화면에서 사라져 있던 주문: ${fmt(older7.length)}건`);
console.log(`  그중 새 규칙(${LOOKUP_DAYS}일)으로 다시 보이게 되는 주문: ${fmt(within180.length)}건`);
console.log(`  ${LOOKUP_DAYS}일도 넘은 주문(여전히 안 보임): ${fmt(older7.length - within180.length)}건\n`);

// ── 2. kakao_id 없는 주문 (번호 바뀌면 사라질 위험군) ───────────────────────
const noKakao = orders.filter((o) => !String(o.kakao_id ?? "").trim());
console.log("── 2. 카카오ID가 비어 있는 주문 ──");
console.log(`  ${fmt(noKakao.length)}건 / 전체 ${fmt(orders.length)}건 (${((noKakao.length / (orders.length || 1)) * 100).toFixed(1)}%)`);
console.log("  → 이 주문들은 손님 전화번호가 바뀌면 조회에서 사라집니다.\n");

// ── 3. 같은 닉네임인데 전화번호가 다른 경우 ────────────────────────────────
const byNick = new Map();
for (const o of orders) {
  const nick = nickOf(o);
  if (!nick) continue;
  if (!byNick.has(nick)) byNick.set(nick, []);
  byNick.get(nick).push(o);
}
const splitNick = [...byNick.entries()]
  .map(([nick, list]) => ({
    nick,
    phones: [...new Set(list.map((o) => digits(o.customer_phone)).filter(Boolean))],
    names: [...new Set(list.map((o) => String(o.customer_name || "").trim()).filter(Boolean))],
    kakaoIds: [...new Set(list.map((o) => String(o.kakao_id ?? "").trim()).filter(Boolean))],
    count: list.length,
  }))
  .filter((r) => r.phones.length > 1 || r.kakaoIds.length > 1)
  .sort((a, b) => b.count - a.count);
console.log("── 3. 같은 닉네임인데 전화번호/카카오ID가 갈린 고객 ──");
console.log(`  ${fmt(splitNick.length)}명`);
for (const r of splitNick.slice(0, 25)) {
  console.log(`   · ${r.nick}  주문 ${r.count}건 | 이름 ${r.names.join(", ") || "-"} | 번호 ${r.phones.length}개 ${r.phones.join(", ")} | 카카오ID ${r.kakaoIds.length}개`);
}
if (splitNick.length > 25) console.log(`   … 외 ${splitNick.length - 25}명`);
console.log("  → 번호가 갈린 손님은 한쪽 번호로 로그인하면 반대쪽 주문이 안 보입니다.\n");

// ── 4. 같은 전화번호에 카카오ID가 여러 개 (계정 중복 의심) ──────────────────
const byPhone = new Map();
for (const o of orders) {
  const p = digits(o.customer_phone);
  if (!p) continue;
  if (!byPhone.has(p)) byPhone.set(p, new Set());
  const k = String(o.kakao_id ?? "").trim();
  if (k) byPhone.get(p).add(k);
}
const multiKakao = [...byPhone.entries()].filter(([, ids]) => ids.size > 1);
console.log("── 4. 같은 전화번호에 카카오 계정이 2개 이상 ──");
console.log(`  ${fmt(multiKakao.length)}건`);
for (const [p, ids] of multiKakao.slice(0, 15)) console.log(`   · ${p} → 카카오ID ${ids.size}개`);
console.log();

// ── 5. 특정 닉네임 상세 추적 ───────────────────────────────────────────────
if (targetNickname) {
  console.log(`── 5. 「${targetNickname}」 상세 추적 ──`);
  const mine = orders.filter((o) => nickOf(o).includes(targetNickname));
  if (mine.length === 0) console.log("  해당 닉네임 주문을 찾지 못했습니다.");
  for (const o of mine) {
    const d = days(o.created_at);
    const oldVisible = d <= 7;
    const newVisible = d <= LOOKUP_DAYS;
    console.log(
      `   · ${String(o.created_at).slice(0, 16).replace("T", " ")} (${d}일 전) | ${o.customer_name || "-"} | ${digits(o.customer_phone) || "번호없음"} | 카카오ID ${o.kakao_id || "없음"}\n` +
      `     ${o.product_name || "-"}\n` +
      `     기존 7일 규칙: ${oldVisible ? "보임" : "안 보임"}  →  새 규칙: ${newVisible ? "보임" : "안 보임"}`
    );
  }
  console.log();
}

// ── 6. 방송/쇼핑몰 모드와의 관계 ───────────────────────────────────────────
console.log("── 6. 방송 상태와 주문내역 노출의 관계 ──");
console.log("  손님 주문내역 조회문(app/myorder/page.tsx, app/order/page.tsx)에는");
console.log("  broadcast 관련 조건이 전혀 없습니다. 방송을 종료해도, 쇼핑몰 모드여도");
console.log("  주문내역이 사라지지 않습니다. 원인은 조회 기간과 고객 식별 기준이었습니다.\n");

console.log("조사 완료. 이 스크립트는 읽기만 했고 아무것도 바꾸지 않았습니다.");
