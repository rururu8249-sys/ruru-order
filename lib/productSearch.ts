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
