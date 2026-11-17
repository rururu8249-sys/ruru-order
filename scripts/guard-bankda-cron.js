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

if (!route.includes("/api/bankda/sync-and-auto-match")) {
  fail("크론 API가 /api/bankda/sync-and-auto-match를 호출하지 않습니다.");
}

if (!route.includes("cache: \"no-store\"")) {
  fail("크론 API fetch에 cache: no-store가 없습니다.");
}

if (!route.includes("export async function GET") || !route.includes("export async function POST")) {
  fail("크론 API에 GET/POST 핸들러가 모두 없습니다.");
}


// Next.js 16: proxy.ts replaces middleware.ts.
const proxyPath = path.join(root, "proxy.ts");
const legacyPath = path.join(root, "middleware.ts");

if (fs.existsSync(proxyPath) && fs.existsSync(legacyPath)) {
  fail("proxy.ts와 middleware.ts가 동시에 존재합니다.");
}

const activePath = fs.existsSync(proxyPath) ? proxyPath : legacyPath;
const middleware = fs.existsSync(activePath)
  ? fs.readFileSync(activePath, "utf8")
  : "";

if (!middleware.includes(
  fs.existsSync(proxyPath)
    ? "export async function proxy("
    : "export async function middleware("
)) {
  fail("활성 인증 진입점의 export 함수를 확인할 수 없습니다.");
}

if (!middleware.includes("INTERNAL_CRON_API_PATHS")) {
  fail("middleware.ts에 내부 Cron API 제한 통과 목록이 없습니다.");
}

if (!middleware.includes("/api/bankda/sync-and-auto-match") || !middleware.includes("/api/bankda/sync-deposits") || !middleware.includes("/api/admin-v2/auto-payment-match/run")) {
  fail("middleware.ts 내부 Cron API 통과 목록에 필요한 Bankda/자동입금확인 API가 없습니다.");
}

if (!route.includes("x-ruru-internal-cron")) {
  fail("cron route가 내부 API 호출 시 x-ruru-internal-cron 헤더를 보내지 않습니다.");
}

const syncAndAutoPath = path.join(root, "app/api/bankda/sync-and-auto-match/route.ts");
const syncAndAuto = fs.existsSync(syncAndAutoPath) ? fs.readFileSync(syncAndAutoPath, "utf8") : "";

if (!syncAndAuto.includes("x-ruru-internal-cron")) {
  fail("sync-and-auto-match가 하위 API 호출 시 x-ruru-internal-cron 헤더를 보내지 않습니다.");
}


// Verify all entrypoints use one server-only implementation and ban insecure fallback paths.
const sharedAuthPath = path.join(root, "lib/internalCronAuth.ts");
if (!fs.existsSync(sharedAuthPath)) fail("공통 인증 모듈이 없습니다.");
const sharedAuth = fs.readFileSync(sharedAuthPath, "utf8");
for (const [name, source] of [["proxy", middleware], ["cron", route], ["sync", syncAndAuto]]) {
  if (source.includes("INTERNAL_CRON_BYPASS_TOKEN") || source.includes("ruru-bankda-cron-internal-v1")) {
    fail(`${name}: 고정 인증 키 사용 금지`);
  }
}
if (!middleware.includes("authorizedInternalCronRequest(request)")) fail("Proxy 공통 인증 검증 누락");
if (!route.includes("authorizedInternalCronRequest(request)")) fail("Cron 공통 인증 검증 누락");
if (!route.includes("internalCronSecret()") || !syncAndAuto.includes("internalCronSecret()")) fail("내부 호출 서버 비밀키 누락");
if (!sharedAuth.includes("timingSafeEqual") || !sharedAuth.includes("CRON_SECRET") || !sharedAuth.includes("BANKDA_CRON_SECRET")) {
  fail("서버 비밀키 검증 누락");
}
if (/isVercelCronRequest|request\.nextUrl\.searchParams\.get\("secret"\)/.test(route)) {
  fail("User-Agent 또는 URL 쿼리 인증 우회 금지");
}
if (!route.includes("Authorization: `Bearer ${internalSecret}`") || !syncAndAuto.includes("Authorization: `Bearer ${internalSecret}`")) {
  fail("내부 호출 인증 헤더 누락");
}
console.log("✅ BANKDA CRON 안전가드 통과: 고정 키 및 위조 User-Agent 우회 없음");
