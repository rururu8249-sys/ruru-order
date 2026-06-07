import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
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
const num = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const cleaned = String(v ?? "").replace(/,/g, "").replace(/원/g, "").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const hasAny = (value, words) => words.some((word) => value.includes(word));

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

function rowBaseAmount(order) {
  return num(
    order.product_price ??
      order.adjusted_product_price ??
      order.item_total_price ??
      order.row_total_price ??
      order.total_price ??
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

  if (hasAny(status, ["입금확인", "자동입금확인", "수동입금확인", "카드결제완료", "카드완료", "결제완료", "취소", "환불"])) {
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
  return [deposit.match_status, deposit.status, deposit.payment_status].map(text).filter(Boolean).join(" / ");
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
  return `${name}__${amount}`;
}

function looseName(v) {
  return text(v).replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();
}

function won(n) {
  return Number(n || 0).toLocaleString("ko-KR") + "원";
}

async function safeSelect(table, orderColumns) {
  for (const col of orderColumns) {
    const { data, error } = await supabase.from(table).select("*").order(col, { ascending: false }).limit(500);
    if (!error) return data || [];
  }
  const { data, error } = await supabase.from(table).select("*").limit(500);
  if (error) throw error;
  return data || [];
}

const orders = await safeSelect("orders", ["created_at", "submitted_at", "id"]);
const deposits = await safeSelect("deposits", ["deposited_time", "created_at", "id"]);

const eligibleOrders = orders.filter((o) => isEligibleOrder(o).ok);
const eligibleDeposits = deposits.filter((d) => isEligibleDeposit(d).ok);

const groupMap = new Map();
for (const order of eligibleOrders) {
  const gid = orderGroupId(order);
  groupMap.set(gid, [...(groupMap.get(gid) || []), order]);
}

const groups = Array.from(groupMap.entries()).map(([groupId, rows]) => {
  const first = rows[0];
  const currentRunAmount = rows.reduce((sum, row) => sum + orderAmount(row), 0);
  const firstFinalLike = orderAmount(first);
  const rowAmounts = rows.map((row) => orderAmount(row));
  const rowBaseAmounts = rows.map((row) => rowBaseAmount(row));

  return {
    groupId,
    orderIds: rows.map((r) => r.id),
    rowCount: rows.length,
    nickname: orderNickname(first),
    name: orderName(first),
    currentRunAmount,
    firstFinalLike,
    rowAmounts,
    rowBaseAmounts,
    status: orderStatusText(first),
    method: text(first.payment_method || "무통장입금"),
    rows,
  };
});

const orderByKey = new Map();
const depositByKey = new Map();

for (const g of groups) {
  const key = makeKey(g.nickname, gconst g of groups) {
  const.currentRunAmount);
  orderByKey.set(key, [...(orderByKey.get(key) || []), g]);
}

for (const d of eligibleDeposits) {
  const key = makeKey(depositName(d), depositAmount(d));
  depositByKey.set(key, [...(depositByKey.get(key) || []), d]);
}

const exactCandidates = [];
const blocked = [];
const unmatchedGroups = [];

for (const g of groups) {
  const exactKey = makeKey(g.nickname, g.currentRunAmount);
  const exactOrders = orderByKey.get(exactKey) || [];
  const exactDeposits = depositByKey.get(exactKey) || [];

  if (exactOrders.length === 1 && exactDeposits.length === 1) {
    exactCandidates.push({ group: g, deposit: exactDeposits[0], reason: "현재 run 코드 기준 자동매칭 후보" });
    continue;
  }

  const sameAmountDeposits = eligibleDeposits
    .filter((d) => depositAmount(d) === g.currentRunAmount)
    .slice(0, 10)
    .map((d) => ({
      id: depositId(d),
      depositor: depositName(d),
      amount: depositAmount(d),
      status: depositStatusText(d) || "미확인",
      deposited_time: d.deposited_time || d.created_at || "",
      nameEqualIfRemoveAt: looseName(depositName(d)) === looseName(g.nickname),
    }));

  const firstAmountDeposits = eligibleDeposits
    .filter((d) => depositAmount(d) === g.firstFinalLike)
    .slice(0, 10)
    .map((d) => ({
      id: depositId(d),
      depositor: depositName(d),
      amount: depositAmount(d),
      status: depositStatusText(d) || "미확인",
      deposited_time: d.deposited_time || d.created_at || "",
      nameEqualIfRemoveAt: looseName(depositName(d)) === looseName(g.nickname),
    }));

  let suspectedReason = "정확한 원인은 아래 후보 비교 필요";

  if (sameAmountDeposits.length === 0 && firstAmountDeposits.length > 0 && g.rowCount > 1) {
    suspectedReason = "주문그룹 여러 행 금액 합산 때문에 현재 run 금액이 실제 입금액보다 커졌을 가능성";
  } else if (sameAmountDeposits.some((d) => d.nameEqualIfRemoveAt) && !exactDeposits.length) {
    suspectedReason = "@ 또는 공백/대소문자 차이 때문에 완전일치 실패 가능성";
  } else if (exactOrders.length !== 1 || exactDeposits.length !== 1) {
    suspectedReason = `1:1 단일 후보 아님 - 주문그룹 현재 run 금액이 실제 입금액보다 커졌을 가능성";
  } else if (sameAmountDeposits.some((d) => d.nameEqualIfRemoveAt) && !exactDeposits.length) {
    suspectedReason = "@ 또는 공백/대 ${exactOrders.length}건 / 입금 ${exactDeposits.length}건`;
  }

  unmatchedGroups.push({
    groupId: g.groupId,
    orderIds: g.orderIds,
    rowCount: g.rowCount,
    nickname: g.nickname,
    name: g.name,
    status: g.status,
    method: g.method,
    currentRunAmount: g.currentRunAmount,
    firstFinalLike: g.firstFinalLike,
    rowAmounts: g.rowAmounts,
    rowBaseAmounts: g.rowBaseAmounts,
    exactKey,
    exactOrderCount: exactOrders.length,
    exactDepositCount: exactDeposits.length,
    suspectedReason,
    sameCurrentRunAmountDeposits: sameAmountDeposits,
    sameFirstFinalLikeAmountDeposits: firstAmountDeposits,
  });
}

const report = {
  generated_at: new Date().toISOString(),
  summary: {
    fetched_orders: orders.length,
    fetched_deposits: deposits.length,
    eligible_order_groups: groups.length,
    eligible_deposits: eligibleDeposits.length,
    current_run_exact_candidates: exactCandidates.length,
    unmatched_order_groups: unmatchedGroups.length,
  },
  currentRunExactCandidates: exactCandidates.map(({ group, deposit, reason }) => ({
    order_group_id: group.groupId,
    nickname: group.nickname,
    name: group.name,
    amount: group.currentRunAmount,
    deposit_id: depositId(deposit),
    depositor: depositName(deposit),
    deposit_amount: depositAmount(deposit),
    reason,
  })),
  unmatchedGroups,
};

const outPath = path.join(process.argv[2] || ".", "auto_match_diagnosis_report.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

console.log("");
console.log("===== 자동입금확인 탈락사유 요약 =====");
console.log("조회 주문:", orders.length);
console.log("조회 입금:", deposits.length);
console.log("자동매칭 대상 주문그룹:", groups.length);
console.log("자동매칭 대상 입금:", eligibleDeposits.length);
console.log("현재 run 코드 기준 자동매칭 후보:", exactCandidates.length);
console.log("탈락 주문그룹:", unmatchedGroups.length);
console.log("");

console.log("===== 탈락 주문그룹 상위 30건 =====");
for (const item of unmatchedGroups.slice(0, 30)) {
  console.log("");
  console.log(`- ${item.nickname} / ${item.name} / 주문그룹 ${item.groupId}`);
  console.log(`  행수: ${item.rowCount}`);
  console.log(`  현재 run 계산금액: ${won(item.currentRunAmount)}`);
  console.log(`  첫 행 기준 금액: ${won(item.firstFinalLike)}`);
  console.log(`  행별 orderAmount: ${item.rowAmounts.map(won).join(" / ")}`);
  console.log(`  사유 추정: ${item.suspectedReason}`);
  console.log(`  현재 run 금액 같은 입금: ${
    item.sameCurrentRunAmountDeposits.length
      ? item.sameCurrentRunAmountDeposits.map((d) => `${d.depositor} ${won(d.amount)} @제거일치:${d.nameEqualIfRemoveAt}`).join(" | ")
      : "없음"
  }`);
  console.log(`  첫 행 금액 같은 입금: ${
    item.sameFirstFinalLikeAmountDeposits.length
      ? item.sameFirstFinalLikeAmountDeposits.map((d) => `${d.depositor} ${won(d.amount)} @제거일치:${d.nameEqualIfRemoveAt}`).join(" | ")
      : "없음"
  }`);
}

console.log("");
console.log("보고서 저장:", outPath);
