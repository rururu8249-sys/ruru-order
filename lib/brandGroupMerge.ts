type Row = Record<string, unknown>;

function objectValue(value: unknown): Row {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as Row) : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" ? (value as Row) : {};
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function detailCode(name: string) {
  const matched = name.trim().match(/^([A-Z]+)\([^)]*\)-([^\s]+)/i);
  return matched ? `${matched[1].toUpperCase()}-${matched[2].toUpperCase()}` : "";
}

export type BrandGroupMergeResult = {
  values: Record<string, unknown>;
  addedDetails: string[];
  finalDetails: string[];
  finalPhotoCount: number;
  finalVariantCount: number;
  // [2026-08-29 P0-6] 저장 전/후 대조용 — 화면과 검수 로그가 "실제 판매가가 안 변했다"를 확인할 수 있게 한다.
  basePriceBefore: number;
  basePriceAfter: number;
  detailPriceChecks: Array<{ name: string; before: number; after: number; isNew: boolean }>;
};

// 기존 브랜드 대표상품 한 행에 신규 세부상품만 안전하게 합친다.
// 이름 또는 코드가 하나라도 겹치면 저장 전에 중단한다.
export function mergeBrandGroupProduct(
  existingRow: Row,
  incomingPayload: Row,
  importBatch: string,
): BrandGroupMergeResult {
  const existingNote = objectValue(existingRow.product_note);
  const incomingNote = objectValue(incomingPayload.product_note);
  const existingGroup = recordValue(existingNote.brand_group);
  const incomingGroup = recordValue(incomingNote.brand_group);
  if (existingGroup.enabled !== true || incomingGroup.enabled !== true) {
    throw new Error("브랜드 대표상품끼리만 추가 병합할 수 있어요.");
  }
  const existingName = String(existingRow.product_name || "").trim();
  const incomingName = String(incomingPayload.product_name || "").trim();
  if (!existingName || existingName !== incomingName) {
    throw new Error(`대표상품명이 달라요: ${existingName || "없음"} / ${incomingName || "없음"}`);
  }

  const oldPricing = recordValue(existingNote.option_pricing);
  const newPricing = recordValue(incomingNote.option_pricing);
  const oldDetails = Object.keys(oldPricing);
  const newDetails = Object.keys(newPricing);
  if (newDetails.length === 0) throw new Error(`${existingName}: 추가할 세부상품이 없어요.`);
  const oldCodes = new Map<string, string>();
  for (const name of oldDetails) {
    const code = detailCode(name);
    if (code) oldCodes.set(code, name);
  }
  const collisions = newDetails.filter((name) => {
    const code = detailCode(name);
    return oldPricing[name] !== undefined || Boolean(code && oldCodes.has(code));
  });
  if (collisions.length > 0) throw new Error(`${existingName}: 이미 등록된 세부상품 ${collisions.join(", ")}`);

  const oldPhotoSets = recordValue(existingNote.detail_photo_sets);
  const newPhotoSets = recordValue(incomingNote.detail_photo_sets);
  for (const name of newDetails) {
    if (stringArray(newPhotoSets[name]).length === 0) throw new Error(`${name}: 상세사진이 없어요.`);
  }

  const oldOptions = recordValue(existingGroup.detail_options);
  const newOptions = recordValue(incomingGroup.detail_options);
  const oldCategories = recordValue(existingGroup.detail_categories);
  const newCategories = recordValue(incomingGroup.detail_categories);
  for (const name of newDetails) {
    const config = recordValue(newOptions[name]);
    if (!Array.isArray(config.variants) || config.variants.length === 0) throw new Error(`${name}: 색상·사이즈 조합이 없어요.`);
    if (!String(newCategories[name] || "").trim()) throw new Error(`${name}: 상품구분이 없어요.`);
  }

  const finalDetails = [...oldDetails, ...newDetails];
  const mergedOptions = { ...oldOptions, ...newOptions };
  const allColors = unique(finalDetails.flatMap((name) => stringArray(recordValue(mergedOptions[name]).colors)));
  const allSizes = unique(finalDetails.flatMap((name) => stringArray(recordValue(mergedOptions[name]).sizes)));
  const oldVariants = Array.isArray(existingNote.stock_variants) ? existingNote.stock_variants : [];
  const newVariants = Array.isArray(incomingNote.stock_variants) ? incomingNote.stock_variants : [];
  const mergedPhotoSets = { ...oldPhotoSets, ...newPhotoSets };
  const mergedDetailPhotos = {
    ...recordValue(existingNote.detail_photos),
    ...recordValue(incomingNote.detail_photos),
  };
  const previousBatches = Array.isArray(existingNote.import_batches)
    ? existingNote.import_batches.map(String)
    : (existingNote.import_batch ? [String(existingNote.import_batch)] : []);

  // ──────────────────────────────────────────────────────────────────────────
  // [2026-08-29 P0-6] 기존 세부상품 "실제 판매가" 불변 보장
  //
  //   세부상품 실제가 = products.price(대표가) + option_pricing[세부상품명](추가금)
  //   병합 대표가는 최저가(Math.min)로 내려가는데, 추가금을 그대로 두면
  //   기존 세부상품 수십 개의 판매가가 한꺼번에 내려간다(방송 중이면 그대로 팔림).
  //
  //   → 대표가가 내려간 만큼 추가금을 다시 계산해서 실제 판매가를 고정한다.
  //     저장 형태(option_pricing)와 DB 구조는 그대로라 주문·재고·제출검증 경로 무변경.
  //     테스트: scripts/test-brand-group-price-guard.mjs
  // ──────────────────────────────────────────────────────────────────────────
  const plusOf = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
  const basePriceBefore = Math.max(0, Number(existingRow.price) || 0);
  const incomingBasePrice = Math.max(0, Number(incomingPayload.price) || 0);
  const positivePrices = [basePriceBefore, incomingBasePrice].filter((price) => Number.isFinite(price) && price > 0);
  if (positivePrices.length === 0) throw new Error(`${existingName}: 대표가격이 올바르지 않아요.`);
  const basePriceAfter = Math.min(...positivePrices);

  const actualBefore = new Map<string, number>();
  for (const name of oldDetails) actualBefore.set(name, basePriceBefore + plusOf(oldPricing[name]));
  for (const name of newDetails) actualBefore.set(name, incomingBasePrice + plusOf(newPricing[name]));

  const preservedPricing: Record<string, number> = {};
  for (const [name, actual] of actualBefore) preservedPricing[name] = actual - basePriceAfter;

  // 추가금은 0 이상이어야 한다(대표가가 최저가이므로 정상적으로는 항상 성립).
  const negativePlus = Object.entries(preservedPricing).filter(([, plus]) => plus < 0);
  if (negativePlus.length > 0) {
    throw new Error(`${existingName}: 추가금이 음수가 되는 세부상품이 있어요(${negativePlus[0][0]}). 저장을 중단했습니다.`);
  }

  // 안전검사 — 실제 판매가가 1원이라도 달라지면 저장하지 않는다.
  const detailPriceChecks = [...actualBefore.entries()].map(([name, before]) => ({
    name,
    before,
    after: basePriceAfter + preservedPricing[name],
    isNew: newDetails.includes(name),
  }));
  const priceDrift = detailPriceChecks.filter((row) => row.before !== row.after);
  if (priceDrift.length > 0) {
    const sample = priceDrift
      .slice(0, 3)
      .map((row) => `${row.name} ${row.before.toLocaleString("ko-KR")}원 → ${row.after.toLocaleString("ko-KR")}원`)
      .join(" / ");
    throw new Error(
      `${existingName}: 세부상품 판매가가 바뀝니다(${priceDrift.length}개). 저장을 중단했어요. ${sample}`,
    );
  }

  const mergedNote: Row = {
    ...existingNote,
    stock_variants: [...oldVariants, ...newVariants],
    option_pricing: preservedPricing,
    detail_photos: mergedDetailPhotos,
    detail_photo_sets: mergedPhotoSets,
    option_axes: [
      { key: "detail", label: "세부상품", values: finalDetails },
      ...(allColors.length > 0 ? [{ key: "color", label: "색상", values: allColors }] : []),
      ...(allSizes.length > 0 ? [{ key: "size", label: "사이즈", values: allSizes }] : []),
    ],
    combo_detail_values: finalDetails.filter((name) => !stringArray(existingNote.combo_hidden).includes(name)),
    brand_group: {
      ...existingGroup,
      detail_categories: { ...oldCategories, ...newCategories },
      detail_options: mergedOptions,
    },
    import_batches: unique([...previousBatches, importBatch]),
  };

  const oldDetailUrls = stringArray(existingRow.detail_image_urls);
  const newDetailUrls = stringArray(incomingPayload.detail_image_urls);
  const finalPhotoCount = Object.values(mergedPhotoSets)
    .reduce<number>((sum, urls) => sum + stringArray(urls).length, 0);
  return {
    values: {
      price: basePriceAfter,
      stock: Math.max(0, Number(existingRow.stock) || 0) + Math.max(0, Number(incomingPayload.stock) || 0),
      color_options: finalDetails,
      size_options: allSizes,
      detail_image_urls: unique([...oldDetailUrls, ...newDetailUrls]),
      product_note: JSON.stringify(mergedNote),
    },
    addedDetails: newDetails,
    finalDetails,
    finalPhotoCount,
    finalVariantCount: oldVariants.length + newVariants.length,
    basePriceBefore,
    basePriceAfter,
    detailPriceChecks,
  };
}
