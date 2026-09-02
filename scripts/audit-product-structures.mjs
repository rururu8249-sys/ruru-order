// [2026-09-02] 상품등록 재설계 전 — 기존 상품 전수 분석 (읽기 전용, 아무것도 수정 안 함)
// 실행(맥 터미널): cd ~/Desktop/ruru-order-app && node --import ./scripts/_ts-resolve.mjs scripts/audit-product-structures.mjs
import fs from "node:fs";
import path from "node:path";
import { detailProducts, isBrandGroup, parseProductNote } from "../lib/productDetailModel.ts";
import { productThumbArtKey } from "../lib/brandWordmarkThumbnail.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const envText = fs.readFileSync(path.join(repoRoot, ".env.local"), "utf8");
const readEnv = (k) => (envText.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim() || "";
const URL0 = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY");

async function selectAll(pq) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL0}/rest/v1/${pq}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const products = await selectAll("products?select=*");
const stats = { total: products.length, single: 0, brand: 0, combo: 0, priceEmpty: 0, noPhoto: 0, photoCounts: {} };
const badgeCount = {};
const catCount = {};
let detailTotal = 0, detailNoPhoto = 0, detailPriceZero = 0;
const arr = (v) => (Array.isArray(v) ? v : []);

for (const p of products) {
  const note = parseProductNote(p);
  let details = [];
  try { details = detailProducts(p, { includeHidden: true }); } catch { /* 무시 */ }
  const kind = details.length === 0 ? "single" : isBrandGroup(p) ? "brand" : "combo";
  stats[kind]++;
  const price = Number(p.price ?? p.sale_price ?? p.selling_price ?? 0) || 0;
  if (kind === "single" && price <= 0) stats.priceEmpty++;
  const photos = [String(p.image_url || "").trim(), ...arr(p.detail_image_urls), ...arr(p.image_urls), ...arr(p.images)].filter(Boolean);
  const n = new Set(photos).size;
  stats.photoCounts[n > 5 ? "6+" : String(n)] = (stats.photoCounts[n > 5 ? "6+" : String(n)] || 0) + 1;
  if (n === 0 && kind === "single") stats.noPhoto++;
  const badges = arr(p.badge_types).length ? arr(p.badge_types) : (p.badge_type && p.badge_type !== "none" ? [p.badge_type] : []);
  for (const b of badges) badgeCount[String(b)] = (badgeCount[String(b)] || 0) + 1;
  const cat = String(note.category ?? p.category ?? p.product_category ?? "").trim();
  if (cat) catCount[cat] = (catCount[cat] || 0) + 1;
  for (const d of details) {
    detailTotal++;
    if (!d.image) detailNoPhoto++;
    if (!Number(d.price)) detailPriceZero++;
  }
}

console.log("=== 기존 상품 전수 분석 (읽기 전용) ===");
console.log(`전체 상품: ${stats.total} — 단품 ${stats.single} / 브랜드 묶음 ${stats.brand} / 조합형(세부상품) ${stats.combo}`);
console.log(`단품 중 가격 비움(=손님 직접입력): ${stats.priceEmpty} / 사진 0장: ${stats.noPhoto}`);
console.log(`사진 장수 분포: ${Object.entries(stats.photoCounts).sort().map(([k, v]) => `${k}장:${v}`).join("  ")}`);
console.log(`세부상품 총 ${detailTotal}개 — 사진 없음 ${detailNoPhoto} / 가격 0(기본가·직접입력) ${detailPriceZero}`);
console.log(`뱃지 사용: ${Object.entries(badgeCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  ") || "(없음)"}`);
console.log(`카테고리 사용: ${Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  ") || "(없음)"}`);
console.log("\n→ 새 등록 화면 2갈래 매핑: 단품 → 「단품 상품」 / 브랜드 묶음·조합형 → 「세부상품 묶음」 (저장 형식 무변경)");

// ── 4부: 자동 썸네일 그림 미인식 상품명 (기본 쇼핑백으로 빠지는 것들 — 단어 사전 보강용) ──
console.log("\n=== 4부: 자동 썸네일 매핑 점검 (전 상품명 기준) ===");
const artCount = {};
const unknown = [];
for (const p of products) {
  const note = parseProductNote(p);
  const cat = String(note.category ?? p.category ?? p.product_category ?? "").trim();
  const name = String(p.product_name ?? p.name ?? "").trim();
  const key = productThumbArtKey(name, cat);
  artCount[key] = (artCount[key] || 0) + 1;
  if (!key) unknown.push(name);
  let details = [];
  try { details = detailProducts(p, { includeHidden: true }); } catch { /* 무시 */ }
  for (const d of details) {
    const dk = productThumbArtKey(d.detailName, cat);
    if (!dk) unknown.push(`(세부) ${d.detailName}`);
  }
}
console.log(`그림 매칭 분포: ${Object.entries(artCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  ")}`);
const uniq = [...new Set(unknown)];
console.log(`미인식(그림 없이 글자만) ${uniq.length}건 — 최대 40건 표시:`);
for (const n of uniq.slice(0, 40)) console.log("  · " + n);
if (uniq.length > 40) console.log(`  … 외 ${uniq.length - 40}건`);
