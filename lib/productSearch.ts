/**
 * 상품 검색용 비교 문자열을 만든다.
 *
 * 저장된 상품명은 건드리지 않고 검색할 때만 대소문자와 구분 기호를 무시한다.
 * NFKC 정규화로 전각 영문/숫자도 일반 영문/숫자와 동일하게 취급한다.
 */
export function normalizeProductSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const isNumber = (value: string) => /^\p{N}$/u.test(value);

/**
 * 상품명/세부상품명 부분검색.
 * 숫자로 끝나는 검색어는 다음 숫자까지 삼키지 않게 해 상품번호 오인식을 막는다.
 * 예: miu2 ↔ MIU-2 (일치), miu2 ↔ MIU-20 (불일치)
 */
export function productSearchMatches(target: unknown, query: unknown): boolean {
  const normalizedTarget = normalizeProductSearchText(target);
  const normalizedQuery = normalizeProductSearchText(query);

  if (!normalizedQuery || !normalizedTarget) return false;
  if (matchNormalized(normalizedTarget, normalizedQuery)) return true;
  // [2026-11-06 사장님 「대충 검색해도」] 샤넬202·샤202·chanel202 → ch202 처럼 브랜드 이름을 상품번호 앞 글자로 바꿔 한 번 더 본다.
  for (const variant of brandQueryVariants(normalizedQuery)) {
    if (matchNormalized(normalizedTarget, variant)) return true;
  }
  return false;
}

function matchNormalized(normalizedTarget: string, normalizedQuery: string): boolean {
  if (!normalizedQuery || !normalizedTarget) return false;

  const queryStartsWithNumber = isNumber(normalizedQuery[0] ?? "");
  const queryEndsWithNumber = isNumber(normalizedQuery.at(-1) ?? "");
  let fromIndex = 0;

  while (fromIndex <= normalizedTarget.length - normalizedQuery.length) {
    const index = normalizedTarget.indexOf(normalizedQuery, fromIndex);
    if (index < 0) return false;

    const before = normalizedTarget[index - 1] ?? "";
    const after = normalizedTarget[index + normalizedQuery.length] ?? "";
    const startsOnNumberBoundary = !queryStartsWithNumber || !isNumber(before);
    const endsOnNumberBoundary = !queryEndsWithNumber || !isNumber(after);

    if (startsOnNumberBoundary && endsOnNumberBoundary) return true;
    fromIndex = index + 1;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// [2026-11-06] 브랜드 이름 ↔ 상품번호 앞 글자(CH·PD·GC…) 연결표 — 검색 전용(저장값 무변경)
//   - 기본값(아래 SEED) + 실제 상품 데이터(묶음 이름 → 그 안 세부상품 번호 앞 글자)를 합친다.
//   - 검색어가 «글자 + 숫자» 모양일 때만 바꿔 본다: 샤넬202·샤넬-202·샤202·chanel202 → ch202.
//     한글은 브랜드 이름 앞부분(1글자 이상), 영어는 3글자 이상 맞아야 한다.
const SEED_BRAND_CODES: Array<[string[], string[]]> = [
  [["샤넬", "chanel"], ["ch"]],
  [["프라다", "prada"], ["pd"]],
  [["구찌", "gucci"], ["gc"]],
  [["버버리", "burberry"], ["bb"]],
  [["디올", "dior"], ["dr"]],
  [["셀린느", "셀린", "celine"], ["cl"]],
  [["로에베", "loewe"], ["loe"]],
  [["미우미우", "miumiu"], ["miu"]],
  [["막스마라", "maxmara"], ["mx"]],
  [["브루넬로쿠치넬리", "쿠치넬리", "brunellocucinelli", "cucinelli"], ["bc"]],
];

type BrandAliasEntry = { names: Set<string>; codes: Set<string> };
const variantCache = new Map<string, string[]>();
const brandAliasRegistry = new Map<string, BrandAliasEntry>();

function addBrandAlias(names: string[], codes: string[]) {
  const cleanNames = names.map((n) => normalizeProductSearchText(n)).filter(Boolean);
  const cleanCodes = codes.map((c) => normalizeProductSearchText(c)).filter((c) => /^[a-z]{1,5}$/.test(c));
  if (!cleanNames.length || !cleanCodes.length) return;
  const key = cleanNames[0];
  const entry = brandAliasRegistry.get(key) ?? { names: new Set<string>(), codes: new Set<string>() };
  cleanNames.forEach((n) => entry.names.add(n));
  cleanCodes.forEach((c) => entry.codes.add(c));
  brandAliasRegistry.set(key, entry);
  variantCache.clear();
}

for (const [names, codes] of SEED_BRAND_CODES) addBrandAlias(names, codes);

/** 세부상품 이름에서 상품번호 앞 영문(CH-202 → ch). 없으면 "". */
export function detailCodePrefix(detailName: unknown): string {
  const m = normalizeProductSearchText(detailName).match(/^([a-z]{1,5})\d/);
  return m ? m[1] : "";
}

/**
 * 묶음 이름과 그 안 세부상품 이름들로 연결표를 채운다(여러 번 불러도 됨).
 * 세부상품 2개 이상(묶음이 2개 이하면 1개)에서 쓰인 앞 글자만 넣어 우연한 섞임을 거른다.
 */
export function registerBrandSearchAliases(groups: Array<{ brandName: string; detailNames: string[] }>) {
  for (const g of groups) {
    const counts = new Map<string, number>();
    for (const n of g.detailNames) {
      const prefix = detailCodePrefix(n);
      if (prefix) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    const min = g.detailNames.length <= 2 ? 1 : 2;
    const codes = [...counts].filter(([, c]) => c >= min).map(([p]) => p);
    if (codes.length) addBrandAlias([g.brandName], codes);
  }
}

/** 검색어를 상품번호 모양으로 바꾼 후보들(원래 검색어 제외). */
export function brandQueryVariants(normalizedQuery: string): string[] {
  const cached = variantCache.get(normalizedQuery);
  if (cached) return cached;
  const out = new Set<string>();
  const m = normalizedQuery.match(/^(\D+?)(\d.*)$/u);
  if (m) {
    const [, head, rest] = m;
    const isLatin = /^[a-z]+$/.test(head);
    const ok = isLatin ? head.length >= 3 : true;
    if (ok) {
      for (const entry of brandAliasRegistry.values()) {
        const hit = [...entry.names].some((n) => n.startsWith(head));
        if (!hit) continue;
        for (const code of entry.codes) if (code !== head) out.add(code + rest);
      }
    }
  }
  const list = [...out];
  if (variantCache.size > 500) variantCache.clear();
  variantCache.set(normalizedQuery, list);
  return list;
}
