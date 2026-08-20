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
  ["qty", ["수량", "재고", "잔량", "입고", "발주", "qty", "stock", "ea", "pcs", "족", "개수"]],
  ["total", ["합계", "총수량", "총계", "total", "소계"]],
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
export function buildDraftCores(rows: SheetCell[][], c: BulkConfig): DraftCore[] {
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
      const { sizes, colOf } = sizeLabelsFor(r - 1);
      const colors: string[] = [];
      const stocks: Record<string, number> = {};

      if (c.layout === "block") {
        for (let k = 0; k < c.blockSize; k += 1) {
          const rr = rows[r - 1 + k] || [];
          const color = c.colColor >= 0 ? norm(rr[c.colColor]) : "";
          if (!color) continue;
          if (!colors.includes(color)) colors.push(color);
          for (const sz of sizes) {
            const cell = rr[colOf[sz]];
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
              if (isSizeLabel(cell) && norm(cell) === sz) continue;
              const q = num(cell);
              if (q > 0) stocks[`|${sz}`] = (stocks[`|${sz}`] || 0) + q;
            }
          }
        }
      } else {
        const color = c.colColor >= 0 ? norm(row[c.colColor]) : "";
        if (color) colors.push(color);
        for (const sz of sizes) {
          const q = num(row[colOf[sz]]);
          if (q > 0) stocks[`${color}|${sz}`] = q;
        }
        if (sizes.length === 0 && c.colQty >= 0) {
          const q = num(row[c.colQty]);
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
