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

function brandMonogram(brandEn: string) {
  const normalized = brandEn.trim().toUpperCase();
  const known: Record<string, string> = {
    BURBERRY: "B",
    CHANEL: "CC",
    DIOR: "D",
    "MIU MIU": "M",
    PRADA: "P",
    GUCCI: "G",
    HERMES: "H",
    LOEWE: "L",
    "LOUIS VUITTON": "LV",
    MONCLER: "M",
    "OTHER BRANDS": "◆",
  };
  if (known[normalized]) return known[normalized];
  const words = normalized.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((word) => word[0]).join("") : normalized.slice(0, 2)) || "B";
}

export function brandWordmarkThumbnail(brandEn: string, brandKo: string) {
  const rawEnglish = String(brandEn || brandKo || "BRAND").trim().toUpperCase();
  const rawKorean = normalizeBrandKorean(String(brandKo || "브랜드"));
  const english = escapeXml(rawEnglish);
  const korean = escapeXml(rawKorean);
  const monogram = escapeXml(brandMonogram(rawEnglish));
  const englishSize = rawEnglish.length >= 12 ? 70 : rawEnglish.length >= 9 ? 76 : 84;
  const fittedWidth = rawEnglish.length >= 12 ? 520 : rawEnglish.length >= 9 ? 500 : 0;
  const fitAttributes = fittedWidth > 0 ? ` textLength="${fittedWidth}" lengthAdjust="spacingAndGlyphs"` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdfb"/><stop offset="1" stop-color="#f4e9ed"/></linearGradient>
      <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#922452"/><stop offset="1" stop-color="#651633"/></linearGradient>
    </defs>
    <rect width="800" height="800" rx="72" fill="url(#bg)"/>
    <rect x="42" y="42" width="716" height="716" rx="48" fill="none" stroke="#7a1e47" stroke-width="5"/>
    <circle cx="400" cy="225" r="88" fill="url(#mark)"/>
    <circle cx="400" cy="225" r="69" fill="none" stroke="#f7dfe8" stroke-width="3"/>
    <line x1="275" y1="225" x2="315" y2="225" stroke="#7a1e47" stroke-width="4"/>
    <line x1="485" y1="225" x2="525" y2="225" stroke="#7a1e47" stroke-width="4"/>
    <text x="400" y="229" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-family="Georgia,Times New Roman,serif" font-size="${monogram.length > 1 ? 52 : 66}" font-weight="700" letter-spacing="${monogram.length > 1 ? 2 : 0}">${monogram}</text>
    <text x="400" y="405" text-anchor="middle" dominant-baseline="middle" fill="#2f2026" font-family="Georgia,Times New Roman,serif" font-size="${englishSize}" font-weight="700" letter-spacing="5"${fitAttributes}>${english}</text>
    <line x1="255" y1="495" x2="545" y2="495" stroke="#7a1e47" stroke-width="4"/>
    <text x="400" y="575" text-anchor="middle" dominant-baseline="middle" fill="#7a1e47" font-family="Arial,Noto Sans KR,sans-serif" font-size="42" font-weight="700" letter-spacing="4">${korean}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
