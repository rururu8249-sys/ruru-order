import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const i = s.indexOf("=");
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Supabase 환경변수 없음");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const text = (v) => String(v ?? "").trim();
const cleanName = (v) => text(v).replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();
const num = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, "").replace(/원/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";

function getOrderNames(o) {
  return [
    o.youtube_nickname,
    o.nickname,
    o.customer_nickname,
    o.customer_name,
    o.name,
    o.buyer_name,
  ].map(text).filter(Boolean);
}

function getOrderAmount(o) {
  return num(
    o.final_amount ??
    o.final_total_amount ??
    o.total_payment_amount ??
    o.adjusted_total_price ??
    o.payment_amount ??
    o.deposit_amount ??
    o.order_amount ??
    o.total_price ??
    o.amount
  );
}

function getDepositName(d) {
  return text(d.depositor_name || d.deposit_name || d.sender_name || d.bkjukyo || d.name);
}

function getDepositAmount(d) {
  return num(d.amount || d.deposit_amount || d.input_amount || d.bkinput);
}

function getDepositStatus(d) {
  return [d.match_status, d.status, d.deposit_status, d.payment_status].map(text).filter(Boolean).join(" / ");
}

function getOrderStatus(o) {
  return [
    o.admin_order_status_v2,
    o.order_manage_status,
    o.deposit_status,
    o.payment_status,
    o.order_status,
    o.status,
  ].map(text).filter(Boolean).join(" / ");
}

function isDepositOpen(d) {
  const status = getDepositStatus(d);
  if (d.confirmed_at) return false;
  if (d.match_order_group_id || d.matched_order_group_id || d.match_customer_id) return false;
  if (status.includes("자동입금확인")) return false;
  if (status.includes("수동입금확인")) return false;
  if (status.includes("확인완료")) return false;
  return true;
}

function isOrderOpen(o) {
  const status = getOrderStatus(o);
  if (status.includes("취소")) return false;
  if (status.includes("환불")) return false;
  if (status.includes("카드")) return false;
  if (status.includes("자동입금확인")) return false;
  if (status.includes("수동입금확인")) return false;
  if (status.includes("입금확인")) return false;
  return true;
}

const { data: orders, error: orderError } = await supabase
  .from("orders")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(1200);

if (orderError) {
  console.error("❌ orders 조회 실패:", orderError.message);
  process.exit(1);
}

const { data: deposits, error: depositError } = await supabase
  .from("deposits")
  .select("*")
  .order("id", { ascending: false })
  .limit(800);

if (depositError) {
  console.error("❌ deposits 조회 실패:", depositError.message);
  process.exit(1);
}

const openOrders = (orders || []).filter(isOrderOpen);
const openDeposits = (deposits || []).filter(isDepositOpen);

const depositByNameAmount = new Map();
for (const d of openDeposits) {
  const key = `${cleanName(getDepositName(d))}__${getDepositAmount(d)}`;
  if (!depositByNameAmount.has(key)) depositByNameAmount.set(key, []);
  depositByNameAmount.get(key).push(d);
}

const report = [];

for (const o of openOrders.slice(0, 250)) {
  const names = [...new Set(getOrderNames(o))];
  const amount = getOrderAmount(o);
  const matched = [];

  for (const name of names) {
    const key = `${cleanName(name)}__${amount}`;
    const ds = depositByNameAmount.get(key) || [];
    for (const d of ds) matched.push({ name, deposit: d });
  }

  if (matched.length > 0) {
    report.push({
      kind: matched.length === 1 ? "✅ 자동처리 가능 후보처럼 보임" : "⚠️ 중복 후보라 자동 제외 정상",
      orderId: o.id,
      groupId: o.order_group_id || o.group_id || o.id,
      orderTime: o.created_at || o.submitted_at || "",
      names,
      amount,
      status: getOrderStatus(o),
      matchedCount: matched.length,
      deposits: matched.map(({ deposit }) => ({
        id: deposit.id,
        name: getDepositName(deposit),
        amount: getDepositAmount(deposit),
        status: getDepositStatus(deposit),
        confirmed_at: deposit.confirmed_at || "",
      })),
    });
  }
}

console.log("===== 자동입금확인 후보 분석 =====");
console.log("열린 주문 수:", openOrders.length);
console.log("열린 입금 수:", openDeposits.length);
console.log("최근 주문 중 이름+금액 일치 후보:", report.length);
console.log("");

for (const r of report.slice(0, 80)) {
  console.log(`${r.kind}`);
  console.log(`주문ID: ${r.orderId}`);
  console.log(`그룹ID: ${r.groupId}`);
  console.log(`주문시간: ${r.orderTime}`);
  console.log(`주문이름후보: ${r.names.join(" / ")}`);
  console.log(`주문금액: ${won(r.amount)}`);
  console.log(`주문상태: ${r.status || "-"}`);
  console.log(`일치 입금수: ${r.matchedCount}`);
  for (const d of r.deposits) {
    console.log(`  - 입금ID ${d.id} / ${d.name} / ${won(d.amount)} / ${d.status || "-"} / confirmed_at:${d.confirmed_at || "-"}`);
  }
  console.log("");
}

const possible = report.filter((r) => r.matchedCount === 1);
const duplicate = report.filter((r) => r.matchedCount > 1);

console.log("===== 요약 =====");
console.log("자동처리 가능 후보처럼 보이는 건수:", possible.length);
console.log("중복이라 자동 제외가 맞는 건수:", duplicate.length);

fs.writeFileSync(
  `${process.argv[2]}/auto_match_candidate_report.json`,
  JSON.stringify({ openOrderCount: openOrders.length, openDepositCount: openDeposits.length, report }, null, 2)
);
