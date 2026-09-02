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

const ARTWORK_ZOOM: Record<string, number> = {
  BURBERRY: 1.68,
  CHANEL: 0.84,
  DIOR: 1.5,
  // MIU MIU는 마지막 U 획이 우측에 붙지 않도록 전용 여백을 둔다.
  "MIU MIU": 1.58,
  // PRADA도 긴 워드마크라 양끝 획이 답답해 보이지 않도록 전용 여백을 둔다.
  PRADA: 1.62,
  GUCCI: 0.84,
  HERMES: 0.84,
  LOEWE: 0.84,
  "LOUIS VUITTON": 0.86,
  // MONCLER 원본은 정사각 캔버스 안에 긴 워드마크가 들어 있어 공통 확대율이면 M/R 끝이 잘린다.
  MONCLER: 1.58,
  "BRUNELLO CUCINELLI": 1.06,
  CELINE: 1.9,
  CHLOE: 1.05,
  "SAINT LAURENT": 1.04,
  "BOTTEGA VENETA": 1.9,
  ZEGNA: 1.04,
  "ACNE STUDIOS": 1.04,
};

function artworkImage(english: string, x: number, y: number, width: number, height: number) {
  const key = normalizeEnglishKey(english);
  const artwork = BRAND_LOGO_ARTWORK[key];
  if (!artwork) return "";
  const zoom = ARTWORK_ZOOM[key] || 1;
  const zoomedWidth = width * zoom;
  const zoomedHeight = height * zoom;
  const offsetX = (width - zoomedWidth) / 2;
  const offsetY = (height - zoomedHeight) / 2;
  // 원본 로고 파일 상당수가 1:1 흰 캔버스 안에 작은 글자만 들어 있다.
  // 중첩 SVG로 실제 표시 영역을 확대·클리핑해 모바일에서도 로고 크기를 일정하게 맞춘다.
  return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" overflow="hidden">
    <image href="${artwork}" x="${offsetX}" y="${offsetY}" width="${zoomedWidth}" height="${zoomedHeight}" preserveAspectRatio="xMidYMid meet"/>
  </svg>`;
}

function otherBrandsBoard() {
  const cells = OTHER_BRAND_MEMBERS.map((brand, index) => {
    const row = Math.floor(index / 2);
    const isLast = index === OTHER_BRAND_MEMBERS.length - 1;
    const x = isLast ? 239 : 68 + (index % 2) * 342;
    const y = 150 + row * 143;
    return `<g>
      <rect x="${x}" y="${y}" width="322" height="126" rx="22" fill="#fff" stroke="#ead9df" stroke-width="2"/>
      ${artworkImage(brand.english, x + 18, y + 9, 286, 76)}
      <line x1="${x + 76}" y1="${y + 88}" x2="${x + 246}" y2="${y + 88}" stroke="#ead9df" stroke-width="2"/>
      <text x="${x + 161}" y="${y + 108}" text-anchor="middle" dominant-baseline="middle" fill="#7a1e47" font-family="Arial,Noto Sans KR,sans-serif" font-size="19" font-weight="800">${escapeXml(brand.korean)}</text>
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
  const englishFit = fittedText(rawEnglish, 620, 76, 43);
  const koreanFit = fittedText(rawKorean, 600, 52, 38);
  const mainContent = artworkContainsName
    ? `<rect x="70" y="78" width="660" height="420" rx="42" fill="#fff" stroke="#ead9df" stroke-width="2"/>
      ${artworkImage(rawEnglish, 100, 103, 600, 370)}
      <line x1="210" y1="558" x2="590" y2="558" stroke="#7a1e47" stroke-width="4"/>
      <text x="400" y="650" text-anchor="middle" dominant-baseline="middle" fill="#7a1e47" font-family="Arial,Noto Sans KR,sans-serif" font-size="${koreanFit.fontSize}" font-weight="800" letter-spacing="2"${koreanFit.fit}>${korean}</text>`
    : `<rect x="82" y="70" width="636" height="370" rx="40" fill="#fff" stroke="#ead9df" stroke-width="2"/>
      ${artworkImage(rawEnglish, 125, 88, 550, 330)}
      <text x="400" y="510" text-anchor="middle" dominant-baseline="middle" fill="#2f2026" font-family="Georgia,Times New Roman,serif" font-size="${englishFit.fontSize}" font-weight="700" letter-spacing="2"${englishFit.fit}>${english}</text>
      <line x1="205" y1="578" x2="595" y2="578" stroke="#7a1e47" stroke-width="4"/>
      <text x="400" y="665" text-anchor="middle" dominant-baseline="middle" fill="#7a1e47" font-family="Arial,Noto Sans KR,sans-serif" font-size="${koreanFit.fontSize}" font-weight="800" letter-spacing="2"${koreanFit.fit}>${korean}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdfb"/><stop offset="1" stop-color="#f4e9ed"/></linearGradient></defs>
    <rect width="800" height="800" rx="72" fill="url(#bg)"/>
    <rect x="42" y="42" width="716" height="716" rx="48" fill="none" stroke="#7a1e47" stroke-width="5"/>
    ${isOtherBrands ? otherBrandsBoard() : mainContent}
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}


// ── [2026-09-03 사장님 요청] 사진 없는 상품용 자동 썸네일 ──
//   인터넷 사진 수집은 저작권 위험(실사례)으로 채택 안 함. 대신 카테고리에 맞는
//   일러스트 + 상품코드 글자를 자동 생성한다 (사장님 확정: "신발이면 신발 일러스트 느낌").
//   표시 전용 — 저장 안 함. 사진을 올리면 자연히 교체된다.

// 카테고리별 선화 일러스트 (240×240 좌표계, 딥로즈 선)
// 카테고리 단어가 없거나 못 알아들으면 상품명 단어로도 추측한다 (지갑→잡화, 가디건→의류 …)
function categoryIllustration(category: string, nameHint?: string): string {
  const c = `${String(category || "")} ${String(nameHint || "")}`.toLowerCase();
  const S = 'fill="none" stroke="#7a1e47" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"';
  if (/신발|슈즈|운동화|스니커|구두|로퍼|부츠|샌들|슬리퍼|힐|shoe/.test(c)) {
    return `<path ${S} d="M35 158 C35 146 47 137 62 134 L95 128 C115 124 124 103 144 97 C168 90 199 116 202 147 L203 160 C203 169 196 176 187 176 L50 176 C41 176 35 168 35 158 Z"/>
      <path ${S} d="M100 127 L112 140 M118 121 L130 134 M136 113 L148 126"/>
      <path ${S} d="M35 160 L203 160"/>`;
  }
  if (/화장품|립스틱|립밤|립오일|틴트|메이크업|쿠션|팩트|섀도|마스카라|스킨|로션|크림|세럼|앰플|코스메/.test(c)) {
    return `<rect ${S} x="92" y="122" width="56" height="80" rx="10"/>
      <rect ${S} x="101" y="100" width="38" height="22" rx="5"/>
      <path ${S} d="M108 100 L108 66 C108 56 132 56 132 66 L132 100"/>`;
  }
  if (/향수|퍼퓸|오드|바디미스트|perfume|edp|edt/.test(c)) {
    return `<rect ${S} x="80" y="98" width="80" height="102" rx="16"/>
      <rect ${S} x="104" y="76" width="32" height="22" rx="4"/>
      <rect ${S} x="98" y="46" width="44" height="30" rx="8"/>
      <path ${S} d="M96 132 C110 120 130 120 144 132"/>`;
  }
  if (/캔들|디퓨저|차량/.test(c)) {
    return `<rect ${S} x="82" y="108" width="76" height="92" rx="12"/>
      <path ${S} d="M120 108 L120 92"/>
      <path ${S} d="M120 46 C132 62 134 74 120 84 C106 74 108 62 120 46 Z"/>`;
  }
  if (/잡화|가방|백팩|토트|숄더|크로스|클러치|파우치|지갑|벨트|스카프|머플러|장갑|양말|모자|캡|시계|주얼리|목걸이|반지|귀걸이|악세|액세/.test(c)) {
    return `<path ${S} d="M62 112 L178 112 L169 194 C168 200 163 204 157 204 L83 204 C77 204 72 200 71 194 Z"/>
      <path ${S} d="M88 112 C88 72 152 72 152 112"/>
      <circle ${S} cx="120" cy="150" r="10"/>`;
  }
  if (/의류|옷|상의|하의|아우터|니트|가디건|코트|자켓|재킷|패딩|셔츠|블라우스|맨투맨|후드|티셔츠|청바지|데님|팬츠|스커트|원피스|트렌치|점퍼|조끼|베스트/.test(c)) {
    return `<path ${S} d="M62 66 L96 46 C106 62 134 62 144 46 L178 66 L164 100 L146 90 L146 198 L94 198 L94 90 L76 100 Z"/>`;
  }
  // 기본: 가격표(태그)
  return `<path ${S} d="M76 132 L140 68 C145 63 152 61 158 62 L186 67 C193 69 197 75 196 82 L192 110 C191 116 188 121 184 125 L120 189 C113 196 103 196 96 189 L76 169 C69 162 69 152 76 145 Z"/>
    <circle ${S} cx="164" cy="90" r="9"/>`;
}

// 상품명(+카테고리) → 자동 썸네일 SVG 데이터 URI. "MIU-201" 코드는 크게, 나머지 이름은 아래 줄.
export function productNameThumbnail(productName: string, category?: string) {
  const raw = String(productName || "상품").trim() || "상품";
  const codeMatch = raw.match(/([A-Za-z]+)(?:\([^)]*\))?-(\d+[A-Za-z]*)/);
  const big = codeMatch ? `${codeMatch[1].toUpperCase()}-${codeMatch[2].toUpperCase()}` : raw.split(/\s+/)[0].slice(0, 10);
  const rest = codeMatch
    ? raw.replace(codeMatch[0], "").replace(/\s+/g, " ").trim()
    : raw.split(/\s+/).slice(1).join(" ").trim();
  const restShort = rest.length > 16 ? `${rest.slice(0, 15)}…` : rest;
  const bigFit = fittedText(big, 520, 78, 40);
  const restFit = fittedText(restShort || " ", 560, 48, 28);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdfb"/><stop offset="1" stop-color="#f4e9ed"/></linearGradient></defs>
    <rect width="800" height="800" rx="72" fill="url(#bg)"/>
    <rect x="42" y="42" width="716" height="716" rx="48" fill="none" stroke="#7a1e47" stroke-width="5"/>
    <rect x="100" y="96" width="600" height="356" rx="40" fill="#fff" stroke="#ead9df" stroke-width="2"/>
    <g transform="translate(180, 114) scale(1.83)">${categoryIllustration(String(category || ""), raw)}</g>
    <text x="400" y="530" text-anchor="middle" dominant-baseline="middle" fill="#7a1e47" font-family="Georgia,Times New Roman,serif" font-size="${bigFit.fontSize}" font-weight="700" letter-spacing="2"${bigFit.fit}>${escapeXml(big)}</text>
    ${restShort ? `<line x1="240" y1="586" x2="560" y2="586" stroke="#7a1e47" stroke-width="4"/>
    <text x="400" y="648" text-anchor="middle" dominant-baseline="middle" fill="#2f2026" font-family="Arial,Noto Sans KR,sans-serif" font-size="${restFit.fontSize}" font-weight="800"${restFit.fit}>${escapeXml(restShort)}</text>` : ""}
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
