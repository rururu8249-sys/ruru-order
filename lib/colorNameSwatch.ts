// [㉜ 2026-10-18] 색 이름 → 색 점 자동 색(표시 전용). DESIGN.md §4-2.
//   관리자가 색(hex)을 지정하지 않은 색상이라도 흔한 이름이면 정해 둔 색으로 «동그란 색 점»을 그린다.
//   관리자 지정 색이 있으면 그게 우선(호출부에서 먼저 확인). 코드 같은 이름(「GY-1(바게트)」·「H-3」)은 null → 글씨 칩.
//   ⚠ 이름이 «정확히» 같을 때만(공백·대소문자 무시). 「블랙/화이트 스트라이프」처럼 섞인 이름은 색을 지어내지 않는다.
//   주문·재고·금액·옵션 저장값과 무관 — 화면 표시만.

const NAME_TO_HEX: Record<string, string> = {
  블랙: "#111111", 검정: "#111111", 검정색: "#111111", black: "#111111",
  화이트: "#FFFFFF", 흰색: "#FFFFFF", 화이트색: "#FFFFFF", white: "#FFFFFF",
  오프화이트: "#F7F4EC", offwhite: "#F7F4EC",
  아이보리: "#FFFBEA", ivory: "#FFFBEA",
  크림: "#F6EBCB", cream: "#F6EBCB",
  그레이: "#8E8E93", 회색: "#8E8E93", grey: "#8E8E93", gray: "#8E8E93",
  라이트그레이: "#C9C9CB", 연그레이: "#C9C9CB", lightgrey: "#C9C9CB", lightgray: "#C9C9CB",
  다크그레이: "#55555A", 진그레이: "#55555A", darkgrey: "#55555A", darkgray: "#55555A",
  멜란지: "#B5B5B8", melange: "#B5B5B8",
  차콜: "#3A3D42", charcoal: "#3A3D42",
  네이비: "#1F2A44", 남색: "#1F2A44", navy: "#1F2A44",
  베이지: "#D8C3A0", beige: "#D8C3A0",
  오트밀: "#D9CCB2", oatmeal: "#D9CCB2",
  카멜: "#B98A55", camel: "#B98A55",
  브라운: "#6B4423", 갈색: "#6B4423", brown: "#6B4423",
  모카: "#7B5B45", mocha: "#7B5B45",
  카키: "#6B6B3A", khaki: "#6B6B3A",
  올리브: "#6E7B3A", olive: "#6E7B3A",
  그린: "#2E7D4F", 초록: "#2E7D4F", green: "#2E7D4F",
  민트: "#9ED9C7", mint: "#9ED9C7",
  블루: "#2B5FB4", 파랑: "#2B5FB4", blue: "#2B5FB4",
  스카이블루: "#8CC8EA", 하늘색: "#8CC8EA", 하늘: "#8CC8EA", skyblue: "#8CC8EA",
  소라: "#A9C9E8", 소라색: "#A9C9E8",
  연청: "#8FAAC9", 진청: "#2D3E5C", 데님: "#4A6A8A", denim: "#4A6A8A",
  레드: "#C8102E", 빨강: "#C8102E", red: "#C8102E",
  와인: "#722F37", wine: "#722F37", 버건디: "#800020", burgundy: "#800020",
  핑크: "#F2A7BB", pink: "#F2A7BB", 연핑크: "#F7CFD9", 인디핑크: "#D9A3A3",
  퍼플: "#7B4FA0", 보라: "#7B4FA0", purple: "#7B4FA0",
  라벤더: "#B9A3DA", lavender: "#B9A3DA",
  옐로우: "#F2C94C", 노랑: "#F2C94C", 옐로: "#F2C94C", yellow: "#F2C94C",
  머스타드: "#D4A23A", mustard: "#D4A23A",
  오렌지: "#F28C28", 주황: "#F28C28", orange: "#F28C28",
  실버: "#C0C0C4", silver: "#C0C0C4",
  골드: "#C9A44C", gold: "#C9A44C",
};

const keyOf = (name: unknown) => String(name ?? "").trim().toLowerCase().replace(/\s+/g, "");

/** 흔한 색 이름이면 그 색(hex), 아니면 null(글씨 칩으로). */
export function colorNameSwatch(name: unknown): string | null {
  const key = keyOf(name);
  if (!key || key === "없음" || key === "기본") return null;
  const exact = NAME_TO_HEX[key];
  if (exact) return exact;
  // [2026-10-23] 「크림(베이지)」처럼 «색 이름(색 이름)» — 앞 이름 먼저, 모르면 괄호 안 이름.
  //   코드 같은 앞 이름(숫자 포함, 「GY-1(블랙)」)은 지금처럼 글씨 칩.
  const m = /^([^()]+)\(([^()]+)\)$/.exec(key);
  if (!m) return null;
  const [, outer, inner] = m;
  if (NAME_TO_HEX[outer]) return NAME_TO_HEX[outer];
  if (/\d/.test(outer)) return null;
  return NAME_TO_HEX[inner] ?? null;
}

/** 밝은 색(흰 바탕에서 안 보이는 색) — 색 점에 hairline 테두리를 붙일지 판단. */
export function isLightSwatch(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.8;
}

export type ColorDisplayItem = { label: string; hex: string | null };

/**
 * 색상 하나씩 표시 방법 결정(DESIGN.md §4): ① 관리자 지정 색 → ② 이름표 자동 색 → ③ 글씨 칩(hex null).
 * 「없음」·빈 값은 뺀다. 같은 색상은 한 번만(점 또는 칩 중 하나).
 */
export function resolveColorDisplay(labels: readonly string[], adminSwatches: Record<string, string | null | undefined>): ColorDisplayItem[] {
  const seen = new Set<string>();
  const out: ColorDisplayItem[] = [];
  for (const raw of labels) {
    const label = String(raw ?? "").trim();
    if (!label || label === "없음" || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, hex: adminSwatches[label] || colorNameSwatch(label) });
  }
  return out;
}
