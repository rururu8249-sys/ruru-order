import { BRAND_LOGO_ARTWORK, OTHER_BRAND_MEMBERS } from "./brandLogoArtwork";

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] || character);
}

export function normalizeBrandKorean(value: string) {
  return String(value || "").trim().replaceAll("몽클레르", "몽클레어");
}

function normalizeEnglishKey(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function fittedText(value: string, maxWidth: number, baseSize: number, minimumSize: number) {
  const estimatedWidth = Math.max(1, value.length) * baseSize * 0.68;
  const fontSize = Math.max(minimumSize, Math.min(baseSize, Math.floor((maxWidth / estimatedWidth) * baseSize)));
  const stillTooWide = value.length * fontSize * 0.68 > maxWidth;
  return {
    fontSize,
    fit: stillTooWide ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : "",
  };
}

function artworkImage(english: string, x: number, y: number, width: number, height: number) {
  const artwork = BRAND_LOGO_ARTWORK[normalizeEnglishKey(english)];
  if (!artwork) return "";
  return `<image href="${artwork}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
}

function otherBrandsBoard() {
  const cells = OTHER_BRAND_MEMBERS.map((brand, index) => {
    const row = Math.floor(index / 2);
    const isLast = index === OTHER_BRAND_MEMBERS.length - 1;
    const x = isLast ? 239 : 68 + (index % 2) * 342;
    const y = 150 + row * 143;
    return `<g>
      <rect x="${x}" y="${y}" width="322" height="126" rx="22" fill="#fff" stroke="#ead9df" stroke-width="2"/>
      ${artworkImage(brand.english, x + 24, y + 14, 274, 66)}
      <line x1="${x + 86}" y1="${y + 84}" x2="${x + 236}" y2="${y + 84}" stroke="#ead9df" stroke-width="2"/>
      <text x="${x + 161}" y="${y + 103}" text-anchor="middle" dominant-baseline="middle" fill="#7a1e47" font-family="Arial,Noto Sans KR,sans-serif" font-size="18" font-weight="800">${escapeXml(brand.korean)}</text>
    </g>`;
  }).join("");

  return `<text x="400" y="84" text-anchor="middle" dominant-baseline="middle" fill="#2f2026" font-family="Georgia,Times New Roman,serif" font-size="32" font-weight="700" letter-spacing="4">BRAND COLLECTION</text>
    <text x="400" y="119" text-anchor="middle" dominant-baseline="middle" fill="#7a1e47" font-family="Arial,Noto Sans KR,sans-serif" font-size="23" font-weight="800">기타브랜드 · 7개 브랜드</text>
    ${cells}`;
}

export function brandWordmarkThumbnail(brandEn: string, brandKo: string) {
  const rawEnglish = String(brandEn || brandKo || "BRAND").trim().toUpperCase();
  const rawKorean = normalizeBrandKorean(String(brandKo || "브랜드"));
  const englishKey = normalizeEnglishKey(rawEnglish);
  const isOtherBrands = englishKey === "OTHER BRANDS" || rawKorean === "기타브랜드";
  const english = escapeXml(rawEnglish);
  const korean = escapeXml(rawKorean);
  const artworkContainsName = new Set([
    "CHANEL", "DIOR", "MIU MIU", "PRADA", "GUCCI", "HERMES", "MONCLER",
    "BRUNELLO CUCINELLI", "CELINE", "CHLOE", "SAINT LAURENT", "BOTTEGA VENETA", "ZEGNA", "ACNE STUDIOS",
  ]).has(englishKey);
  const englishFit = fittedText(rawEnglish, 570, 68, 39);
  const koreanFit = fittedText(rawKorean, 520, 43, 31);
  const mainContent = artworkContainsName
    ? `<rect x="110" y="118" width="580" height="340" rx="40" fill="#fff" stroke="#ead9df" stroke-width="2"/>
      ${artworkImage(rawEnglish, 165, 153, 470, 270)}
      <line x1="250" y1="522" x2="550" y2="522" stroke="#7a1e47" stroke-width="4"/>
      <text x="400" y="605" text-anchor="middle" dominant-baseline="middle" fill="#7a1e47" font-family="Arial,Noto Sans KR,sans-serif" font-size="${koreanFit.fontSize}" font-weight="800" letter-spacing="2"${koreanFit.fit}>${korean}</text>`
    : `<rect x="145" y="100" width="510" height="270" rx="36" fill="#fff" stroke="#ead9df" stroke-width="2"/>
      ${artworkImage(rawEnglish, 205, 125, 390, 220)}
      <text x="400" y="458" text-anchor="middle" dominant-baseline="middle" fill="#2f2026" font-family="Georgia,Times New Roman,serif" font-size="${englishFit.fontSize}" font-weight="700" letter-spacing="2"${englishFit.fit}>${english}</text>
      <line x1="235" y1="530" x2="565" y2="530" stroke="#7a1e47" stroke-width="4"/>
      <text x="400" y="615" text-anchor="middle" dominant-baseline="middle" fill="#7a1e47" font-family="Arial,Noto Sans KR,sans-serif" font-size="${koreanFit.fontSize}" font-weight="800" letter-spacing="2"${koreanFit.fit}>${korean}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdfb"/><stop offset="1" stop-color="#f4e9ed"/></linearGradient></defs>
    <rect width="800" height="800" rx="72" fill="url(#bg)"/>
    <rect x="42" y="42" width="716" height="716" rx="48" fill="none" stroke="#7a1e47" stroke-width="5"/>
    ${isOtherBrands ? otherBrandsBoard() : mainContent}
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
