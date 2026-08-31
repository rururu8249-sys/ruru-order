// [2026-08-31] 주문 항목 사진 연결 전수조사 — 읽기 전용. 아무것도 수정하지 않습니다.
//
// 실행(맥 터미널):  cd ~/Desktop/ruru-order-app && node --import ./scripts/_ts-resolve.mjs scripts/audit-order-item-photos.mjs
//
// 무엇을 보나
//   주문상세·카드결제 팝업의 사진 매칭 로직을 그대로 재현해서 전체 주문을 분류:
//   - 세부상품 사진 정확 매칭 / 대표사진 폴백(3단 상품인데 매칭 실패 = 엉뚱한 사진 위험)
//   - 코드(MIU-201 같은) 기준으로 다시 매칭하면 살아나는 건 몇 건인지

import fs from "node:fs";
import path from "node:path";
import { detailProducts, detailCode } from "../lib/productDetailModel.ts";
import { resolveOrderItemPhoto } from "../lib/orderItemPhoto.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const envText = fs.readFileSync(path.join(repoRoot, ".env.local"), "utf8");
const readEnv = (key) => (envText.match(new RegExp(`^${key}=(.*)$`, "m")) || [])[1]?.trim() || "";
const URL0 = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!URL0 || !KEY) { console.error(".env.local 키 없음"); process.exit(1); }

async function selectAll(pathAndQuery) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL0}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` },
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const CODE_RE = /^([A-Za-z]+)(?:\([^)]*\))?-(\d+[A-Za-z]*)/;
const hasCode = (s) => CODE_RE.test(String(s || "").trim());

const orders = await selectAll(
  "orders?select=id,order_lookup_code,created_at,youtube_nickname,product_name,color,product_id&product_id=not.is.null&order=created_at.desc"
);
const pids = [...new Set(orders.map((o) => String(o.product_id || "").trim()).filter(Boolean))];
const products = [];
for (let i = 0; i < pids.length; i += 50) {
  products.push(...await selectAll(`products?select=*&id=in.(${pids.slice(i, i + 50).join(",")})`));
}
const byId = new Map(products.map((p) => [String(p.id), p]));

const stats = { total: orders.length, plain: 0, detailHit: 0, fallbackOn3dan: 0, fallbackFixedByCode: 0, noPhoto: 0, prodMissing: 0 };
const suspects = [];

for (const o of orders) {
  const prow = byId.get(String(o.product_id || "").trim());
  if (!prow) { stats.prodMissing++; continue; }
  let details = [];
  try { details = detailProducts(prow, { includeHidden: true }); } catch { /* 무시 */ }
  const itemName = String(o.product_name || "").trim();
  const colorDetail = String(o.color || "").split(" / ")[0].trim();

  if (details.length === 0) { stats.plain++; continue; } // 2단/일반 — 대표사진이 정답

  const hit = details
    .filter((d) => d.detailName && (
      itemName === d.detailName || itemName.startsWith(d.detailName) ||
      (colorDetail !== "" && (colorDetail === d.detailName || colorDetail.startsWith(d.detailName)))
    ))
    .sort((a, b) => b.detailName.length - a.detailName.length)[0];

  if (hit) { stats.detailHit++; continue; }

  // 3단 상품인데 세부상품 매칭 실패 → 현재 코드는 대표사진 폴백(엉뚱한 사진 위험)
  stats.fallbackOn3dan++;
  let codeFix = null;
  if (hasCode(itemName) || hasCode(colorDetail)) {
    const key = hasCode(itemName) ? detailCode(itemName) : detailCode(colorDetail);
    const codeHits = details.filter((d) => hasCode(d.detailName) && detailCode(d.detailName) === key);
    if (codeHits.length === 1) { codeFix = codeHits[0].detailName; stats.fallbackFixedByCode++; }
  }
  suspects.push({
    when: String(o.created_at || "").slice(0, 10),
    no: o.order_lookup_code, nick: o.youtube_nickname,
    item: itemName, color: String(o.color || ""),
    details: details.map((d) => d.detailName).slice(0, 6).join(" | "),
    codeFix: codeFix || "(코드로도 못 찾음)",
  });
}

console.log("=== 주문 항목 사진 연결 전수조사 (읽기 전용) ===");
console.log(`전체 주문행(상품ID 있음): ${stats.total}`);
console.log(`  일반(2단) 상품 — 대표사진이 정답: ${stats.plain}`);
console.log(`  3단 세부상품 사진 정확 매칭: ${stats.detailHit}`);
console.log(`  ⚠️ 3단인데 매칭 실패 → 지금 엉뚱한 대표사진 폴백: ${stats.fallbackOn3dan}`);
console.log(`     └ 코드(MIU-201식) 매칭으로 고치면 살아나는 건: ${stats.fallbackFixedByCode}`);
console.log(`  상품 행 삭제됨(사진 불가): ${stats.prodMissing}`);
console.log("");
console.log("--- ⚠️ 대상 목록 (최근순, 최대 60건 표시) ---");
for (const s of suspects.slice(0, 60)) {
  console.log(`[${s.when}] ${s.no} ${s.nick} | 주문명: ${s.item} | 색상칸: ${s.color}`);
  console.log(`    → 코드매칭 결과: ${s.codeFix}`);
}
if (suspects.length > 60) console.log(`... 외 ${suspects.length - 60}건`);

// ── 2부: 매칭 실패 상품의 실제 등록 정보 (규칙 설계용 원자료) ──
console.log("");
console.log("=== 2부: 매칭 실패한 상품의 실제 등록 데이터 ===");
const failPids = [...new Set(orders
  .filter((o) => {
    const prow = byId.get(String(o.product_id || "").trim());
    if (!prow) return false;
    let details = [];
    try { details = detailProducts(prow, { includeHidden: true }); } catch { return false; }
    if (details.length === 0) return false;
    const itemName = String(o.product_name || "").trim();
    const colorDetail = String(o.color || "").split(" / ")[0].trim();
    return !details.some((d) => d.detailName && (
      itemName === d.detailName || itemName.startsWith(d.detailName) ||
      (colorDetail !== "" && (colorDetail === d.detailName || colorDetail.startsWith(d.detailName)))
    ));
  })
  .map((o) => String(o.product_id)))];
const tail = (u) => { const t = String(u || ""); return t.length > 46 ? "…" + t.slice(-42) : t; };
for (const pid of failPids) {
  const prow = byId.get(pid);
  if (!prow) continue;
  let details = [];
  try { details = detailProducts(prow, { includeHidden: true }); } catch { /* 무시 */ }
  let note = {};
  const rawNote = prow.product_note;
  try { note = rawNote && typeof rawNote === "object" ? rawNote : JSON.parse(String(rawNote || "{}")); } catch { /* 무시 */ }
  const bg = (note && typeof note.brand_group === "object" && note.brand_group) || {};
  console.log(`\n▶ 상품 id=${pid} | 이름: ${prow.product_name || prow.name || "?"}`);
  console.log(`  브랜드그룹 note 키: [${Object.keys(bg).join(", ")}]`);
  const direct = String(prow.image_url || prow.cover_image_url || prow.main_image_url || prow.thumbnail_url || "").trim();
  const arr0 = (v) => (Array.isArray(v) && v.length > 0 ? String(v[0] ?? "") : "");
  console.log(`  직접사진(image_url류): ${tail(direct) || "(없음)"} | 배열첫장: ${tail(arr0(prow.detail_image_urls) || arr0(prow.image_urls) || arr0(prow.images)) || "(없음)"}`);
  for (const d of details) console.log(`  · 세부: "${d.detailName}" | 사진 ${d.images.length}장 ${d.image ? tail(d.image) : "(사진없음)"}`);
  const combos = [...new Set(orders.filter((o) => String(o.product_id) === pid).map((o) => `주문명="${String(o.product_name || "").trim()}" 색상칸="${String(o.color || "").trim()}"`))];
  for (const c of combos) console.log(`  ↳ 주문서 표기: ${c}`);
}

// ── 3부: 새 공용 규칙(lib/orderItemPhoto) 전체 시뮬레이션 ──
console.log("");
console.log("=== 3부: 새 규칙 시뮬레이션 (전체 " + orders.length + "건) ===");
const sim = { directSame: 0, directDiff: 0, detailSame: 0, detailChanged: 0, detailLost: 0, rescued: 0, stillNone: 0 };
const regressions = [];
const rescuedRows = [];
const noneRows = [];
for (const o of orders) {
  const prow = byId.get(String(o.product_id || "").trim());
  if (!prow) continue;
  let details = [];
  try { details = detailProducts(prow, { includeHidden: true }); } catch { details = []; }
  const itemName = String(o.product_name || "").trim();
  const colorDetail = String(o.color || "").split(" / ")[0].trim();
  const oldHit = details
    .filter((d) => d.detailName && (
      itemName === d.detailName || itemName.startsWith(d.detailName) ||
      (colorDetail !== "" && (colorDetail === d.detailName || colorDetail.startsWith(d.detailName)))
    ))
    .sort((a, b) => b.detailName.length - a.detailName.length)[0] || null;
  const r = resolveOrderItemPhoto(prow, { productName: o.product_name, color: o.color });
  const label = `[${String(o.created_at || "").slice(0, 10)}] ${o.order_lookup_code} | ${itemName} | 색상칸: ${String(o.color || "").trim()}`;
  if (details.length === 0) {
    if (r.source === "direct" || r.source === "none") sim.directSame++; else sim.directDiff++;
    continue;
  }
  if (oldHit) {
    if (r.matchedDetailName === oldHit.detailName) sim.detailSame++;
    else if (r.matchedDetailName) { sim.detailChanged++; regressions.push(`${label}\n    기존: ${oldHit.detailName} → 새: ${r.matchedDetailName}`); }
    else { sim.detailLost++; regressions.push(`${label}\n    기존: ${oldHit.detailName} → 새: (사진없음)`); }
  } else {
    if (r.matchedDetailName) { sim.rescued++; rescuedRows.push(`${label}\n    → 새로 연결: ${r.matchedDetailName}`); }
    else { sim.stillNone++; noneRows.push(label); }
  }
}
console.log(`일반(2단) — 대표사진 그대로: ${sim.directSame} (달라짐 ${sim.directDiff}건 — 0이어야 정상)`);
console.log(`3단 기존 정상 매칭 유지: ${sim.detailSame} (❌바뀜 ${sim.detailChanged} / ❌사라짐 ${sim.detailLost} — 둘 다 0이어야 정상)`);
console.log(`3단 매칭 실패였다가 새 규칙으로 살아남: ${sim.rescued}`);
console.log(`3단 여전히 못 찾음 → 이제 엉뚱한 사진 대신 "사진 없음": ${sim.stillNone}`);
if (regressions.length) { console.log("\n❌ 회귀(절대 없어야 함):"); for (const r2 of regressions) console.log("  " + r2); }
if (rescuedRows.length) { console.log("\n✅ 새로 살아난 건:"); for (const r2 of rescuedRows) console.log("  " + r2); }
if (noneRows.length) { console.log("\n⛔ 사진 없음으로 처리되는 건(엉뚱한 사진 방지):"); for (const r2 of noneRows) console.log("  " + r2); }
