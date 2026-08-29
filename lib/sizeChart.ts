// [2026-08-29 사장님 요청] 사이즈 실측표 — 벤더 엑셀 원본에 적힌 치수만 그대로 보여준다.
//
// 왜 만들었나
//   손님이 "4"가 몇 cm인지 모른 채 사이즈를 고른다. 그래서 사이즈 사고(반품)가 난다.
//   벤더 엑셀 사진 안에 실측표(어깨·가슴·총장·허리)가 찍혀 있는 상품이 있어, 그 값만 옮겨 담는다.
//
// 반드시 지키는 원칙
//   · 치수를 추정하거나 계산해서 만들지 않는다. 원본 사진에 또렷하게 적힌 숫자만 넣는다.
//   · 사이즈 문자 대응(예: 4=S)은 넣지 않는다. 벤더 표기가 일반 통용과 어긋나는 경우가 확인됐다.
//   · 데이터가 없으면 화면에 아무것도 만들지 않는다(기존 화면 100% 동일).
//
// 저장 위치: product_note.size_charts[<세부상품명>]
//   { sizes:["4","6"], rows:[{label:"어깨너비", values:[38,39]}], unit:"cm", note:"..." }
//
// 금액·재고·주문·입금·배송과 무관한 표시 전용 데이터다.

export type SizeChartRow = { label: string; values: string[] };
export type SizeChart = { sizes: string[]; rows: SizeChartRow[]; unit: string; note: string };

const text = (v: unknown) => String(v ?? "").trim();

function parseNote(note: unknown): Record<string, unknown> {
  if (!note) return {};
  if (typeof note === "object") return note as Record<string, unknown>;
  if (typeof note === "string") {
    try {
      const parsed = JSON.parse(note);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

// 값 하나를 표시용 문자로. 숫자는 소수점 불필요한 0을 떼고("69.0"→"69"), 그 외는 원문 유지.
function cell(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const num = Number(raw);
  if (Number.isFinite(num)) {
    return Number.isInteger(num) ? String(num) : String(num);
  }
  return raw;
}

// 저장된 값이 표로 성립하는지 검사한다. 한 칸이라도 어긋나면 통째로 버린다(어긋난 표를 손님에게 보여주는 게 더 위험).
export function normalizeSizeChart(raw: unknown): SizeChart | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const sizes = (Array.isArray(record.sizes) ? record.sizes : []).map(text).filter(Boolean);
  if (sizes.length < 2) return null;

  const rawRows = Array.isArray(record.rows) ? record.rows : [];
  const rows: SizeChartRow[] = [];
  for (const item of rawRows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = text(row.label);
    const values = (Array.isArray(row.values) ? row.values : []).map(cell);
    // 사이즈 개수와 값 개수가 다르면 어느 값이 어느 사이즈인지 알 수 없다 → 버린다.
    if (!label || values.length !== sizes.length) continue;
    if (values.some((v) => !v)) continue;
    rows.push({ label, values });
  }
  if (rows.length === 0) return null;

  return {
    sizes,
    rows,
    unit: text(record.unit) || "cm",
    note: text(record.note),
  };
}

// 상품(product_note)과 세부상품명으로 실측표를 찾는다. 없으면 null.
export function resolveSizeChart(productNote: unknown, detailName: unknown): SizeChart | null {
  const name = text(detailName);
  if (!name) return null;
  const charts = parseNote(productNote).size_charts;
  if (!charts || typeof charts !== "object") return null;
  return normalizeSizeChart((charts as Record<string, unknown>)[name]);
}

// 지금 고른 사이즈가 표의 몇 번째 칸인지(강조 표시용). 없으면 -1.
export function sizeColumnIndex(chart: SizeChart | null, selectedSize: unknown): number {
  if (!chart) return -1;
  const target = text(selectedSize);
  if (!target) return -1;
  return chart.sizes.findIndex((s) => s === target);
}
