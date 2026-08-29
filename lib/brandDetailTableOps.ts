// lib/brandDetailTableOps.ts
// [2026-08-29] 브랜드 상품 "표에서 바로 고치기"의 계산 부분만 따로 뺀 것.
//
// 왜 뺐나
//   이 계산이 화면(React) 안에 박혀 있으면 시뮬레이션 검사를 돌릴 수 없다.
//   이름 하나만 잘못 옮겨도 재고 키("세부상품 / 색상")가 어긋나 엉뚱한 재고를 깎기 때문에
//   반드시 자동 검사가 가능해야 한다.
//
// ⚠️ 계산만 한다. 저장·주문·입금·정산 로직과 무관하다.
//    저장되는 형태는 기존 수정창(applyBrandDetailEditor)이 만들던 것과 동일해야 한다.

export const AXIS_JOIN = " / ";

export type DetailOptionConfig = {
  colors: string[];
  sizes: string[];
  variants: Array<{ color: string; size: string }>;
};

export type VariantRow = {
  key: string;
  color: string;      // "세부상품 / 색상" (저장 형태)
  size: string;
  stock: number;
  detail: string;
  colorOnly: string;
};

export type BrandDetailState = {
  details: string[];
  detailPlus: Record<string, string>;
  detailPhotos: Record<string, string>;
  photoSets: Record<string, string[]>;
  categories: Record<string, string>;
  options: Record<string, DetailOptionConfig>;
  hidden: string[];
  variantRows: VariantRow[];
};

const clean = (v: unknown) => String(v ?? "").trim();

export function splitCsv(raw: unknown): string[] {
  return [...new Set(
    String(raw ?? "")
      .split(/[,|\n]+/g)
      .map((v) => v.trim())
      .filter(Boolean),
  )];
}

function variantKey(color: string, size: string) {
  return `${color || "__EMPTY_COLOR__"}__${size || "__EMPTY_SIZE__"}`;
}

/** 한 세부상품의 색상×사이즈 조합 행을 만든다. 이전 수량이 있으면 살린다. */
export function buildRowsForDetail(
  detail: string,
  colors: string[],
  sizes: string[],
  previous: VariantRow[],
): VariantRow[] {
  const cs = colors.length ? colors : ["없음"];
  const ss = sizes.length ? sizes : ["없음"];
  return cs.flatMap((c) =>
    ss.map((z) => {
      const color = [detail, c].filter(Boolean).join(AXIS_JOIN);
      const size = z === "없음" ? "" : z;
      const before = previous.find(
        (row) => row.detail === detail && row.colorOnly === c && clean(row.size) === size,
      );
      return {
        key: variantKey(color, size),
        color,
        size,
        stock: Number(before?.stock || 0),
        detail,
        colorOnly: c,
      };
    }),
  );
}

/**
 * 세부상품 이름 바꾸기.
 * 이름이 재고 키의 앞부분이라 관련된 곳을 **전부** 같이 옮겨야 한다.
 * 하나라도 빠지면 그 세부상품의 사진·가격·재고가 조용히 사라진다.
 */
export function renameDetail(
  state: BrandDetailState,
  oldName: string,
  rawNext: string,
): { ok: true; state: BrandDetailState } | { ok: false; reason: string } {
  const nextName = clean(rawNext);
  if (!clean(oldName)) return { ok: false, reason: "바꿀 상품이 없습니다" };
  if (!nextName) return { ok: false, reason: "상품명을 비울 수 없습니다" };
  if (nextName === oldName) return { ok: false, reason: "같은 이름입니다" };
  if (state.details.includes(nextName)) return { ok: false, reason: "같은 상품명이 이미 있어요" };
  if (nextName.includes(AXIS_JOIN.trim())) return { ok: false, reason: '상품명에 "/" 를 쓸 수 없어요' };

  const move = <T,>(source: Record<string, T>) => {
    const next = { ...source };
    if (oldName in next) { next[nextName] = next[oldName]; delete next[oldName]; }
    return next;
  };

  return {
    ok: true,
    state: {
      details: state.details.map((n) => (n === oldName ? nextName : n)),
      detailPlus: move(state.detailPlus),
      detailPhotos: move(state.detailPhotos),
      photoSets: move(state.photoSets),
      categories: move(state.categories),
      options: move(state.options),
      hidden: state.hidden.map((n) => (n === oldName ? nextName : n)),
      variantRows: state.variantRows.map((row) => {
        if (row.detail !== oldName) return row;
        const color = [nextName, row.colorOnly].filter(Boolean).join(AXIS_JOIN);
        return { ...row, detail: nextName, color, key: variantKey(color, row.size) };
      }),
    },
  };
}

/** 색상 또는 사이즈를 쉼표로 다시 적으면 그 세부상품의 조합만 다시 만든다. */
export function setDetailAxis(
  state: BrandDetailState,
  detail: string,
  axis: "colors" | "sizes",
  raw: string,
): BrandDetailState {
  const values = splitCsv(raw);
  const before = state.options[detail] || { colors: [], sizes: [], variants: [] };
  const colors = axis === "colors" ? values : (before.colors || []);
  const sizes = axis === "sizes" ? values : (before.sizes || []);
  const cs = colors.length ? colors : ["없음"];
  const ss = sizes.length ? sizes : ["없음"];

  return {
    ...state,
    options: {
      ...state.options,
      [detail]: { colors, sizes, variants: cs.flatMap((c) => ss.map((z) => ({ color: c, size: z }))) },
    },
    variantRows: [
      ...state.variantRows.filter((row) => row.detail !== detail),
      ...buildRowsForDetail(detail, colors, sizes, state.variantRows),
    ],
  };
}

/** 표에 줄 추가. 색상·사이즈·구분은 바로 윗줄 것을 물려받는다. */
export function addDetailRow(
  state: BrandDetailState,
  params: { name?: string; salePrice?: number; basePrice: number },
): { state: BrandDetailState; name: string } {
  const previous = state.details[state.details.length - 1];
  const cfg = previous ? state.options[previous] : undefined;

  let name = clean(params.name);
  if (name.includes(AXIS_JOIN.trim())) name = name.split(AXIS_JOIN.trim()).join(" ").trim();
  if (!name) {
    let i = state.details.length + 1;
    while (state.details.includes(`새 상품 ${i}`)) i += 1;
    name = `새 상품 ${i}`;
  }
  if (state.details.includes(name)) return { state, name };

  const colors = cfg?.colors || [];
  const sizes = cfg?.sizes || [];
  const base = Math.max(0, Math.floor(Number(params.basePrice) || 0));
  const sale = Number(params.salePrice);

  const next: BrandDetailState = {
    ...state,
    details: [...state.details, name],
    detailPlus: Number.isFinite(sale) && sale > base
      ? { ...state.detailPlus, [name]: String(sale - base) }
      : state.detailPlus,
    options: cfg
      ? {
          ...state.options,
          [name]: {
            colors,
            sizes,
            variants: (colors.length ? colors : ["없음"]).flatMap((c) =>
              (sizes.length ? sizes : ["없음"]).map((z) => ({ color: c, size: z })),
            ),
          },
        }
      : state.options,
    categories: previous && state.categories[previous]
      ? { ...state.categories, [name]: state.categories[previous] }
      : state.categories,
    variantRows: cfg
      ? [...state.variantRows, ...buildRowsForDetail(name, colors, sizes, [])]
      : state.variantRows,
  };

  return { state: next, name };
}

/** 표에서 줄 빼기. 마지막 하나는 뺄 수 없다(고를 게 없는 브랜드가 되므로). */
export function removeDetailRow(
  state: BrandDetailState,
  target: string,
): { ok: true; state: BrandDetailState } | { ok: false; reason: string } {
  if (!state.details.includes(target)) return { ok: false, reason: "없는 상품입니다" };
  if (state.details.length <= 1) return { ok: false, reason: "마지막 상품은 뺄 수 없어요" };

  const drop = <T,>(source: Record<string, T>) => {
    const next = { ...source };
    delete next[target];
    return next;
  };

  return {
    ok: true,
    state: {
      details: state.details.filter((n) => n !== target),
      detailPlus: drop(state.detailPlus),
      detailPhotos: drop(state.detailPhotos),
      photoSets: drop(state.photoSets),
      categories: drop(state.categories),
      options: drop(state.options),
      hidden: state.hidden.filter((n) => n !== target),
      variantRows: state.variantRows.filter((row) => row.detail !== target),
    },
  };
}

/** 판매가 → 추가금 역산. 대표가보다 낮으면 적용하지 않는다(추가금 음수 금지). */
export function salePriceToPlus(typed: string, basePrice: number):
  { applied: false; reason: "empty" | "belowBase" } | { applied: true; plus: string } {
  const digits = String(typed ?? "").replace(/[^0-9]/g, "");
  if (!digits) return { applied: false, reason: "empty" };
  const sale = Number(digits) || 0;
  const base = Math.max(0, Math.floor(Number(basePrice) || 0));
  if (sale < base) return { applied: false, reason: "belowBase" };
  return { applied: true, plus: String(sale - base) };
}

/** 파일 이름에서 상품명 뽑기 (BB-39.jpg → BB-39) */
export function productNameFromFileName(fileName: string): string {
  return clean(String(fileName ?? "").replace(/\.[A-Za-z0-9]+$/, ""));
}
