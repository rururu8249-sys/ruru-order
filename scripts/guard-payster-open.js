#!/usr/bin/env node
/**
 * 페이스터 여는 방식 안전가드 — 2026-09-08 신설
 *
 * 왜: 이 코드는 iframe ↔ 별도 창 사이를 «네 번» 오갔다. 원인을 안 밝히고 반대로만 바꾼 탓이다.
 *   2026-09-08 실측으로 원인을 확정했다 — 페이스터는 「누가 나를 열었는가」를 보고 거부한다.
 *     iframe(window.parent 있음) ❌ / 이름 있는 window.open(window.opener 남음) ❌ / 일반 탭 ✅
 *   그래서 반드시 opener 를 끊고(noopener) 열어야 한다.
 *
 * 이 가드는 다시 iframe 이나 opener 남는 창으로 되돌아가는 것을 막는다.
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
    // ② opener 가 남는 window.open (noopener 없음)
    if (/window\.open\([^)]*payster/i.test(raw) && !/noopener/.test(raw))
      hits.push({ rel, line: i + 1, why: "noopener 없이 열면 window.opener 가 남아 페이스터가 거부한다", text: t.slice(0, 110) });
  });
}

if (hits.length === 0) {
  console.log("✅ 페이스터 여는 방식 통과 — iframe 없음, opener 끊고(noopener) 연다");
  process.exit(0);
}
console.error(`❌ 페이스터가 안 열리는 방식 ${hits.length}건\n`);
for (const h of hits) console.error(`   ${h.rel}:${h.line}\n     ${h.why}\n     ${h.text}`);
console.error(`\n여는 함수는 AdminLiveCardPayPopup.tsx 의 openPayster() 를 쓰세요.`);
console.error(`이유는 그 파일 상단 주석에 실측 근거와 함께 적혀 있습니다.`);
process.exit(1);
