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
  console.error("이 상태로 배포하면 /admin-live 입금내역 자동조회 또는 화면반영이 다시 꺼질 수 있습니다.");
  console.error("Bankda 자동조회, 화면 자동갱신, onSynced 직접 갱신 연결을 먼저 복구하세요.");
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

if (!dashboard.includes("const LIVE_ORDER_AUTO_REFRESH_ENABLED = true;")) {
  fail("AdminLiveDashboard.tsx의 LIVE_ORDER_AUTO_REFRESH_ENABLED가 true가 아닙니다.");
}

if (!dashboard.includes("const LIVE_ORDER_BANKDA_EVENT_REFRESH_ENABLED = true;")) {
  fail("AdminLiveDashboard.tsx의 LIVE_ORDER_BANKDA_EVENT_REFRESH_ENABLED가 true가 아닙니다.");
}

if (dashboard.includes("const LIVE_ORDER_BANKDA_EVENT_REFRESH_ENABLED = false;")) {
  fail("AdminLiveDashboard.tsx에 LIVE_ORDER_BANKDA_EVENT_REFRESH_ENABLED = false가 남아 있습니다.");
}

if (!dashboard.includes("useAutoBankdaPaymentSync({")) {
  fail("AdminLiveDashboard.tsx에 옵션형 useAutoBankdaPaymentSync 호출이 없습니다.");
}

if (!dashboard.includes("onSynced: async")) {
  fail("AdminLiveDashboard.tsx에 Bankda 자동조회 후 직접 화면갱신 onSynced 콜백이 없습니다.");
}

if (!dashboard.includes("await loadDepositsFromServer();")) {
  fail("Bankda 자동조회 완료 후 입금내역을 직접 다시 불러오지 않습니다.");
}

if (!dashboard.includes("await loadOrders();")) {
  fail("Bankda 자동조회 완료 후 주문목록을 직접 다시 불러오지 않습니다.");
}

if (!dashboard.includes("ruru-admin-live-auto-bankda-synced")) {
  fail("AdminLiveDashboard.tsx에 Bankda 자동조회 완료 이벤트 수신 코드가 없습니다.");
}

if (!hook.includes("/api/bankda/sync-and-auto-match")) {
  fail("useAutoBankdaPaymentSync.ts가 /api/bankda/sync-and-auto-match를 호출하지 않습니다.");
}

if (!hook.includes("setInterval")) {
  fail("useAutoBankdaPaymentSync.ts에 자동조회 interval이 없습니다.");
}

if (!hook.includes("onSyncedRef.current")) {
  fail("useAutoBankdaPaymentSync.ts에 자동조회 후 직접 콜백 실행 코드가 없습니다.");
}

if (!hook.includes("ruru-admin-live-auto-bankda-synced-at")) {
  fail("useAutoBankdaPaymentSync.ts에 다른 탭/화면 갱신 보조 신호가 없습니다.");
}

console.log("✅ BANKDA 안전가드 통과: 자동조회 + 직접 화면갱신 + 자동 새로고침 정상");
