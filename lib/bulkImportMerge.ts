// [2026-11-05] 해외 엑셀 일괄등록 — 브랜드 묶음 상품 한 행에 세부상품을 넣거나(같은 코드면) 바꾼다.
//   순수 함수. 저장 형태는 기존 브랜드 묶음(QuickProductFastForm·옛 엑셀 등록)과 같다.
//   ⚠ 이번에 안 건드리는 기존 세부상품의 실제 판매가(대표가+추가금)는 1원도 바뀌면 안 된다 → 바뀌면 throw.
type Row = Record<string, unknown>;

export type ImportItem = {
  code: string;
  title: string;      // 세부상품 이름(코드 + 색상)
  price: number;      // 실제 판매가
  sizes: string[];
  category: string;   // 세부상품 구분
  photoUrl: string;
};

export type MergeResult = {
  values: { price: number; color_options: string[]; size_options: string[]; detail_image_urls: string[]; product_note: unknown };
  removed: string[];
  added: string[];
  basePriceBefore: number;
  basePriceAfter: number;
  untouchedChecked: number;
  finalDetails: number;
};

export function noteObject(v: unknown): Row {
  if (!v) return {};
  if (typeof v === "string") { try { const p = JSON.parse(v); return p && typeof p === "object" ? p : {}; } catch { return {}; } }
  return typeof v === "object" ? { ...(v as Row) } : {};
}
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {});
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
const uniq = <T,>(a: T[]) => [...new Set(a)];

/** 기존 세부상품 이름이 이 코드의 것인지: 「BB-56」「BB-56 블랙」「GY-1(바게트)」 */
export function sameCode(detailName: string, code: string): boolean {
  const n = detailName.trim().toUpperCase();
  const c = code.trim().toUpperCase();
  return n === c || n.startsWith(c + " ") || n.startsWith(c + "(");
}

export function mergeImportIntoBrandRow(row: Row, items: ImportItem[]): MergeResult {
  const note = noteObject(row.product_note);
  const group = rec(note.brand_group);
  if (group.enabled !== true) throw new Error(`${row.product_name}: 브랜드 묶음 상품이 아니에요.`);
  const pricing = rec(note.option_pricing);
  const axisDetails = (Array.isArray(note.option_axes) ? (note.option_axes as Row[]) : []).find((a) => a.key === "detail");
  const oldDetails = uniq([...strs(axisDetails?.values), ...Object.keys(pricing)]);
  const base = Math.max(0, Number(row.price) || 0);
  const plus = (n: string) => Math.max(0, Math.floor(Number(pricing[n]) || 0));

  for (const it of items) {
    if (!it.title || it.title.includes("/")) throw new Error(`${it.code}: 세부상품 이름에 / 는 쓸 수 없어요`);
    if (!it.photoUrl) throw new Error(`${it.code}: 사진이 없어요`);
    if (!(it.price > 0)) throw new Error(`${it.code}: 가격이 없어요`);
    if (it.sizes.length === 0) throw new Error(`${it.code}: 사이즈가 없어요`);
  }
  const titles = items.map((i) => i.title);
  if (new Set(titles).size !== titles.length) throw new Error(`${row.product_name}: 같은 세부상품 이름이 두 번 있어요`);

  const removed = oldDetails.filter((d) => items.some((it) => sameCode(d, it.code)));
  const kept = oldDetails.filter((d) => !removed.includes(d));
  const clash = kept.filter((d) => titles.includes(d));
  if (clash.length) throw new Error(`${row.product_name}: 이름이 겹쳐요 ${clash.join(", ")}`);

  // 실제 판매가 고정
  const actual = new Map<string, number>();
  for (const d of kept) actual.set(d, base + plus(d));
  for (const it of items) actual.set(it.title, it.price);
  const newBase = Math.min(...[...actual.values()].filter((p) => p > 0));
  const newPricing: Record<string, number> = {};
  for (const [n, p] of actual) newPricing[n] = p - newBase;
  let untouchedChecked = 0;
  for (const d of kept) {
    if (newBase + newPricing[d] !== base + plus(d)) throw new Error(`${row.product_name}: ${d} 판매가가 바뀝니다. 중단`);
    untouchedChecked += 1;
  }

  const drop = (r: Record<string, unknown>) => { for (const d of removed) delete r[d]; return r; };
  const photoSets = drop(rec(note.detail_photo_sets));
  const photos = drop(rec(note.detail_photos));
  const options = drop(rec(group.detail_options));
  const categories = drop(rec(group.detail_categories));
  const hidden = strs(note.combo_hidden).filter((d) => !removed.includes(d));
  const variants = (Array.isArray(note.stock_variants) ? (note.stock_variants as Row[]) : []).filter((v) => {
    const color = String(v.color || "");
    return !removed.some((d) => color === d || color.startsWith(d + " / "));
  });
  const designGroups = (Array.isArray(note.design_groups) ? (note.design_groups as Row[]) : [])
    .map((g) => ({ ...g, members: strs(g.members).filter((m) => !removed.includes(m)) }))
    .filter((g) => strs(g.members).length >= 2);

  for (const it of items) {
    photoSets[it.title] = [it.photoUrl];
    photos[it.title] = it.photoUrl;
    options[it.title] = { colors: ["없음"], sizes: it.sizes, variants: it.sizes.map((s) => ({ color: "없음", size: s })) };
    categories[it.title] = it.category;
    for (const s of it.sizes) variants.push({ color: `${it.title} / 없음`, size: s, stock: 0 });
  }
  const finalDetails = [...kept, ...titles];
  const allColors = uniq(finalDetails.flatMap((d) => strs(rec(options[d]).colors)));
  const allSizes = uniq(finalDetails.flatMap((d) => strs(rec(options[d]).sizes)));
  const removedUrls = new Set(removed.flatMap((d) => strs(rec(note.detail_photo_sets)[d])));
  const detailUrls = uniq([...strs(row.detail_image_urls).filter((u) => !removedUrls.has(u)), ...items.map((i) => i.photoUrl)]);

  const merged: Row = {
    ...note,
    stock_variants: variants,
    option_pricing: newPricing,
    detail_photos: photos,
    detail_photo_sets: photoSets,
    combo_hidden: hidden,
    option_axes: [
      { key: "detail", label: "세부상품", values: finalDetails },
      ...(allColors.length ? [{ key: "color", label: "색상", values: allColors }] : []),
      ...(allSizes.length ? [{ key: "size", label: "사이즈", values: allSizes }] : []),
    ],
    combo_detail_values: finalDetails.filter((d) => !hidden.includes(d)),
    brand_group: { ...group, detail_options: options, detail_categories: categories },
    ...(designGroups.length || Array.isArray(note.design_groups) ? { design_groups: designGroups } : {}),
  };
  return {
    values: {
      price: newBase,
      color_options: finalDetails,
      size_options: allSizes,
      detail_image_urls: detailUrls,
      product_note: typeof row.product_note === "string" ? JSON.stringify(merged) : merged,
    },
    removed,
    added: titles,
    basePriceBefore: base,
    basePriceAfter: newBase,
    untouchedChecked,
    finalDetails: finalDetails.length,
  };
}

/** 새 브랜드 묶음 행(예: 막스마라) — 기존 브랜드 행의 설정을 본뜨고 세부상품은 비운다. */
export function blankBrandRowFrom(template: Row, brandKo: string, brandEn: string): Row {
  const t = noteObject(template.product_note);
  const note: Row = {
    stock_mode: t.stock_mode ?? "option",
    stock_variants: [],
    stock_management_enabled: false,
    purchase_limit_enabled: false,
    purchase_limit_qty: 0,
    registered_order_enabled: t.registered_order_enabled ?? true,
    customer_detail_input_enabled: false,
    name_suggestion_enabled: t.name_suggestion_enabled ?? false,
    suggestion_keywords: [],
    category: t.category ?? "의류",
    customer_category_visible: t.customer_category_visible ?? true,
    free_product: false,
    combo_mode: true,
    option_label: t.option_label ?? "종류",
    option_pricing: {},
    combo_hidden: [],
    detail_photos: {},
    detail_photo_sets: {},
    option_axes: [],
    combo_detail_values: [],
    brand_group: { enabled: true, brand_ko: brandKo, brand_en: brandEn, detail_categories: {}, detail_options: {} },
  };
  return {
    product_name: brandKo,
    price: 0,
    stock: 0,
    status: template.status ?? "판매중",
    product_type: template.product_type ?? "broadcast",
    badge_types: template.badge_types ?? [],
    shipping_type: template.shipping_type ?? "normal",
    combine_shipping: template.combine_shipping ?? "Y",
    in_shop: false,
    image_url: null,
    color_options: [],
    size_options: [],
    detail_image_urls: [],
    product_note: typeof template.product_note === "string" ? JSON.stringify(note) : note,
  };
}

/** 세부상품 한 개의 지금 값(실제 판매가·사이즈·사진·구분) — 다른 묶음으로 옮길 때 씀. */
export function readBrandDetail(row: Row, name: string): ImportItem | null {
  const note = noteObject(row.product_note);
  const group = rec(note.brand_group);
  const opt = rec(rec(group.detail_options)[name]);
  const sizes = strs(opt.sizes);
  if (!sizes.length) return null;
  const photo = strs(rec(note.detail_photo_sets)[name])[0] || String(rec(note.detail_photos)[name] || "");
  return {
    code: name,
    title: name,
    price: Math.max(0, Number(row.price) || 0) + Math.max(0, Math.floor(Number(rec(note.option_pricing)[name]) || 0)),
    sizes,
    category: String(rec(group.detail_categories)[name] || ""),
    photoUrl: photo,
  };
}

/** 세부상품 빼기 — 남는 세부상품의 실제 판매가는 그대로(바뀌면 throw). */
export function removeDetailsFromBrandRow(row: Row, names: string[]): MergeResult {
  const note = noteObject(row.product_note);
  const group = rec(note.brand_group);
  const pricing = rec(note.option_pricing);
  const axisDetails = (Array.isArray(note.option_axes) ? (note.option_axes as Row[]) : []).find((a) => a.key === "detail");
  const oldDetails = uniq([...strs(axisDetails?.values), ...Object.keys(pricing)]);
  const removed = oldDetails.filter((d) => names.includes(d));
  if (removed.length !== names.length) throw new Error(`${row.product_name}: 뺄 세부상품을 못 찾았어요`);
  const kept = oldDetails.filter((d) => !removed.includes(d));
  if (!kept.length) throw new Error(`${row.product_name}: 세부상품이 하나도 안 남아요`);
  const base = Math.max(0, Number(row.price) || 0);
  const actual = new Map(kept.map((d) => [d, base + Math.max(0, Math.floor(Number(pricing[d]) || 0))]));
  const newBase = Math.min(...[...actual.values()].filter((p) => p > 0));
  const newPricing: Record<string, number> = {};
  for (const [n, p] of actual) newPricing[n] = p - newBase;
  for (const d of kept) if (newBase + newPricing[d] !== actual.get(d)) throw new Error(`${row.product_name}: ${d} 판매가가 바뀝니다. 중단`);
  const drop = (r: Record<string, unknown>) => { for (const d of removed) delete r[d]; return r; };
  const options = drop(rec(group.detail_options));
  const hidden = strs(note.combo_hidden).filter((d) => !removed.includes(d));
  const allColors = uniq(kept.flatMap((d) => strs(rec(options[d]).colors)));
  const allSizes = uniq(kept.flatMap((d) => strs(rec(options[d]).sizes)));
  const removedUrls = new Set(removed.flatMap((d) => strs(rec(note.detail_photo_sets)[d])));
  const merged: Row = {
    ...note,
    stock_variants: (Array.isArray(note.stock_variants) ? (note.stock_variants as Row[]) : []).filter((v) => !removed.some((d) => String(v.color || "") === d || String(v.color || "").startsWith(d + " / "))),
    option_pricing: newPricing,
    detail_photos: drop(rec(note.detail_photos)),
    detail_photo_sets: drop(rec(note.detail_photo_sets)),
    combo_hidden: hidden,
    option_axes: [
      { key: "detail", label: "세부상품", values: kept },
      ...(allColors.length ? [{ key: "color", label: "색상", values: allColors }] : []),
      ...(allSizes.length ? [{ key: "size", label: "사이즈", values: allSizes }] : []),
    ],
    combo_detail_values: kept.filter((d) => !hidden.includes(d)),
    brand_group: { ...group, detail_options: options, detail_categories: drop(rec(group.detail_categories)) },
  };
  return {
    values: { price: newBase, color_options: kept, size_options: allSizes, detail_image_urls: strs(row.detail_image_urls).filter((u) => !removedUrls.has(u)), product_note: typeof row.product_note === "string" ? JSON.stringify(merged) : merged },
    removed, added: [], basePriceBefore: base, basePriceAfter: newBase, untouchedChecked: kept.length, finalDetails: kept.length,
  };
}

/** 세부상품 구분(패딩·의류…) 비우기 — 손님 화면 구분 칩이 안 보이게. 값만 비우고 다른 칸은 그대로. */
export function clearDetailCategories(row: Row): unknown {
  const note = noteObject(row.product_note);
  const group = rec(note.brand_group);
  const merged = { ...note, brand_group: { ...group, detail_categories: {} } };
  return typeof row.product_note === "string" ? JSON.stringify(merged) : merged;
}
