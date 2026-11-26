// [2026-11-26 전면 리뉴얼 VER 3] 손님 화면 색 테마 — 관리자 설정 › 주문서 표시 «손님 화면 테마».
//   settings customer_theme 한 칸: "basic"(따뜻한 흰+초록, 기본) / "winter"(겨울·크리스마스).
//   색·장식만 바꾼다 — 담기·금액·주문 제출 무관. 브라우저에서 ?preview=tb·tc·notheme 를 직접 고른 경우 그 고른 값이 우선.
export const CUSTOMER_THEME_KEY = "customer_theme";
export type CustomerTheme = "basic" | "winter";
export type CustomerThemeAttr = "" | "b" | "winter";

export function parseCustomerTheme(value: unknown): CustomerTheme {
  return String(value ?? "").trim() === "winter" ? "winter" : "basic";
}

/** 화면에 붙일 data-ruru-theme 값. explicit = 이 브라우저가 ?preview= 로 직접 고른 적 있음. */
export function resolveCustomerThemeAttr(setting: CustomerTheme, explicit: boolean, previewTb: boolean, previewTc: boolean): CustomerThemeAttr {
  if (explicit) return previewTc ? "winter" : previewTb ? "b" : "";
  return setting === "winter" ? "winter" : "b";
}
