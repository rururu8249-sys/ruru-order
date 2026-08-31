// ── [2026-08-31 사장님 지시] 주문 옵션 표시 공용 규칙 ──
//   "없음 / 6" 처럼 곧이곧대로 나오지 않게: 없음 계열은 숨기고, 사이즈는 「사이즈 6」으로.
//   둘 다 없으면 빈 문자열(표시 안 함). 관리자 등록추가 3단 상품은 색상 칸이
//   "세부상품 / 없음" 형태라 색상 칸 안의 없음 조각도 걸러낸다.
//   ⚠️ 표시 전용 — 주문 데이터·재고·금액·매칭 로직 어디에도 쓰지 않는다.

const NONE_VALUES = new Set([
  "없음", "없슴", "색상없음", "사이즈없음", "옵션없음",
  "x", "X", "-", "none", "None", "NONE",
]);

function cleanPart(value: unknown): string {
  return String(value ?? "").trim();
}

function isNone(value: string): boolean {
  return NONE_VALUES.has(value);
}

// 색상/사이즈 → 사람이 읽기 좋은 옵션 문구. 예:
//   ("베이지", "6")                          → "베이지 / 사이즈 6"
//   ("없음", "6")                            → "사이즈 6"
//   ("BB(버버리)-69 트렌치코트 / 없음", "6")   → "BB(버버리)-69 트렌치코트 / 사이즈 6"
//   ("없음", "없음") 또는 둘 다 빈 값          → ""
export function formatOrderOptionText(color: unknown, size: unknown): string {
  const colorParts = cleanPart(color)
    .split(" / ")
    .map((part) => part.trim())
    .filter((part) => part && !isNone(part));
  const sizeValue = cleanPart(size);
  const parts = [...colorParts];
  if (sizeValue && !isNone(sizeValue)) parts.push(`사이즈 ${sizeValue}`);
  return parts.join(" / ");
}

// 옛 데이터의 optionText("없음 / 6", "옵션 없음" 등)에서 없음 조각만 걷어낸다(라벨 추가 없음).
export function stripNoneOptionParts(optionText: unknown): string {
  const raw = cleanPart(optionText);
  if (!raw || raw === "옵션 없음") return "";
  return raw
    .split(" / ")
    .map((part) => part.trim())
    .filter((part) => part && !isNone(part))
    .join(" / ");
}
