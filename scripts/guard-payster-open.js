#!/usr/bin/env node
/**
 * 페이스터 여는 방식 안전가드 — 2026-09-08 신설
 *
 * 왜: 이 코드는 iframe ↔ 별도 창 사이를 «네 번» 오갔다. 원인을 안 밝히고 반대로만 바꾼 탓이다.
 *
 * [2026-09-08 실측 — 확정]
 *   · iframe 안 → 흰 화면. 문서는 로드되는데(SecurityError로 확인) 페이스터 앱이 안 그린다.
 *     X-Frame-Options·CSP 차단 메시지는 없었다. 우리가 뚫을 수 없다.
 *   · «이름 있는» window.open (noopener 없이, window.opener 남음) → 정상 동작.
 *     화면으로 확인함: #/payment/smspayment/success 까지 진행되고 발송 결과가 표시됨.
 *
 * [정정] 예전에 이 파일에 「이름 있는 창 ❌ (opener 남아서 거부)」라고 적어뒀는데 «틀렸다».
 *   그 탓에 이름 없이(noopener) 열게 해놨고, 카드결제를 누를 때마다 새 창이 떴다.
 *   페이스터 로그인은 창마다 따로라 사장님이 매번 다시 로그인해야 했다.
 *   → 지금 규칙: «고정 이름»으로 열어 한 창을 계속 재사용한다(로그인 유지 + 창 안 쌓임).
 *
 * 이 가드는 ① iframe 으로 되돌아가는 것 ② 이름 없이(_blank·noopener) 열어
 * 창이 매번 새로 생기는 것 을 막는다.
 * 실행: node scripts/guard-payster-open.js   (npm run guard 에 포함)
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
}
["components", "app", "lib"].forEach((d) => walk(path.join(ROOT, d)));

const hits = [];
for (const file of files) {
  const rel = path.relative(ROOT, file);
  fs.readFileSync(file, "utf8").split("\n").forEach((raw, i) => {
    const t = raw.trim();
    if (t.startsWith("//") || t.startsWith("*")) return;
    // ① 페이스터를 iframe 에 넣는 코드
    if (/<iframe[^>]*payster/i.test(raw) || (/<iframe/.test(raw) && /paysterUrl/.test(raw)))
      hits.push({ rel, line: i + 1, why: "페이스터를 iframe 에 넣으면 «항상 흰 화면»", text: t.slice(0, 110) });
    // ② 이름 없이 여는 window.open — 창이 매번 새로 생겨 페이스터 로그인이 풀린다
    if (/window\.open\([^)]*payster/i.test(raw) && /(noopener|"_blank"|'_blank')/.test(raw))
      hits.push({ rel, line: i + 1, why: "_blank·noopener 로 열면 창이 매번 새로 생겨 페이스터 로그인이 풀린다 → 고정 이름(PAYSTER_WINDOW_NAME)으로 열 것", text: t.slice(0, 110) });
  });
}

if (hits.length === 0) {
  console.log("✅ 페이스터 여는 방식 통과 — iframe 없음, 고정 이름으로 한 창만 재사용(로그인 유지)");
  process.exit(0);
}
console.error(`❌ 페이스터가 안 열리는 방식 ${hits.length}건\n`);
for (const h of hits) console.error(`   ${h.rel}:${h.line}\n     ${h.why}\n     ${h.text}`);
console.error(`\n여는 함수는 AdminLiveCardPayPopup.tsx 의 openPayster() 를 쓰세요.`);
console.error(`이유는 그 파일 상단 주석에 실측 근거와 함께 적혀 있습니다.`);
process.exit(1);
