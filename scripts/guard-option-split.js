#!/usr/bin/env node
/**
 * 옵션 구분 규칙 안전가드 — 2026-09-08 신설
 *
 * 사장님 지침: 「쉼표만 옵션 구분이야. / ~ 다른 게 들어가면 구분되게 하면 안 돼」
 *   사이즈 「XS/S」는 «한 묶음 사이즈»의 이름이지 두 개가 아니다.
 *
 * 왜 필요한가:
 *   이 규칙이 예전엔 8곳에 «각자» 적혀 있었다(관리자 상품등록·상품관리·손님 주문서·
 *   방송 위젯·채팅공지·등록상품 고르기…). 한 곳만 고치면 관리자에서 저장한 옵션이
 *   손님 화면에서 다르게 쪼개진다 — 실제로 그 사고가 났다.
 *   이제 lib/optionSplit.ts 한 곳에서만 정하고, 다른 곳에 다시 생기면 여기서 잡는다.
 *
 * 실행: node scripts/guard-option-split.js   (npm run guard 에 포함)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCAN = ["app", "components", "lib"];
// 옵션을 나누는 split 인데 쉼표·줄바꿈 말고 다른 문자가 들어간 것
const BAD_SPLIT = /\.split\(\s*\/\[[^\]]*[/|·][^\]]*\][^)]*\)/;

// 옵션이 «아닌» 것을 나누는 곳은 정상 — 이유와 함께 등록한다
const ALLOW = [
  // 엑셀 배지 칸(NEW/HOT/해외배송)은 「/」로 나누는 게 자연스럽다. 옵션이 아니다.
  { file: "lib/excelBulkParse.ts", near: "parseOfficialBadges" },
];

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
SCAN.forEach((d) => walk(path.join(ROOT, d)));

const hits = [];
for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (!SCAN.some((d) => rel.startsWith(d + path.sep))) continue;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((raw, i) => {
    if (!BAD_SPLIT.test(raw)) return;
    // 앞뒤 12줄 안에 허용 사유가 있으면 통과
    const ctx = lines.slice(Math.max(0, i - 12), i + 3).join("\n");
    if (ALLOW.some((a) => rel === a.file && ctx.includes(a.near))) return;
    hits.push({ rel, line: i + 1, text: raw.trim().slice(0, 120) });
  });
}

if (hits.length === 0) {
  console.log(`✅ 옵션 구분 규칙 통과 — 쉼표(와 줄바꿈)만 구분자, / | · 는 이름의 일부`);
  process.exit(0);
}
console.error(`❌ 옵션을 / | · 로 나누는 코드 ${hits.length}건 — 「XS/S」가 두 개로 갈라집니다\n`);
for (const h of hits) console.error(`   ${h.rel}:${h.line}  ${h.text}`);
console.error(`\n옵션을 나눌 땐 lib/optionSplit.ts 의 splitOptionText / toOptionList 를 쓰세요.`);
console.error(`옵션이 아닌 값을 나누는 거라면 scripts/guard-option-split.js 의 ALLOW 에 이유와 함께 등록하세요.`);
process.exit(1);
