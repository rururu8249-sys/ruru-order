const fs = require("fs");
const path = require("path");

const root = process.cwd();
const cronRoutePath = path.join(root, "app/api/cron/bankda-sync/route.ts");

function fail(message) {
  console.error("");
  console.error("❌ BANKDA CRON 안전가드 실패");
  console.error(message);
  console.error("");
  console.error("서버형 Bankda 자동동기화 API가 깨진 상태로 배포될 수 있습니다.");
  process.exit(1);
}

if (!fs.existsSync(cronRoutePath)) {
  fail("app/api/cron/bankda-sync/route.ts 파일이 없습니다.");
}

const route = fs.readFileSync(cronRoutePath, "utf8");

if (!route.includes("CRON_SECRET") || !route.includes("BANKDA_CRON_SECRET")) {
  fail("크론 API에 CRON_SECRET / BANKDA_CRON_SECRET 인증 검사가 없습니다.");
}

if (!route.includes("vercel-cron/1.0") || !route.includes("x-vercel-cron-schedule")) {
  fail("크론 API에 Vercel Cron 공식 헤더 보조 인증 검사가 없습니다.");
}

if (!route.includes("/api/bankda/sync-and-auto-match")) {
  fail("크론 API가 /api/bankda/sync-and-auto-match를 호출하지 않습니다.");
}

if (!route.includes("cache: \"no-store\"")) {
  fail("크론 API fetch에 cache: no-store가 없습니다.");
}

if (!route.includes("export async function GET") || !route.includes("export async function POST")) {
  fail("크론 API에 GET/POST 핸들러가 모두 없습니다.");
}


const middlewarePath = path.join(root, "middleware.ts");
const middleware = fs.existsSync(middlewarePath) ? fs.readFileSync(middlewarePath, "utf8") : "";

if (!middleware.includes("INTERNAL_CRON_API_PATHS")) {
  fail("middleware.ts에 내부 Cron API 제한 통과 목록이 없습니다.");
}

if (!middleware.includes("/api/bankda/sync-and-auto-match") || !middleware.includes("/api/bankda/sync-deposits") || !middleware.includes("/api/admin-v2/auto-payment-match/run")) {
  fail("middleware.ts 내부 Cron API 통과 목록에 필요한 Bankda/자동입금확인 API가 없습니다.");
}

if (!middleware.includes("x-ruru-internal-cron")) {
  fail("middleware.ts에 x-ruru-internal-cron 내부 인증 헤더 검사가 없습니다.");
}

if (!route.includes("x-ruru-internal-cron")) {
  fail("cron route가 내부 API 호출 시 x-ruru-internal-cron 헤더를 보내지 않습니다.");
}

const syncAndAutoPath = path.join(root, "app/api/bankda/sync-and-auto-match/route.ts");
const syncAndAuto = fs.existsSync(syncAndAutoPath) ? fs.readFileSync(syncAndAutoPath, "utf8") : "";

if (!syncAndAuto.includes("x-ruru-internal-cron")) {
  fail("sync-and-auto-match가 하위 API 호출 시 x-ruru-internal-cron 헤더를 보내지 않습니다.");
}


if (!middleware.includes("SUPABASE_SERVICE_ROLE_KEY") || !middleware.includes("ADMIN_SESSION_SECRET")) {
  fail("middleware.ts 내부 Cron 인증 후보에 운영 기본 비밀값 fallback이 없습니다.");
}

if (!route.includes("Authorization: `Bearer ${internalCronSecret}`")) {
  fail("cron route가 내부 API 호출 시 Authorization Bearer 헤더를 보내지 않습니다.");
}

if (!syncAndAuto.includes("Authorization: `Bearer ${internalCronSecret}`")) {
  fail("sync-and-auto-match가 하위 API 호출 시 Authorization Bearer 헤더를 보내지 않습니다.");
}

console.log("✅ BANKDA CRON 안전가드 통과: 서버형 자동동기화 API 정상");
