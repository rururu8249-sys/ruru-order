// lib/optionSplit.ts
// ─────────────────────────────────────────────────────────────────────────────
// 상품 옵션(색상·사이즈·세부상품) 문자열을 «옵션 목록»으로 나누는 단 하나의 규칙.
//
// [2026-09-08 사장님 지침] 「쉼표만 옵션 구분이야. / ~ 다른 게 들어가면 구분되게 하면 안 돼」
//   사이즈 「XS/S」는 «한 묶음 사이즈»의 이름이지 두 개가 아니다.
//   예)  "XS/S, M/L, XL/XXL"  →  ["XS/S", "M/L", "XL/XXL"]   (3개)
//
// 왜 파일을 따로 만들었나:
//   예전엔 이 규칙이 8곳에 각자 적혀 있었다(관리자 상품등록·상품관리·손님 주문서·
//   위젯·채팅공지·엑셀·등록상품 고르기). 규칙이 서로 달라지면 «관리자에서 저장한 옵션이
//   손님 화면에서 다르게 쪼개지는» 사고가 난다. 한 곳에서만 정한다.
//   ※ scripts/guard-admin-ui.js 가 「/ 를 구분자로 쓰는 코드」를 다시 못 넣게 검사한다.
//
// 구분자: 쉼표(,) 와 줄바꿈만.
//   줄바꿈을 남긴 이유 — 여러 줄 붙여넣기가 실무에서 흔하고, 줄바꿈은 옵션 «이름»에
//   들어갈 수 없어 오해의 여지가 없다. / | · . 등 나머지는 전부 «이름의 일부»다.
const SEPARATOR = /[,\n\r]+/g;

/** 문자열 하나를 옵션 목록으로. 쉼표·줄바꿈만 구분자. */
export function splitOptionText(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value.split(SEPARATOR).map((item) => item.trim()).filter(Boolean);
}

/**
 * DB에서 읽은 옵션 값을 목록으로.
 *  · 배열이면 «원소 하나 = 옵션 하나». 다시 쪼개지 않는다.
 *      ← 예전엔 배열 원소까지 다시 쪼개서, 관리자가 「XS/S」로 저장해도
 *        손님 화면에서 「XS」「S」로 갈라졌다. 그게 이번 버그의 직접 원인이다.
 *  · 문자열이면 쉼표·줄바꿈으로 나눈다.
 */
export function toOptionList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  return splitOptionText(value);
}

/** 중복 제거(순서 유지) */
export function uniqueOptions(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}
