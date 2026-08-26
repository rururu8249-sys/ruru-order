function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] || character);
}

export function brandWordmarkThumbnail(brandEn: string, brandKo: string) {
  const english = escapeXml(String(brandEn || brandKo || "BRAND").trim().toUpperCase());
  const korean = escapeXml(String(brandKo || "브랜드").trim());
  const englishSize = english.length >= 14 ? 62 : english.length >= 10 ? 76 : 92;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdfb"/><stop offset="1" stop-color="#f4e9ed"/></linearGradient></defs>
    <rect width="800" height="800" rx="72" fill="url(#bg)"/>
    <rect x="42" y="42" width="716" height="716" rx="48" fill="none" stroke="#7a1e47" stroke-width="5"/>
    <text x="400" y="375" text-anchor="middle" dominant-baseline="middle" fill="#2f2026" font-family="Georgia,Times New Roman,serif" font-size="${englishSize}" font-weight="700" letter-spacing="8">${english}</text>
    <line x1="245" y1="470" x2="555" y2="470" stroke="#7a1e47" stroke-width="4"/>
    <text x="400" y="545" text-anchor="middle" dominant-baseline="middle" fill="#7a1e47" font-family="Arial,Noto Sans KR,sans-serif" font-size="42" font-weight="700" letter-spacing="4">${korean}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
