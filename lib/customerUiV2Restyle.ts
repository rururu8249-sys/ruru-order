// [㉜ 2단계 2026-10-18] 손님화면 새 모양(ui=v2) — 기존 인라인 스타일을 DESIGN.md 팔레트·글자 규칙으로 바꾸는 순수 함수.
//   옵션 창처럼 스타일이 수백 곳인 화면에서 «하나씩 손으로» 바꾸면 빠뜨리기 쉬워, 규칙 하나로 일관되게 바꾼다.
//   핵심 부품(옵션 카드·색 점·담기 버튼 등)은 화면 코드에서 DESIGN.md 그대로 따로 그린다 — 이 함수는 나머지 정리용.
//   규칙: ① 로즈·자주·갈색 등 → 밝기에 따라 ink(#111111)·charcoal(#39393B)·mute(#707072)·soft-cloud(#F5F5F5)·hairline(#CACACB)
//         ② 빨강 글자 → sale(#D30005) (빨강은 바탕·테두리에 쓰지 않음 → 회색 계열)
//         ③ 글씨 13px 미만 → 13px, 굵기 800·900 → 700 ④ 안쪽 요소 그림자 없음.
//   스위치 꺼진 손님에게는 쓰이지 않는다(호출부가 uiV2 일 때만 부름). 표시 전용.
import type { CSSProperties } from "react";

const KEEP = new Set(["#FFFFFF", "#111111", "#F5F5F5", "#39393B", "#707072", "#CACACB", "#E5E5E5", "#D30005", "#007D48", "#1151FF"]);

function toHex6(raw: string): string | null {
  const t = raw.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(t)) return "#" + t.split("").map((c) => c + c).join("").toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(t)) return "#" + t.toUpperCase();
  return null;
}

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function isStrongRed([r, g, b]: [number, number, number]): boolean {
  return r > 150 && r - Math.max(g, b) > 70;
}

type Role = "text" | "fill" | "line" | "sep";

/** 색 하나를 DESIGN.md 팔레트로. */
export function mapColorV2(hexLike: string, role: Role): string {
  const hex = toHex6(hexLike);
  if (!hex) return hexLike;
  if (KEEP.has(hex)) return hex;
  const rgb = rgbOf(hex);
  const y = luminance(rgb);
  if (role === "text") {
    if (isStrongRed(rgb)) return "#D30005";
    if (y >= 0.88) return "#FFFFFF";
    // 채도 있는 강조색(옛 로즈·초록·갈색 강조 글자)은 진한 쪽이면 ink — 강조였던 자리는 강조(검정)로 남긴다.
    const chroma = Math.max(...rgb) - Math.min(...rgb);
    if (chroma > 60 && y < 0.45) return "#111111";
    if (y < 0.22) return "#111111";
    if (y < 0.33) return "#39393B";
    return "#707072";
  }
  if (role === "line") { // 칩·카드·입력칸 둘레 — 보여야 하는 선
    if (y >= 0.55) return "#CACACB";
    return "#111111";
  }
  if (role === "sep") { // 한쪽 구분선
    if (y >= 0.8) return "#E5E5E5";
    if (y >= 0.55) return "#CACACB";
    return "#111111";
  }
  // fill
  if (y >= 0.97) return "#FFFFFF";
  if (y >= 0.82) return "#F5F5F5";
  if (y >= 0.6) return "#CACACB";
  return "#111111";
}

const COLOR_KEYS: Record<string, Role> = {
  color: "text",
  background: "fill",
  backgroundColor: "fill",
  border: "line",
  borderColor: "line",
  borderTop: "sep",
  borderBottom: "sep",
  borderLeft: "sep",
  borderRight: "sep",
  outline: "line",
  textDecorationColor: "text",
  accentColor: "text",     // 체크박스·라디오 색
  caretColor: "text",
  outlineColor: "line",
};

function recolorString(value: string, role: Role): string {
  return value
    // 8자리(#RRGGBBAA, 예: `${관리자색}0D`) — 앞 6자리만 바꾸고 투명도는 그대로
    .replace(/#([0-9a-fA-F]{6})([0-9a-fA-F]{2})\b/g, (_m, rgb: string, alpha: string) => mapColorV2("#" + rgb, role) + alpha)
    .replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (m) => mapColorV2(m, role))
    .replace(/rgba\(\s*122\s*,\s*30\s*,\s*71\s*,/g, "rgba(17,17,17,")
    .replace(/rgba\(\s*52\s*,\s*20\s*,\s*31\s*,/g, "rgba(17,17,17,");
}

/** 인라인 스타일 하나를 새 모양으로(원본은 그대로 두고 새 객체). */
export function restyleV2(style: CSSProperties | undefined, options: { keepShadow?: boolean } = {}): CSSProperties | undefined {
  if (!style) return style;
  const out: Record<string, unknown> = { ...style };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === "string" && COLOR_KEYS[key]) out[key] = recolorString(value, COLOR_KEYS[key]);
    if (key === "fontSize") {
      const n = typeof value === "number" ? value : parseFloat(String(value));
      if (Number.isFinite(n) && n < 13) out[key] = typeof value === "number" ? 13 : "13px";
    }
    if (key === "fontWeight" && (value === 800 || value === 900 || value === "800" || value === "900")) out[key] = 700;
    if (key === "boxShadow" && typeof value === "string" && value !== "none" && options.keepShadow !== true) out[key] = "none";
  }
  return out as CSSProperties;
}

/** 화면 장식 이모지 빼기(DESIGN.md §9-2) — 글자 내용은 그대로, 앞뒤 공백 정리. 🏠 로고·관리자가 쓴 내용은 호출부에서 제외. */
export function stripDecorativeEmojiV2(text: string): string {
  return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, "").replace(/\s{2,}/g, " ").replace(/^\s*·\s*|\s*·\s*$/g, "").trim();
}

// ── [㉜ 5단계] Tailwind 클래스판 — 손님 창(시트·팝업)에 흩어진 클래스 색·글씨를 DESIGN.md 로 한 번에 정리 ──
//   출력 클래스는 app/globals.css 의 @source inline(…) 에 미리 등록해 둔 것만 나온다(JIT 가 생성하도록).
//   규칙: 로즈·코랄·분홍·파랑·보라·주황·노랑 → ink/charcoal/mute/soft-cloud/hairline, 빨강 글자·테두리 → sale, 초록 → success,
//         13px 미만·text-xs → 13px, font-black/extrabold → font-bold, 그림자 → shadow-none(떠 있는 창은 keepShadow).
//         회색(slate·gray 등)·흰색·크기·간격 클래스는 그대로.
const ACCENT_FAMILIES = new Set(["rose", "coral", "pink", "fuchsia", "blue", "sky", "indigo", "violet", "purple", "orange", "amber", "yellow", "lime", "cyan"]);
const COLOR_PREFIX = /^(text|bg|border(?:-[trblxy])?|ring|from|via|to|accent|outline|divide|decoration|placeholder|caret|fill|stroke)-(.+)$/;

function shadeIsLight(token: string): boolean {
  if (/^(soft|line|light|50|100|200|300)$/.test(token)) return true;
  if (/^\d+$/.test(token)) return Number(token) <= 300;
  return false; // deep·dark·400 이상
}

function mapNamedColor(prefix: string, family: string, shade: string): string | null {
  const light = shadeIsLight(shade);
  const role = prefix === "text" || prefix === "placeholder" || prefix === "caret" || prefix === "decoration" ? "text"
    : prefix === "bg" || prefix === "from" || prefix === "via" || prefix === "to" ? "fill"
    : prefix === "accent" || prefix === "fill" || prefix === "stroke" ? "accent" : "line";
  if (family === "red") {
    if (role === "text" || role === "line" || role === "accent") return "#D30005";
    return light ? "#F5F5F5" : "#111111";
  }
  if (family === "green" || family === "emerald" || family === "teal") {
    if (role === "text") return "#007D48";
    if (role === "fill") return light ? "#E6F4EC" : "#111111";
    return light ? "#CACACB" : "#007D48";
  }
  if (!ACCENT_FAMILIES.has(family)) return null;
  if (role === "text") return light ? "#707072" : "#111111";
  if (role === "fill") return light ? "#F5F5F5" : "#111111";
  if (role === "accent") return "#111111";
  return light ? "#CACACB" : "#111111";
}

function restyleUtilityV2(utility: string, keepShadow: boolean): string {
  const size = utility.match(/^text-\[(\d+(?:\.\d+)?)px\]$/);
  if (size) return Number(size[1]) < 13 ? "text-[13px]" : utility;
  if (utility === "text-xs" || utility === "text-[10px]") return "text-[13px]";
  if (utility === "font-black" || utility === "font-extrabold") return "font-bold";
  if (utility === "uppercase") return "normal-case"; // DESIGN §10 대문자 변환 없음
  if (/^shadow(-.+)?$/.test(utility) && utility !== "shadow-none") return keepShadow ? utility : "shadow-none";
  const m = utility.match(COLOR_PREFIX);
  if (!m) return utility;
  const prefix = m[1].startsWith("border") ? "border" : m[1];
  const rest = m[2].replace(/\/\d+$/, "");
  const hex = rest.match(/^\[(#[0-9a-fA-F]{3,6})\]$/);
  if (hex) {
    const role = prefix === "text" || prefix === "placeholder" || prefix === "caret" || prefix === "decoration" || prefix === "accent" ? "text"
      : prefix === "bg" || prefix === "from" || prefix === "via" || prefix === "to" ? "fill" : "line";
    return `${m[1]}-[${mapColorV2(hex[1], role)}]`;
  }
  const named = rest.match(/^([a-z]+)-([a-z0-9]+)$/);
  if (!named) return utility;
  const out = mapNamedColor(prefix, named[1], named[2]);
  return out ? `${m[1]}-[${out}]` : utility;
}

/** className 문자열 하나를 새 모양으로. 변형(hover: 등)은 앞에 그대로 붙인다. */
export function restyleClassV2(className: string | undefined, options: { keepShadow?: boolean } = {}): string | undefined {
  if (!className) return className;
  return className.split(/\s+/).filter(Boolean).map((token) => {
    const cut = token.lastIndexOf(":");
    const variant = cut >= 0 ? token.slice(0, cut + 1) : "";
    const base = cut >= 0 ? token.slice(cut + 1) : token;
    const important = base.startsWith("!") ? "!" : "";
    return variant + important + restyleUtilityV2(important ? base.slice(1) : base, options.keepShadow === true);
  }).join(" ");
}
