#!/usr/bin/env node
/**
 * 관리자 화면 «디자인 기준» 자동 검사 — 2026-09-08 신설
 *
 * 왜 만들었나:
 *   사장님이 화면을 하나하나 눈으로 찾아 지적해야만 결함이 고쳐졌다.
 *   기준(app/globals.css의 .ru-* 주석)을 사람이 지키는지 «말»로 보증하는 대신,
 *   어기면 이 스크립트가 파일:줄 로 잡아낸다. Bankda 가드와 같은 방식.
 *
 * 기준의 출처: Shopify Polaris(@shopify/polaris-tokens) 공개 토큰 실측값.
 *   글씨 11·12·13·14·16·18·20·22·24 / 모서리 4·8·12·16·20·full / 높이 28·32·36·40·48 / 여백 4px 격자
 *
 * 실행:  node scripts/guard-admin-ui.js
 * 통과 = exit 0 / 위반 = exit 1 + 위반 목록
 *
 * ※ 이 검사는 «생김새 기준»만 본다. 돈/입금/정산/배송 로직과 무관하다.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "components", "admin-live");
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".tsx")) files.push(p);
  }
})(ROOT);

const violations = [];
const add = (file, line, rule, text) =>
  violations.push({ file: path.relative(path.join(__dirname, ".."), file), line, rule, text: text.trim().slice(0, 110) });

// 의도적으로 기준 밖인 곳 — 이유를 적고 여기 등록한다(그냥 무시하지 않는다)
const ALLOW = [
  // 캔버스/휠 조각 색: CSS 변수를 해석할 수 없다
  { file: "AdminLiveEventRoulettePanel.tsx", match: "WHEEL_COLORS" },
  // 손님 폰 팝업 뒷배경 흉내 — 관리자 테마와 무관
  { file: "AdminLiveNoticePanel.tsx", match: "bg-slate-900/70" },
  // OBS 방송 위젯 미리보기 — 실제 송출 화면(어두운 배경)을 그대로 보여줘야 한다
  { file: "AdminLiveEventRoulettePanel.tsx", match: "방송 위젯 미리보기" },
];
const allowed = (file, text) =>
  ALLOW.some((a) => file.endsWith(a.file) && text.includes(a.match));

// ── 규칙 1. 원색 팔레트 금지 (다크모드에서 배경에 묻히거나 형광처럼 튄다) ──
const PALETTE = /\b(?:bg|text|border|ring|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink)-\d{2,3}\b/;

// ── 규칙 2. 화면급 고정 높이 금지 (부모가 준 높이를 채워야 한다) ──
//    «화면»만 본다. 아래는 정상이므로 제외한다:
//      · 300px 미만       → 썸네일·글상자·미리보기 (화면이 아니다)
//      · 가로도 같이 고정  → 정사각 썸네일·아이콘 상자
//      · 상한이 걸림       → 모달(100vh·maxHeight·max-h)
//      · min-h            → 최소 높이는 늘어날 수 있으므로 문제 없음
//      · 이미지·비율       → <img>, aspect-*
const BIGH = /(?<!min-)h-\[(\d{3,})px\]|(?<!max)(?:^|[^-\w])height:\s*"(\d{3,})px"/;
const HEIGHT_OK = /100vh|maxHeight|max-h-\[|<img|aspect-|min-h-\[|width:\s*"\d+px"|w-\[\d+px\]/;
const HEIGHT_MIN = 300; // 이보다 작으면 «화면»이 아니다

// ── 규칙 3. 비율(aspect-*)과 고정 높이를 «같이» 걸지 말 것 (둘이 싸워 비율이 깨진다) ──
const ASPECT_CONFLICT = /aspect-\[[^\]]+\]|aspect-video/;

// ── 규칙 4. 두 번째 브랜드색 금지 (주버튼은 로즈 하나) ──
const SECOND_BRAND = /bg-slate-900|bg-black\b(?!\/)/;

// ── 규칙 5. «눌러도 변화 없는» hover 금지 ──
//    hover:bg-X 인데 같은 줄에 bg-X 가 이미 있으면 마우스를 올려도 아무 일이 없다.
//    (설정 저장 버튼이 실제로 이 상태였다 — 사장님이 「반응 없다」고 느낀 원인)
const DEAD_HOVER = /hover:bg-([\w[\]()#,.%/-]+)/;

// ── 규칙 6. 글씨 크기 — Shopify Polaris font-size 스케일만 ──
//    font-size-275~600 = 11·12·13·14·16·18·20·22·24, 큰 숫자용 30·32·36·40
//    (예전엔 제가 임의로 14·16을 «금지»했었다. Polaris는 본문 14, 소제목 16을 쓴다)
const FONT_OK = new Set([11, 12, 13, 14, 16, 18, 20, 22, 24, 30, 32, 36, 40]);
const FONT_PX = /text-\[(\d+(?:\.\d+)?)px\]/g;

// ── 규칙 8. 빈 화면은 «다음에 뭘 하면 되는지»까지 말해야 한다 ──
//    「상품이 없습니다.」로 끝나면 처음 쓰는 사람이 거기서 막힌다.
//    단어 목록으로 판정하면 「바꾸」가 「바꿔보세요」를 못 잡는 식으로 새므로,
//    «없다는 말 뒤에 안내 문장이 실제로 붙어 있는지» 길이로 본다.
const EMPTY_STATE = /(?:text-center|textAlign:\s*"center")/;
const EMPTY_WORD = /없습니다|없어요/;
// 「다 끝났다」는 좋은 소식(🎉·👍)은 다음 할 일이 없으므로 제외
const EMPTY_GOOD = /🎉|👍|✅|다 챙|모두 |없어요!/;
// 그 줄에 «화면에 보이는 글자»를 전부 모아, 「없다」는 말 뒤에 안내가 10글자 이상 있는지 본다.
//   (안내를 형제 <div>에 따로 쓴 경우도 잡아야 하므로 줄 전체의 텍스트를 합친다)
function emptyStateHasHint(raw) {
  const parts = [];
  for (const m of raw.matchAll(/>([^<>{}]+)</g)) parts.push(m[1]);          // JSX 텍스트 노드
  for (const m of raw.matchAll(/"([^"]{2,})"/g)) {                            // 문자열 리터럴
    const t = m[1];
    if (!/[:;{}]|^[a-z-]+$|px|rem|var\(|#[0-9a-f]{3}/i.test(t)) parts.push(t); // CSS 값 제외
  }
  const text = parts.join(" ");
  const i = Math.max(text.lastIndexOf("없습니다"), text.lastIndexOf("없어요"));
  if (i < 0) return true;
  const after = text.slice(i).replace(/없습니다|없어요/g, "").replace(/[.\s·]/g, "");
  return after.length >= 10;
}

// ── 규칙 7. 모서리 — Polaris border-radius 스케일만 (4·8·12·16·20·full) ──
//    rounded-md(6)·3xl(24) 는 스케일에 없다. Tailwind sm=2 md=6 lg=8 xl=12 2xl=16 3xl=24
const RADIUS_BAD = /\brounded-(?:md|3xl)\b/;

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const t = raw.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("{/*") || t.startsWith("/*")) return; // 주석 제외
    if (allowed(file, raw)) return;

    const m1 = raw.match(PALETTE);
    if (m1) add(file, line, "원색 팔레트 금지 → 토큰 사용", m1[0] + "  ⟵ " + raw);

    const mh = raw.match(BIGH);
    if (mh && !HEIGHT_OK.test(raw)) {
      const px = Number(mh[1] || mh[2] || 0);
      if (px >= HEIGHT_MIN) add(file, line, "화면급 고정 높이 금지 → flex-1/h-full", raw);
    }
    if (ASPECT_CONFLICT.test(raw) && /(?<!min-)h-\[\d+px\]|h-full/.test(raw)) {
      add(file, line, "비율(aspect)과 높이를 같이 걸면 비율이 깨진다", raw);
    }
    const m4 = raw.match(SECOND_BRAND);
    if (m4) add(file, line, "두 번째 브랜드색 금지 (주버튼은 로즈)", m4[0] + "  ⟵ " + raw);

    const mh2 = raw.match(DEAD_HOVER);
    if (mh2) {
      const bg = mh2[1];
      // 같은 줄에 bg-<같은값> 이 이미 있으면 hover가 죽어 있다
      const re = new RegExp("(?<!hover:)\\bbg-" + bg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
      if (re.test(raw)) add(file, line, "눌러도 변화 없는 hover (배경과 같은 색)", `hover:bg-${bg}`);
    }

    for (const m of raw.matchAll(FONT_PX)) {
      const px = Number(m[1]);
      if (!FONT_OK.has(px)) add(file, line, "글씨 크기 5단계 밖 (11/12/13/15/20)", `text-[${m[1]}px]`);
    }

    const mr = raw.match(RADIUS_BAD);
    if (mr) add(file, line, "모서리 3종 밖 (카드 2xl · 버튼 xl · 칩 full)", mr[0] + "  ⟵ " + raw);

    if (EMPTY_STATE.test(raw) && EMPTY_WORD.test(raw) && !EMPTY_GOOD.test(raw) && !emptyStateHasHint(raw)) {
      add(file, line, "빈 화면에 «다음에 할 일» 안내 없음", raw);
    }
  });
}

if (violations.length === 0) {
  console.log(`✅ 관리자 UI 기준 통과 — 검사 파일 ${files.length}개, 위반 0건`);
  process.exit(0);
}
const byRule = {};
for (const v of violations) (byRule[v.rule] ||= []).push(v);
console.error(`❌ 관리자 UI 기준 위반 ${violations.length}건 (검사 파일 ${files.length}개)\n`);
for (const [rule, list] of Object.entries(byRule)) {
  console.error(`【${rule}】 ${list.length}건`);
  for (const v of list.slice(0, 20)) console.error(`   ${v.file}:${v.line}  ${v.text}`);
  if (list.length > 20) console.error(`   … 외 ${list.length - 20}건`);
  console.error("");
}
console.error("기준: app/globals.css 「관리자 디자인 기준」 주석 참고");
console.error("의도적 예외는 scripts/guard-admin-ui.js 의 ALLOW 에 이유와 함께 등록할 것");
process.exit(1);
