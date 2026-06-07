import fs from "fs";
import path from "path";
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

function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const cleaned = String(v ?? "")
    .replace(/,/g, "")
    .replace(/원/g, "")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function hasAny(value, words) {
  return words.some((word) => value.includes(word));
}

function won(n) {
  return Number(n || 0).toLocaleString("ko-KR") + "원";
}

function orderAmount(order) {
  return num(
    order.final_amount ??
      order.adjusted_total_price ??
      order.total_price ??
      order.payment_amount ??
      order.deposit_amount ??
      order.order_amount ??
      order.amount
  );
}

function orderGroupId(order) {
  return text(order.order_group_id || order.group_id || order.id);
}

function orderNickname(order) {
  return text(order.youtube_nickname || order.nickname || order.customer_nickname);
}

function orderName(order) {
  return text(order.customer_name || order.name || order.buyer_name);
}

function orderStatusText(order) {
  return [
    order.admin_order_status_v2,
    order.order_manage_status,
    order.deposit_status,
    order.payment_status,
    order.order_status,
    order.status,
  ].map(text).filter(Boolean).join(" / ");
}

function isBankPaymentMethod(value) {
  const method = text(value || "무통장입금");
  if (!method) return true;
  const normalized = method.replace(/\s+/g, "").toLowerCase();
  return (
    normalized === "무통장입금" ||
    normalized === "무통장" ||
    normalized === "계좌이체" ||
    normalized === "계좌입금" ||
    normalized === "bank" ||
    normalized === "banktransfer" ||
    normalized.includes("무통장") ||
    normalized.includes("계좌")
  );
}

function isEligibleOrder(order) {
  const nickname = orderNickname(order);
  const amount = orderAmount(order);
  const status = orderStatusText(order);
  const method = text(order.payment_method || "무통장입금");

  if (!order.id) return { ok: false, reason: "주문 ID 없음" };
  if (!orderGroupId(order)) return { ok: false, reason: "주문 그룹 ID 없음" };
  if (!nickname) return { ok: false, reason: "유튜브 닉네임 없음" };
  if (!amount || amount <= 0) return { ok: false, reason: "입금예정금액 없음" };
  if (!isBankPaymentMethod(method)) return { ok: false, reason: `무통장 주문 아님: ${method}` };

  if (hasAny(status, [
    "입금확인",
    "자동입금확인",
    "수동입금확인",
    "카드결제완료",
    "카드완료",
    "결제완료",
    "취소",
    "환불",
  ])) {
    return { ok: false, reason: `이미 처리된 주문 상태: ${status}` };
  }

  return { ok: true, reason: "" };
}

function depositId(deposit) {
  return num(deposit.id || deposit.deposit_id || deposit.bankda_id || deposit.transaction_id);
}

function depositName(deposit) {
  return text(deposit.depositor_name || deposit.deposit_name || deposit.sender_name || deposit.bkjukyo);
}

function depositAmount(deposit) {
  return num(deposit.amount || deposit.deposit_amount || deposit.input_amount || deposit.bkinput);
}

function depositStatusText(deposit) {
  return [deposit.match_status, deposit.status, deposit.payment_status]
    .map(text)
    .filter(Boolean)
    .join(" / ");
}

function isEligibleDeposit(deposit) {
  const id = depositId(deposit);
  const name = depositName(deposit);
  const amount = depositAmount(deposit);
  const status = depositStatusText(deposit);

  if (!id) return { ok: false, reason: "입금내역 ID 없음" };
  if (!name) return { ok: false, reason: "입금자명 없음" };
  if (!amount || amount <= 0) return { ok: false, reason: "입금금액 없음" };
  if (deposit.confirmed_at) return { ok: false, reason: "이미 confirmed_at 있음" };
  if (deposit.match_order_group_id || deposit.match_customer_id) return { ok: false, reason: "이미 주문과 연결된 입금내역" };

  if (status && !hasAny(status, ["미확인", "미매칭", "대기", "확인필요"])) {
    return { ok: false, reason: `이미 처리된 입금 상태: ${status}` };
  }

  return { ok: true, reason: "" };
}

function makeKey(name, amount) {
  return `${text(name)}__${num(amount)}`;
}

function looseName(value) {
  return text(value).replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();
}

async function safeSelect(table, orderColumns) {
  for (const col of orderColumns) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(col, { ascending: false })
      .limit(700);

    if (!error) return data || [];
  }

  const { data, error } = await supabase.from(table).select("*").limit(700);
  if (error) throw error;
  return data || [];
}

const orders = await safeSelect("orders", ["created_at", "submitted_at", "id"]);
const deposits = await safeSelect("deposits", ["deposited_time", "created_at", "id"]);

const eligibleOrders = orders.filter((order) => isEligibleOrder(order).ok);
const eligibleDeposits = deposits.filter((deposit) => isEligibleDeposit(deposit).ok);

const groupMap = new Map();

for (const order of eligibleOrders) {
  const groupId = orderGroupId(order);
  groupMap.set(groupId, [...(groupMap.get(groupId) || []), order]);
}

const groups = [];

for (const [groupId, rows] of groupMap.entries()) {
  const first = rows[0];
  const nickname = orderNickname(first);
  const amount = rows.reduce((sum, row) => sum + orderAmount(row), 0);
  const firstAmount = orderAmount(first);
  const orderIds = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);

  groups.push({
    groupId,
    orderIds,
    rowCount: rows.length,
    nickname,
    name: orderName(first),
    amount,
    firstAmount,
    rowAmounts: rows.map(orderAmount),
    status: orderStatusText(first),
    method: text(first.payment_method || "무통장입금"),
  });
}

const ordersByKey = new Map();
const depositsByKey = new Map();

for (const group of groups) {
  const key = makeKey(group.nickname, group.amount);
  ordersByKey.set(key, [...(ordersByKey.get(key) || []), group]);
}

for (const deposit of eligibleDeposits) {
  const key = makeKey(depositName(deposit), depositAmount(deposit));
  depositsByKey.set(key, [...(depositsByKey.get(key) || []), deposit]);
}

const candidates = [];
const blocked = [];

for (const group of groups) {
  const exactKey = makeKey(group.nickname, group.amount);
  const keyOrders = ordersByKey.get(exactKey) || [];
  const keyDeposits = depositsByKey.get(exactKey) || [];

  if (keyOrders.length === 1 && keyDeposits.length === 1) {
    const deposit = keyDeposits[0];
    candidates.push({
      groupId: group.groupId,
      orderIds: group.orderIds,
      nickname: group.nickname,
      name: group.name,
      orderAmount: group.amount,
      depositId: depositId(deposit),
      depositor: depositName(deposit),
      depositAmount: depositAmount(deposit),
      reason: "현재 run 코드 기준 자동매칭 가능",
    });
    continue;
  }

  const sameCurrentAmountDeposits = eligibleDeposits
    .filter((deposit) => depositAmount(deposit) === group.amount)
    .slice(0, 10)
    .map((deposit) => ({
      id: depositId(deposit),
      depositor: depositName(deposit),
      amount: depositAmount(deposit),
      status: depositStatusText(deposit) || "미확인",
      atNameMatch: looseName(depositName(deposit)) === looseName(group.nickname),
    }));

  const sameFirstAmountDeposits = eligibleDeposits
    .filter((deposit) => depositAmount(deposit) === group.firstAmount)
    .slice(0, 10)
    .map((deposit) => ({
      id: depositId(deposit),
      depositor: depositName(deposit),
      amount: depositAmount(deposit),
      status: depositStatusText(deposit) || "미확인",
      atNameMatch: looseName(depositName(deposit)) === looseName(group.nickname),
    }));

  let reason = `1:1 단일 후보 아님 - 주문그룹 ${keyOrders.length}건 / 입금 ${keyDeposits.length}건`;

  if (sameCurrentAmountDeposits.some((deposit) => deposit.atNameMatch)) {
    reason = "@ 제거 시 이름은 같은데 현재 완전일치 기준에서 제외 가능성";
  }

  if (group.rowCount > 1 && sameCurrentAmountDeposits.length === 0 && sameFirstAmountDeposits.length > 0) {
    reason = "다상품 주문에서 주문행 금액 합산 때문에 입금액과 달라졌을 가능성";
  }

  blocked.push({
    groupId: group.groupId,
    orderIds: group.orderIds,
    rowCount: group.rowCount,
    nickname: group.nickname,
    name: group.name,
    currentRunAmount: group.amount,
    firstRowAmount: group.firstAmount,
    rowAmounts: group.rowAmounts,
    status: group.status,
    method: group.method,
    reason,
    sameCurrentAmountDeposits,
    sameFirstAmountDeposits,
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    fetchedOrders: orders.length,
    fetchedDeposits: deposits.length,
    eligibleOrderGroups: groups.length,
    eligibleDeposits: eligibleDeposits.length,
    currentRunCandidates: candidates.length,
    blockedGroups: blocked.length,
  },
  candidates,
  blocked,
};

const outDir = process.argv[2] || ".";
const reportPath = path.join(outDir, "auto_match_diagnosis_report.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

console.log("===== 자동입금확인 탈락사유 요약 =====");
console.log("조회 주문:", orders.length);
console.log("조회 입금:", deposits.length);
console.log("자동매칭 대상 주문그룹:", groups.length);
console.log("자동매칭 대상 입금:", eligibleDeposits.length);
console.log("현재 run 코드 기준 자동매칭 가능:", candidates.length);
console.log("자동처리 제외 주문그룹:", blocked.length);
console.log("");

console.log("===== 자동처리 제외 상위 40건 =====");

for (const item of blocked.slice(0, 40)) {
  console.log("");
  console.log(`- ${item.nickname} / ${item.name} / 그룹 ${item.groupId}`);
  console.log(`  주문행수: ${item.rowCount}`);
  console.log(`  현재 run 계산금액: ${won(item.currentRunAmount)}`);
  console.log(`  첫 행 기준금액: ${won(item.firstRowAmount)}`);
  console.log(`  행별금액: ${item.rowAmounts.map(won).join(" / ")}`);
  console.log(`  제외사유: ${item.reason}`);
  console.log(`  현재금액 같은 입금: ${
    item.sameCurrentAmountDeposits.length
      ? item.sameCurrentAmountDeposits.map((d) => `${d.depositor} ${won(d.amount)} @제거일치:${d.atNameMatch}`).join(" | ")
      : "없음"
  }`);
  console.log(`  첫행금액 같은 입금: ${
    item.sameFirstAmountDeposits.length
      ? item.sameFirstAmountDeposits.map((d) => `${d.depositor} ${won(d.amount)} @제거일치:${d.atNameMatch}`).join(" | ")
      : "없음"
  }`);
}

console.log("");
console.log("보고서 저장:", reportPath);
