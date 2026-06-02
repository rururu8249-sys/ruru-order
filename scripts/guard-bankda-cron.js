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

console.log("✅ BANKDA CRON 안전가드 통과: 서버형 자동동기화 API 정상");
