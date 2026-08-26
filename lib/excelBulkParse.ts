// lib/excelBulkParse.ts
// [2026-08-20] 엑셀 대량등록 — "형식이 매번 달라도" 읽어내기 위한 순수 로직.
//   UI(팝업)와 분리한 이유: 형식별 시뮬레이션 검수를 코드로 돌릴 수 있게 하려고.
//   ⚠️ 여기는 계산만 한다. 저장·주문·재고차감·입금·정산 로직과 무관.

export type SheetCell = string | number | null;
export type BulkLayout = "row" | "block" | "variant";

export type BulkConfig = {
  headerRow: number;   // 1-base (0 = 헤더 없음)
  layout: BulkLayout;  // row: 한 줄=한 상품 / block: 여러 줄=한 상품 / variant: 한 줄=한 옵션
  blockSize: number;
  colName: number;     // 0-base, -1 = 없음
  colPrice: number;
  colColor: number;
  colCode: number;
  colSize: number;     // 사이즈 "값"이 들어있는 열 (variant형)
  colQty: number;      // 수량 열
  sizeCols: number[];  // 헤더 자체가 사이즈인 열들 (230, 240, S, M, L …)
};

export type DraftCore = {
  row: number;                      // 1-base 시작행
  name: string;
  price: number;
  code: string;
  colors: string[];
  sizes: string[];
  stocks: Record<string, number>;   // "색상|사이즈" → 수량 (색상/사이즈 없으면 빈 문자열)
  warns: string[];
  // ── 정규양식에서만 채워지는 선택 필드 ──
  //   details: 세부상품(하위상세) 축 — DB 저장 시 color 칸에 "세부 / 색상"으로 합쳐지는 기존 규칙 그대로 사용
  details?: string[];
  detailPlus?: Record<string, number>;   // 세부상품명 → 추가금(원)
  detailRows?: Record<string, number[]>; // 세부상품명 → 사진이 놓인 엑셀 행(1-base)
  detailCategories?: Record<string, string>;
  detailOptions?: Record<string, { colors: string[]; sizes: string[]; variants: Array<{ color: string; size: string }> }>;
  brandKo?: string;
  brandEn?: string;
  brandGroup?: boolean;
  stockManagementEnabled?: boolean;
  badges?: string[];                     // 줄에 직접 쓴 배지 (없으면 화면의 전체 적용 값 사용)
  category?: string;
  shipping?: "normal" | "vendor";
  place?: "shop" | "hidden";
  isExample?: boolean;                   // (예시) 줄 — 등록 대상에서 자동 제외
};

export const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

export const num = (v: unknown) => {
  const raw = String(v ?? "");
  if (!raw.trim()) return 0;
  const n = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// ── 헤더 글자 → 열 역할 ──
// 순서 중요: "상품이미지"가 name으로 먹히지 않도록 image/code/price… 를 먼저 본다.
const ROLE_KEYS: [string, string[]][] = [
  ["image", ["이미지", "사진", "image", "photo", "썸네일"]],
  ["code", ["모델번호", "모델", "품번", "제품번호", "코드", "sku", "style", "바코드"]],
  ["price", ["세일가", "판매가", "소비자가", "공급가", "단가", "가격", "금액", "price", "won"]],
  ["color", ["컬러", "색상", "color", "색깔", "색"]],
  ["sizecol", ["사이즈", "싸이즈", "사이스", "size", "치수", "호수", "규격"]],
  ["total", ["합계", "총수량", "총계", "total", "소계"]],
  ["qty", ["수량", "재고", "잔량", "입고", "발주", "qty", "stock", "ea", "pcs", "족", "개수"]],
  ["name", ["품명", "상품명", "제품명", "품목", "상품", "제품", "name", "product", "item"]],
];

export function guessRole(header: string): string {
  const h = norm(header).toLowerCase();
  if (!h) return "";
  for (const [role, keys] of ROLE_KEYS) {
    if (keys.some((k) => h.includes(k))) return role;
  }
  return isSizeLabel(h) ? "size" : "";
}

// 사이즈처럼 보이는 "값" (헤더 칸이든 셀 값이든)
export function isSizeLabel(v: unknown): boolean {
  const h = norm(v).toLowerCase();
  if (!h) return false;
  if (/^(x{0,3}[sml]|free|onesize|one size|jr|js)$/i.test(h)) return true;
  // 230 / 230mm / 230 mm / 230호 / 95(L) / 26인치
  const m = h.match(/^(\d{2,3})\s*(mm|호|인치|cm)?(\s*\(.+\))?$/);
  if (m) {
    const n = Number(m[1]);
    return (n >= 150 && n <= 330) || (n >= 33 && n <= 130);
  }
  return false;
}

// ── 구조 자동 추측 ──
export function autoGuessConfig(rows: SheetCell[][]): BulkConfig {
  const scan = Math.min(12, rows.length);
  // 헤더행: 인식되는 역할이 가장 많은 행 (동점이면 글자 많은 행, 그래도 동점이면 위쪽)
  let headerRow = 0;
  let bestScore = -1;
  let bestRoleHits = 0;
  for (let r = 0; r < scan; r += 1) {
    const cells = (rows[r] || []).map((c) => norm(c));
    let roleHits = 0;
    let textCells = 0;
    for (const c of cells) {
      if (!c) continue;
      if (Number.isNaN(Number(c))) textCells += 1;
      const role = guessRole(c);
      if (role && role !== "size") roleHits += 1;
      else if (role === "size") roleHits += 0.5;
    }
    const score = roleHits * 3 + textCells * 0.2;
    if (score > bestScore) { bestScore = score; headerRow = r + 1; bestRoleHits = roleHits; }
  }
  // 인식되는 머리글이 하나도 없으면 = 헤더가 아예 없는 파일 (첫 줄부터 상품)
  if (bestRoleHits < 1) headerRow = 0;

  const hs = headerRow > 0 ? (rows[headerRow - 1] || []).map((c) => norm(c)) : [];
  let colName = -1, colPrice = -1, colColor = -1, colCode = -1, colSize = -1, colQty = -1;
  const sizeCols: number[] = [];
  hs.forEach((h, i) => {
    const role = guessRole(h);
    if (role === "name" && colName < 0) colName = i;
    else if (role === "price" && colPrice < 0) colPrice = i;
    else if (role === "color" && colColor < 0) colColor = i;
    else if (role === "code" && colCode < 0) colCode = i;
    else if (role === "sizecol" && colSize < 0) colSize = i;
    else if (role === "qty" && colQty < 0) colQty = i;
    else if (role === "size") sizeCols.push(i);
  });

  // A열 번호매김 간격으로 "여러 줄 = 한 상품" 판별
  const numbered: number[] = [];
  rows.forEach((r, i) => { if (/^\d{1,3}$/.test(norm((r || [])[0]))) numbered.push(i); });
  let layout: BulkLayout = "row";
  let blockSize = 1;
  if (numbered.length >= 2) {
    const gaps = numbered.slice(1).map((v, k) => v - numbered[k]);
    const cnt: Record<number, number> = {};
    for (const g of gaps) cnt[g] = (cnt[g] || 0) + 1;
    const top = Number(Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]);
    if (top >= 2 && top <= 12) { layout = "block"; blockSize = top; }
  }

  // 헤더에 사이즈 열이 없고, 사이즈 "값" 열 + 수량 열이 있으면 → 한 줄 = 한 옵션(variant)
  if (sizeCols.length === 0 && colSize >= 0 && colQty >= 0) {
    layout = "variant";
    blockSize = 1;
  }

  // 블록형인데 헤더에 사이즈가 없으면: 상품 첫 줄의 "셀 값"이 사이즈인 형태
  if (layout === "block" && sizeCols.length === 0) {
    const r0 = numbered[0] ?? headerRow;
    (rows[r0] || []).forEach((c, i) => { if (isSizeLabel(c)) sizeCols.push(i); });
  }

  // 상품명 열을 못 찾았으면: 헤더 아래에서 글자가 가장 많이 들어있는 열
  if (colName < 0) {
    const from = headerRow > 0 ? headerRow : 0;
    const score: Record<number, number> = {};
    for (let r = from; r < rows.length; r += 1) {
      (rows[r] || []).forEach((c, i) => {
        const v = norm(c);
        if (!v || !Number.isNaN(Number(v)) || isSizeLabel(v)) return;
        if (i === colColor || i === colCode || i === colSize) return;
        score[i] = (score[i] || 0) + Math.min(v.length, 20);
      });
    }
    const top = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
    colName = top ? Number(top[0]) : 1;
  }

  return { headerRow, layout, blockSize, colName, colPrice, colColor, colCode, colSize, colQty, sizeCols };
}

// ── 미리보기 행 만들기 ──
export function buildDraftCores(rows: SheetCell[][], c: BulkConfig, consumedOut?: Set<string>): DraftCore[] {
  const mark = (r1: number, c0: number) => { consumedOut?.add(`${r1}|${c0}`); };
  const list: DraftCore[] = [];
  const headerCells = c.headerRow > 0 ? (rows[c.headerRow - 1] || []) : [];
  const firstDataRow = c.headerRow > 0 ? c.headerRow : 0; // 0-base 기준 시작 위치

  const sizeLabelsFor = (rowIdx0: number) => {
    const sizes: string[] = [];
    const colOf: Record<string, number> = {};
    for (const ci of c.sizeCols) {
      const fromHeader = norm(headerCells[ci]);
      const fromRow = norm((rows[rowIdx0] || [])[ci]);
      const label = isSizeLabel(fromRow) ? fromRow : (isSizeLabel(fromHeader) || fromHeader ? fromHeader : "");
      if (label && !(label in colOf)) { sizes.push(label); colOf[label] = ci; }
    }
    return { sizes, colOf };
  };

  if (c.layout === "variant") {
    // 한 줄 = 한 옵션. 상품명이 같거나 비어있으면(병합셀) 같은 상품으로 묶는다.
    let cur: DraftCore | null = null;
    let lastName = "";
    for (let r = firstDataRow; r < rows.length; r += 1) {
      const row = rows[r] || [];
      const rawName = norm(row[c.colName]);
      const size = c.colSize >= 0 ? norm(row[c.colSize]) : "";
      const qty = c.colQty >= 0 ? num(row[c.colQty]) : 0;
      const color = c.colColor >= 0 ? norm(row[c.colColor]) : "";
      if (!rawName && !size && !color) continue;
      const name = rawName || lastName;
      if (!name) continue;
      mark(r + 1, c.colName);
      if (c.colPrice >= 0) mark(r + 1, c.colPrice);
      if (c.colCode >= 0) mark(r + 1, c.colCode);
      if (c.colColor >= 0) mark(r + 1, c.colColor);
      if (c.colSize >= 0) mark(r + 1, c.colSize);
      if (!cur || name !== cur.name) {
        cur = {
          row: r + 1, name, price: c.colPrice >= 0 ? num(row[c.colPrice]) : 0,
          code: c.colCode >= 0 ? norm(row[c.colCode]) : "",
          colors: [], sizes: [], stocks: {}, warns: [],
        };
        list.push(cur);
      }
      if (!cur.price && c.colPrice >= 0) cur.price = num(row[c.colPrice]);
      if (!cur.code && c.colCode >= 0) cur.code = norm(row[c.colCode]);
      if (color && !cur.colors.includes(color)) cur.colors.push(color);
      if (size && !cur.sizes.includes(size)) cur.sizes.push(size);
      if (qty > 0) cur.stocks[`${color}|${size}`] = (cur.stocks[`${color}|${size}`] || 0) + qty;
      if (c.colQty >= 0) mark(r + 1, c.colQty);
      lastName = name;
    }
  } else {
    const startRows: number[] = [];
    if (c.layout === "block") {
      rows.forEach((r, i) => { if (/^\d{1,3}$/.test(norm((r || [])[0]))) startRows.push(i + 1); });
      if (startRows.length === 0) {
        for (let r = firstDataRow + 1; r <= rows.length; r += c.blockSize) startRows.push(r);
      }
    } else {
      for (let r = firstDataRow + 1; r <= rows.length; r += 1) {
        if (norm((rows[r - 1] || [])[c.colName])) startRows.push(r);
      }
    }

    for (const r of startRows) {
      const row = rows[r - 1] || [];
      const name = norm(row[c.colName]);
      if (!name) continue;
      if (c.headerRow > 0 && r === c.headerRow) continue;
      mark(r, c.colName);
      if (c.colPrice >= 0) mark(r, c.colPrice);
      if (c.colCode >= 0) mark(r, c.colCode);
      const { sizes, colOf } = sizeLabelsFor(r - 1);
      const colors: string[] = [];
      const stocks: Record<string, number> = {};

      if (c.layout === "block") {
        for (let k = 0; k < c.blockSize; k += 1) {
          const rr = rows[r - 1 + k] || [];
          if (c.colColor >= 0) mark(r + k, c.colColor);
          const color = c.colColor >= 0 ? norm(rr[c.colColor]) : "";
          if (!color) continue;
          if (!colors.includes(color)) colors.push(color);
          for (const sz of sizes) {
            const cell = rr[colOf[sz]];
            mark(r + k, colOf[sz]);
            if (isSizeLabel(cell) && norm(cell) === sz) continue; // 사이즈 라벨 줄은 수량 아님
            const q = num(cell);
            if (q > 0) stocks[`${color}|${sz}`] = q;
          }
        }
        if (colors.length === 0) {
          for (let k = 0; k < c.blockSize; k += 1) {
            const rr = rows[r - 1 + k] || [];
            for (const sz of sizes) {
              const cell = rr[colOf[sz]];
              mark(r + k, colOf[sz]);
              if (isSizeLabel(cell) && norm(cell) === sz) continue;
              const q = num(cell);
              if (q > 0) stocks[`|${sz}`] = (stocks[`|${sz}`] || 0) + q;
            }
          }
        }
      } else {
        if (c.colColor >= 0) mark(r, c.colColor);
        const color = c.colColor >= 0 ? norm(row[c.colColor]) : "";
        if (color) colors.push(color);
        for (const sz of sizes) {
          const q = num(row[colOf[sz]]);
          mark(r, colOf[sz]);
          if (q > 0) stocks[`${color}|${sz}`] = q;
        }
        if (sizes.length === 0 && c.colQty >= 0) {
          const q = num(row[c.colQty]);
          mark(r, c.colQty);
          if (q > 0) stocks[`${color}|`] = q;
        }
      }

      list.push({
        row: r, name,
        price: c.colPrice >= 0 ? num(row[c.colPrice]) : 0,
        code: c.colCode >= 0 ? norm(row[c.colCode]) : "",
        colors, sizes, stocks, warns: [],
      });
    }
  }

  // 경고 (사진 없음은 팝업에서 이미지 붙인 뒤 판단)
  const seen: Record<string, number> = {};
  for (const d of list) seen[d.name] = (seen[d.name] || 0) + 1;
  for (const d of list) {
    if (!d.price) d.warns.push("가격 없음");
    if (d.sizes.length === 0 && Object.keys(d.stocks).length === 0) d.warns.push("사이즈 없음");
    if (totalStock(d) === 0) d.warns.push("재고 0");
    if (seen[d.name] > 1) d.warns.push("이름 중복");
  }
  return list;
}

export function totalStock(d: DraftCore): number {
  return Object.values(d.stocks).reduce((a, b) => a + b, 0);
}

// ── 자동 대조(검수) 리포트 ──
//   원본 셀을 다시 훑어서 "인식 결과와 원본이 다른 부분"만 집어낸다.
//   1) 합계/총수량 열이 있으면: 상품별 엑셀 합계 vs 읽어낸 재고 합계 대조
//   2) 사이즈 칸에 숫자가 있는데 어느 상품에도 안 들어간 셀 (예: 색상 칸이 빈 줄)
//   3) 엑셀 A열 번호 개수 vs 인식된 상품 수
export type AuditIssue = { where: string; value: string; note: string };
export type AuditReport = {
  productCount: number;
  numberedCount: number;   // A열 번호 개수 (0이면 번호 없음)
  stockSum: number;
  totalColFound: boolean;
  totalMatch: number;      // 합계열 대조 일치 상품 수
  totalMismatches: { name: string; row: number; excel: number; parsed: number }[];
  missed: AuditIssue[];       // 어느 상품에도 반영 안 된 "수량스러운" 숫자 (열 단위 묶음)
  unreadOtherCount: number;   // 안 읽힌 그 외 숫자(원가·날짜 등일 수 있음) 개수
};

function cellRef(r1: number, c0: number) {
  let n = c0, s = "";
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return `${s}${r1}`;
}

export function auditDraftCores(rows: SheetCell[][], c: BulkConfig, drafts: DraftCore[]): AuditReport {
  const consumed = new Set<string>();
  buildDraftCores(rows, c, consumed); // 같은 설정으로 다시 읽으며 "읽은 셀" 좌표 수집

  // A열 번호 개수
  let numberedCount = 0;
  rows.forEach((r) => { if (/^\d{1,3}$/.test(norm((r || [])[0]))) numberedCount += 1; });

  const stockSum = drafts.reduce((a, d) => a + totalStock(d), 0);

  // 합계/총수량 열 찾기 (헤더에서)
  const headerCells = c.headerRow > 0 ? (rows[c.headerRow - 1] || []) : [];
  let totalCol = -1;
  headerCells.forEach((h, i) => { if (totalCol < 0 && guessRole(norm(h)) === "total") totalCol = i; });

  const totalMismatches: AuditReport["totalMismatches"] = [];
  let totalMatch = 0;
  if (totalCol >= 0) {
    const span = c.layout === "block" ? c.blockSize : 1;
    for (const d of drafts) {
      let excelTotal = 0;
      for (let k = 0; k < span; k += 1) {
        excelTotal += num((rows[d.row - 1 + k] || [])[totalCol]);
      }
      if (excelTotal > 0) {
        if (excelTotal === totalStock(d)) totalMatch += 1;
        else totalMismatches.push({ name: d.name, row: d.row, excel: excelTotal, parsed: totalStock(d) });
      }
    }
  }

  // ★ 전수 커버리지 검사 — 인식 결과와 무관하게 엑셀의 "모든" 숫자 칸을 훑는다.
  //   인식기가 열 하나를 통째로 놓쳐도, 그 열의 숫자들은 "안 읽힌 칸"으로 반드시 걸린다.
  //   - 수량으로 보이는 정수(1~999)가 안 읽혔으면 → 빨간 경고 (열 단위로 묶어서)
  //   - 그 외 숫자(1000 이상: 원가·날짜 등일 수 있음)는 개수만 알려줌
  const firstDataRow0 = c.headerRow > 0 ? c.headerRow : 0; // 0-base
  const missedByCol: Record<number, { count: number; examples: string[] }> = {};
  let unreadOtherCount = 0;
  const width = rows.reduce((m, r) => Math.max(m, (r || []).length), 0);
  for (let r0 = firstDataRow0; r0 < rows.length; r0 += 1) {
    const row = rows[r0] || [];
    for (let ci = 0; ci < width; ci += 1) {
      if (consumed.has(`${r0 + 1}|${ci}`)) continue;
      if (ci === totalCol) continue;                                   // 합계열은 위에서 별도 대조
      const v = row[ci];
      if (v == null || norm(v) === "") continue;
      const t = norm(v);
      if (Number.isNaN(Number(t.replace(/[^0-9.-]/g, ""))) || !/\d/.test(t)) continue;
      if (ci === 0 && /^\d{1,3}$/.test(t) && numberedCount > 0) continue; // A열 번호
      if (isSizeLabel(t)) continue;                                    // 사이즈 라벨 값
      const q = num(t);
      if (q <= 0) continue;
      if (Number.isInteger(q) && q < 1000) {
        const g = missedByCol[ci] || (missedByCol[ci] = { count: 0, examples: [] });
        g.count += 1;
        if (g.examples.length < 3) g.examples.push(`${cellRef(r0 + 1, ci)}=${q}`);
      } else {
        unreadOtherCount += 1;
      }
    }
  }
  const missed: AuditIssue[] = Object.entries(missedByCol).map(([ci, g]) => ({
    where: `${cellRef(0, Number(ci)).replace(/\d+$/, "")}열`,
    value: `${g.count}칸 (${g.examples.join(", ")}${g.count > 3 ? " …" : ""})`,
    note: "수량으로 보이는 숫자가 어느 상품에도 안 들어감",
  }));

  return {
    productCount: drafts.length,
    numberedCount,
    stockSum,
    totalColFound: totalCol >= 0,
    totalMatch,
    totalMismatches,
    missed,
    unreadOtherCount,
  };
}

// ═══════════════════════════════════════════════════════════
// 루루동이 정규양식 — 우리 양식이면 추측 없이 100% 그대로 읽는다
//   양식: public/excel-templates/ruru_form_v1.xlsx (1행 서명, 헤더행에 고정 라벨)
//   열 순서가 바뀌어도 라벨 이름으로 찾으므로 동작한다.
// ═══════════════════════════════════════════════════════════

export const OFFICIAL_SIGNATURE = "루루동이 정규양식";

// 헤더행(1-base)을 돌려준다. 0 = 정규양식 아님, -1 = 서명은 있는데 헤더가 훼손됨
export function detectOfficialForm(rows: SheetCell[][]): number {
  for (let r = 0; r < Math.min(8, rows.length); r += 1) {
    const hs = (rows[r] || []).map((c) => norm(c));
    if (hs.includes("상품명") && hs.includes("수량") && hs.includes("판매가") && hs.includes("세부상품명")) {
      return r + 1;
    }
  }
  const signed = rows.slice(0, 6).some((r) => (r || []).some((c) => norm(c).includes(OFFICIAL_SIGNATURE)));
  return signed ? -1 : 0;
}

// 배지 글자 → 저장값 (엑셀엔 사람 말로 쓰게 하고 여기서 변환)
const OFFICIAL_BADGES: [string, string[]][] = [
  ["new", ["new", "신상", "뉴", "✨"]],
  ["hot", ["hot", "인기", "핫", "🔥"]],
  ["limit", ["한정", "리밋", "⏰"]],
  ["pick", ["md픽", "엠디픽", "md", "픽", "⭐"]],
  ["direct", ["바로구매", "바로", "🛒"]],
  ["overseas", ["해외배송", "해외", "✈"]],
];

function parseOfficialBadges(cellText: string, warns: string[]): string[] {
  const out: string[] = [];
  for (const raw of cellText.split(/[,·/]+/)) {
    const token = norm(raw).toLowerCase();
    if (!token) continue;
    const hit = OFFICIAL_BADGES.find(([, keys]) => keys.some((k) => token.includes(k)));
    if (hit) { if (!out.includes(hit[0])) out.push(hit[0]); }
    else warns.push(`배지 「${norm(raw)}」는 없는 배지예요 (NEW/HOT/한정/MD픽/바로구매/해외배송)`);
  }
  return out;
}

export type OfficialParseResult = { drafts: DraftCore[]; issues: AuditIssue[] };

export function parseOfficialForm(rows: SheetCell[][], headerRow: number): OfficialParseResult {
  const hs = (rows[headerRow - 1] || []).map((c) => norm(c));
  const col = (label: string) => hs.indexOf(label);
  const cName = col("상품명"), cColor = col("색상"), cSize = col("사이즈"), cQty = col("수량"),
    cPrice = col("판매가"), cDetail = col("세부상품명"), cPlus = col("세부추가금"),
    cBadge = col("배지"), cCat = col("카테고리"), cShip = col("배송"), cPlace = col("진열"), cCode = col("모델번호"),
    cBrandKo = col("브랜드한글"), cBrandEn = col("브랜드영문"), cDetailCat = col("상품구분"), cStockManage = col("재고관리");

  const drafts: DraftCore[] = [];
  const issues: AuditIssue[] = [];
  let cur: DraftCore | null = null;

  const cellRefLocal = (r1: number, c0: number) => {
    let n = c0, str = "";
    do { str = String.fromCharCode(65 + (n % 26)) + str; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return `${str}${r1}`;
  };

  for (let r0 = headerRow; r0 < rows.length; r0 += 1) {
    const row = rows[r0] || [];
    const get = (ci: number) => (ci >= 0 ? norm(row[ci]) : "");
    const name = get(cName), color = get(cColor), size = get(cSize), detail = get(cDetail);
    const qtyText = get(cQty);
    const qty = qtyText ? Math.max(0, Math.floor(num(row[cQty]))) : 0;

    // 완전히 빈 줄은 통과
    if (!name && !color && !size && !detail && !qtyText) continue;

    if (name) {
      cur = {
        row: r0 + 1, name,
        price: cPrice >= 0 ? num(row[cPrice]) : 0,
        code: get(cCode),
        colors: [], sizes: [], stocks: {}, warns: [],
        details: [], detailPlus: {}, detailRows: {}, detailCategories: {}, detailOptions: {},
        isExample: /^\s*[\(（]\s*예\s*시\s*[\)）]/.test(name),
      };
      const badgeText = get(cBadge);
      if (badgeText) cur.badges = parseOfficialBadges(badgeText, cur.warns);
      const cat = get(cCat);
      if (cat) cur.category = cat;
      const ship = get(cShip);
      if (ship) cur.shipping = ship.includes("업체") ? "vendor" : "normal";
      const place = get(cPlace);
      if (place) cur.place = place.includes("숨") ? "hidden" : "shop";
      const brandKo = get(cBrandKo), brandEn = get(cBrandEn);
      if (brandKo || brandEn) {
        cur.brandKo = brandKo || name;
        cur.brandEn = brandEn;
        cur.brandGroup = true;
      }
      const stockManage = get(cStockManage).toLowerCase();
      if (stockManage) {
        const explicitlyOff = ["사용 안 함", "사용안함", "미사용", "관리 안 함", "관리안함", "off", "no", "false", "0"]
          .some((token) => stockManage.includes(token));
        cur.stockManagementEnabled = explicitlyOff
          ? false
          : ["y", "yes", "on", "사용", "관리", "true", "1"].some((token) => stockManage.includes(token));
      }
      drafts.push(cur);
    } else if (!cur) {
      // 상품명 없이 시작된 고아 줄 — 숫자가 있으면 반드시 알린다 (조용히 버리지 않음)
      if (qty > 0) issues.push({ where: cellRefLocal(r0 + 1, cQty), value: String(qty), note: "위에 상품명이 없는 줄의 수량 — 등록에서 빠졌어요" });
      continue;
    }

    // 옵션 줄 공통 처리 (상품 첫 줄 포함)
    if (detail) {
      if (detail.includes("/")) cur.warns.push(`세부상품명 「${detail}」에 / 는 쓸 수 없어요`);
      if (!cur.details!.includes(detail)) cur.details!.push(detail);
      if (!cur.detailRows![detail]) cur.detailRows![detail] = [];
      cur.detailRows![detail].push(r0 + 1);
      const detailCategory = get(cDetailCat);
      if (detailCategory) cur.detailCategories![detail] = detailCategory;
      const option = cur.detailOptions![detail] || (cur.detailOptions![detail] = { colors: [], sizes: [], variants: [] });
      const normalizedColor = color || "없음";
      const normalizedSize = size || "없음";
      if (!option.colors.includes(normalizedColor)) option.colors.push(normalizedColor);
      if (!option.sizes.includes(normalizedSize)) option.sizes.push(normalizedSize);
      if (!option.variants.some((variant) => variant.color === normalizedColor && variant.size === normalizedSize)) {
        option.variants.push({ color: normalizedColor, size: normalizedSize });
      }
      if (cPlus >= 0 && norm(row[cPlus])) cur.detailPlus![detail] = Math.max(0, Math.floor(num(row[cPlus])));
      else if (!(detail in cur.detailPlus!)) cur.detailPlus![detail] = 0;
    }
    if (color) {
      if (color.includes("/")) cur.warns.push(`색상 「${color}」에 / 는 쓸 수 없어요`);
      if (!cur.colors.includes(color)) cur.colors.push(color);
    }
    if (size && !cur.sizes.includes(size)) cur.sizes.push(size);

    // 재고 키: DB 규칙 그대로 — 세부+색상이면 "세부 / 색상", 아니면 세부 또는 색상
    const colorSlot = detail && color ? `${detail} / ${color}` : (detail || color);
    const key = `${colorSlot}|${size}`;
    if (colorSlot || size || qtyText) {
      cur.stocks[key] = (cur.stocks[key] || 0) + qty;
    }
    // 가격·모델번호를 첫 줄에 안 쓰고 아래 줄에 썼어도 받아준다
    if (!cur.price && cPrice >= 0 && num(row[cPrice]) > 0) cur.price = num(row[cPrice]);
    if (!cur.code && get(cCode)) cur.code = get(cCode);
  }

  // 경고
  const seen: Record<string, number> = {};
  for (const d of drafts) seen[d.name] = (seen[d.name] || 0) + 1;
  for (const d of drafts) {
    if (d.isExample) { d.warns.unshift("(예시) 줄 — 등록 대상에서 자동 제외"); continue; }
    if (!d.price) d.warns.push("가격 없음");
    if (totalStock(d) === 0 && d.stockManagementEnabled !== false) d.warns.push("재고 0 (품절로 등록됨)");
    if (seen[d.name] > 1) d.warns.push("이름 중복");
  }
  return { drafts, issues };
}
