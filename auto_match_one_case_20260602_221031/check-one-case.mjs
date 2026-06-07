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

const targetNick = "날쌜날쌜쟁이";
const targetAmount = 94000;

const text = (v) => String(v ?? "").trim();
const num = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const cleaned = String(v ?? "").replace(/,/g, "").replace(/원/g, "").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};
const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";

function autoMatchName(v) {
  return text(v).replace(/^@+/, "");
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

function orderCustomerName(order) {
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

function depositName(deposit) {
  return text(deposit.depositor_name || deposit.deposit_name || deposit.sender_name || deposit.bkjukyo);
}

function depositAmount(deposit) {
  return num(deposit.amount || deposit.deposit_amount || deposit.input_amount || deposit.bkinput);
}

function depositStatusText(deposit) {
  return [
    deposit.match_status,
    deposit.status,
    deposit.deposit_status,
    deposit.payment_status,
  ].map(text).filter(Boolean).join(" / ");
}

function makeKey(name, amount) {
  return `${autoMatchName(name)}__${amount}`;
}

function hasAny(value, words) {
  return words.some((word) => value.includes(word));
}

function isEligibleOrder(order) {
  const nickname = orderNickname(order);
  const amount = orderAmount(order);
  const status = orderStatusText(order);
  const method = text(order.payment_method || "무통장입금");
  const normalizedMethod = method.replace(/\s+/g, "").toLowerCase();

  if (!order.id) return { ok: false, reason: "주문 ID 없음" };
  if (!orderGroupId(order)) return { ok: false, reason: "주문 그룹 ID 없음" };
  if (!nickname) return { ok: false, reason: "유튜브 닉네임 없음" };
  if (!amount || amount <= 0) return { ok: false, reason: "입금예정금액 없음" };

  const isBank =
    normalizedMethod === "무통장입금" ||
    normalizedMethod === "무통장" ||
    normalizedMethod === "계좌이체" ||
    normalizedMethod === "계좌입금" ||
    normalizedMethod === "bank" ||
    normalizedMethod === "banktransfer" ||
    normalizedMethod.includes("무통장") ||
    normalizedMethod.includes("계좌");

  if (!isBank) return { ok: false, reason: `무통장 주문 아님: ${method}` };

  if (hasAny(status, ["입금확인", "자동입금확인", "수동입금확인", "카드결제완료", "카드완료", "결제완료", "취소", "환불"])) {
    return { ok: false, reason: `이미 처리된 주문 상태: ${status}` };
  }

  return { ok: true, reason: "" };
}

function isEligibleDeposit(deposit) {
  const name = depositName(deposit);
  const amount = depositAmount(deposit);
  const status = depositStatusText(deposit);

  if (!deposit.id) return { ok: false, reason: "입금내역 ID 없음" };
  if (!name) return { ok: false, reason: "입금자명 없음" };
  if (!amount || amount <= 0) return { ok: false, reason: "입금금액 없음" };
  if (deposit.confirmed_at) return { ok: false, reason: "이미 confirmed_at 있음" };
  if (deposit.match_order_group_id || deposit.match_customer_id || deposit.matched_group_id) {
    return { ok: false, reason: "이미 주문과 연결된 입금내역" };
  }

  if (status && !hasAny(status, ["미확인", "미매칭", "대기", "확인필요"])) {
    return { ok: false, reason: `이미 처리된 입금 상태: ${status}` };
  }

  return { ok: true, reason: "" };
}

const { data: orders, error: orderError } = await supabase
  .from("orders")
  .select("*")
  .neq("is_deleted", true)
  .limit(3000);

if (orderError) {
  console.error("❌ orders 조회 실패:", orderError.message);
  process.exit(1);
}

const { data: deposits, error: depositError } = await supabase
  .from("deposits")
  .select("*")
  .limit(3000);

if (depositError) {
  console.error("❌ deposits 조회 실패:", depositError.message);
  process.exit(1);
}

const targetOrders = (orders || []).filter((order) => {
  return (
    autoMatchName(orderNickname(order)) === targetNick ||
    autoMatchName(orderCustomerName(order)) === targetNick ||
    text(orderNickname(order)).includes(targetNick)
  );
});

const groupMap = new Map();
for (const order of targetOrders) {
  const gid = orderGroupId(order);
  groupMap.set(gid, [...(groupMap.get(gid) || []), order]);
}

const targetGroups = Array.from(groupMap.entries()).map(([groupId, rows]) => {
  const first = rows[0];
  return {
    groupId,
    rows,
    orderIds: rows.map((row) => row.id),
    nickname: orderNickname(first),
    customerName: orderCustomerName(first),
    status: orderStatusText(first),
    paymentMethod: text(first.payment_method || "무통장입금"),
    rowAmounts: rows.map(orderAmount),
    groupAmount: rows.reduce((sum, row) => sum + orderAmount(row), 0),
    eligibleRows: rows.map((row) => isEligibleOrder(row)),
  };
});

const relatedDeposits = (deposits || []).filter((deposit) => {
  return (
    autoMatchName(depositName(deposit)) === targetNick ||
    depositAmount(deposit) === targetAmount ||
    text(depositName(deposit)).includes(targetNick)
  );
});

const allEligibleOrders = (orders || []).filter((order) => isEligibleOrder(order).ok);
const allGroupMap = new Map();
for (const order of allEligibleOrders) {
  const gid = orderGroupId(order);
  allGroupMap.set(gid, [...(allGroupMap.get(gid) || []), order]);
}

const allGroups = Array.from(allGroupMap.entries()).map(([groupId, rows]) => {
  const first = rows[0];
  const nickname = orderNickname(first);
  const customerName = orderCustomerName(first);
  const amount = rows.reduce((sum, row) => sum + orderAmount(row), 0);
  const names = [];
  const n1 = autoMatchName(nickname);
  const n2 = autoMatchName(customerName);
  if (n1) names.push({ name: n1, basis: "닉네임" });
  if (n2 && n2 !== n1) names.push({ name: n2, basis: "고객명" });

  return {
    groupId,
    orderIds: rows.map((row) => row.id),
    nickname,
    customerName,
    amount,
    names,
  };
});

const eligibleDeposits = (deposits || []).filter((deposit) => isEligibleDeposit(deposit).ok);

const ordersByKey = new Map();
const depositsByKey = new Map();

for (const group of allGroups) {
  for (const item of group.names) {
    const key = makeKey(item.name, group.amount);
    ordersByKey.set(key, [...(ordersByKey.get(key) || []), { ...group, matchName: item.name, matchBasis: item.basis }]);
  }
}

for (const deposit of eligibleDeposits) {
  const key = makeKey(depositName(deposit), depositAmount(deposit));
  depositsByKey.set(key, [...(depositsByKey.get(key) || []), deposit]);
}

const targetKeys = [
  makeKey(targetNick, targetAmount),
];

console.log("");
console.log("===== 대상 주문그룹 =====");
for (const group of targetGroups) {
  console.log("");
  console.log("그룹:", group.groupId);
  console.log("주문 IDs:", group.orderIds.join(", "));
  console.log("닉네임:", group.nickname);
  console.log("고객명:", group.customerName);
  console.log("상태:", group.status || "-");
  console.log("결제수단:", group.paymentMethod || "-");
  console.log("행별금액:", group.rowAmounts.map(won).join(" / "));
  console.log("그룹계산금액:", won(group.groupAmount));
  console.log("주문행별 자동대상 여부:", group.eligibleRows.map((r) => r.ok ? "대상" : `제외:${r.reason}`).join(" / "));
}

console.log("");
console.log("===== 관련 입금내역 =====");
for (const deposit of relatedDeposits.slice(0, 30)) {
  const check = isEligibleDeposit(deposit);
  console.log("");
  console.log("입금 ID:", deposit.id);
  console.log("입금자명:", depositName(deposit));
  console.log("금액:", won(depositAmount(deposit)));
  console.log("입금시간:", deposit.deposited_time || deposit.created_at || "-");
  console.log("상태:", depositStatusText(deposit) || "-");
  console.log("confirmed_at:", deposit.confirmed_at || "-");
  console.log("match_order_group_id:", deposit.match_order_group_id || deposit.matched_group_id || "-");
  console.log("자동대상:", check.ok ? "대상" : `제외:${check.reason}`);
}

console.log("");
console.log("===== 자동매칭 키 분석 =====");
for (const key of targetKeys) {
  const keyOrders = ordersByKey.get(key) || [];
  const keyDeposits = depositsByKey.get(key) || [];

  console.log("");
  console.log("키:", key);
  console.log("주문후보 수:", keyOrders.length);
  console.log("입금후보 수:", keyDeposits.length);

  console.log("주문후보:");
  for (const order of keyOrders) {
    console.log(`- 그룹 ${order.groupId} / ${order.nickname} / ${order.customerName} / ${won(order.amount)} / 기준 ${order.matchBasis}`);
  }

  console.log("입금후보:");
  for (const deposit of keyDeposits) {
    console.log(`- 입금 ${deposit.id} / ${depositName(deposit)} / ${won(depositAmount(deposit))} / ${deposit.deposited_time || deposit.created_at || "-"}`);
  }

  if (keyOrders.length === 1 && keyDeposits.length === 1) {
    console.log("판정: ✅ 자동매칭 가능해야 정상");
  } else {
    console.log("판정: ❌ 자동매칭 제외");
  }
}

console.log("");
console.log("===== 결론 =====");
console.log("위에서 주문후보 수 1, 입금후보 수 1인데도 실제 화면이 안 바뀌면 운영 배포가 새 코드가 아니거나 API 실행이 안 된 것입니다.");
console.log("주문후보/입금후보 중 하나가 0 또는 2 이상이면 그 이유 때문에 자동매칭이 막힌 것입니다.");
