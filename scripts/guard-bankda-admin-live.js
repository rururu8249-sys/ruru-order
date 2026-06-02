const fs = require("fs");
const path = require("path");

const root = process.cwd();

const dashboardPath = path.join(root, "components/admin-live/AdminLiveDashboard.tsx");
const hookPath = path.join(root, "components/admin-live/useAutoBankdaPaymentSync.ts");

function fail(message) {
  console.error("");
  console.error("❌ BANKDA 안전가드 실패");
  console.error(message);
  console.error("");
  console.error("이 상태로 배포하면 /admin-live 입금내역 자동반영이 다시 꺼질 수 있습니다.");
  console.error("LIVE_ORDER_BANKDA_EVENT_REFRESH_ENABLED, useAutoBankdaPaymentSync, 자동조회 이벤트 연결을 먼저 복구하세요.");
  process.exit(1);
}

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`필수 파일이 없습니다: ${path.relative(root, filePath)}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

const dashboard = read(dashboardPath);
const hook = read(hookPath);

if (!dashboard.includes("const LIVE_ORDER_BANKDA_EVENT_REFRESH_ENABLED = true;")) {
  fail("AdminLiveDashboard.tsx의 LIVE_ORDER_BANKDA_EVENT_REFRESH_ENABLED가 true가 아닙니다.");
}

if (dashboard.includes("const LIVE_ORDER_BANKDA_EVENT_REFRESH_ENABLED = false;")) {
  fail("AdminLiveDashboard.tsx에 LIVE_ORDER_BANKDA_EVENT_REFRESH_ENABLED = false가 남아 있습니다.");
}

if (!dashboard.includes("useAutoBankdaPaymentSync();")) {
  fail("AdminLiveDashboard.tsx에 useAutoBankdaPaymentSync() 호출이 없습니다.");
}

if (!dashboard.includes("ruru-admin-live-auto-bankda-synced")) {
  fail("AdminLiveDashboard.tsx에 Bankda 자동조회 완료 이벤트 수신 코드가 없습니다.");
}

if (!dashboard.includes("void loadDepositsFromServer();")) {
  fail("Bankda 자동조회 완료 후 입금내역을 다시 불러오는 loadDepositsFromServer 호출이 없습니다.");
}

if (!hook.includes("/api/bankda/sync-and-auto-match")) {
  fail("useAutoBankdaPaymentSync.ts가 /api/bankda/sync-and-auto-match를 호출하지 않습니다.");
}

if (!hook.includes("setInterval")) {
  fail("useAutoBankdaPaymentSync.ts에 자동조회 interval이 없습니다.");
}

console.log("✅ BANKDA 안전가드 통과: 자동조회 + 화면반영 스위치 정상");
