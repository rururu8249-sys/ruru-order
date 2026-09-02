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


// ── [2026-09-03 사장님 확정] 사진 없는 상품용 자동 썸네일 (v5 — 사장님 생성 일러스트 35종) ──
//   사장님이 챗지피티로 직접 생성한 일러스트 시트를 낱개로 잘라 public/thumbs/auto/*.png 에 내장.
//   (v1 손그림·v2 이모지·v3~4 아이콘 세트 전부 폐기 — 사장님 확정 그림만 사용)
//   규칙: ① 상품 종류 단어 우선 ② 브랜드 사전(롱샴→가방, 뉴발란스→운동화, 이솝→향수)
//        ③ 못 알아들으면 그림 없이 상품명 글자 카드. 표시 전용 — 사진 올리면 자연히 교체.
//   ⚠️ 한글에는 정규식 \b가 안 먹는다 — 단어 끝 경계는 반드시 (?![가-힣]) 사용.

const AUTO_THUMB_RULES: Array<[RegExp, string]> = [
  // 특수
  [/랜덤|럭키박스|복불복/, "randombox"],
  // 식품·생활 (— "티백"이 가방(백)으로 오인되지 않게 가방보다 먼저)
  [/라면|컵라면/, "ramen"],
  [/음료|생수|드링크|주스|커피|차(?![가-힣])|티백|녹차|홍차/, "drink"],
  [/과자|스낵|쿠키|간식|초콜릿|빵(?![가-힣])/, "snack"],
  [/세제|세탁|섬유유연|퐁퐁|샴푸|바디워시/, "detergent"],
  [/휴지|티슈|생활용품|주방용품|욕실/, "daily"],
  // 가방(백팩) 먼저 — "백팩"의 "팩"이 스킨케어(팩)로 오인되지 않게
  [/백팩|배낭/, "backpack"],
  // 뷰티
  [/립스틱|립밤|립오일|립글로스|틴트|립(?![가-힣])/, "cosmetics"],
  [/향수|퍼퓸|오드|바디미스트|edp|edt/, "perfume"],
  [/마스크팩|스킨케어|스킨(?![가-힣])|로션|크림|세럼|앰플|토너|클렌징|선크림|팩(?![가-힣])/, "skincare"],
  [/화장품|쿠션|팩트|섀도|마스카라|메이크업|블러셔|아이라이너|코스메/, "cosmetics"],
  [/캔들|디퓨저|방향제|인센스/, "candle"],
  // 의류 — 구체적인 단어 먼저
  [/패딩|잠바|점퍼|다운(?![가-힣])|바람막이|아노락|조끼|베스트/, "padding"],
  [/트렌치|코트|자켓|재킷|블레이저|무스탕/, "trench"],
  [/가디건/, "cardigan"],
  [/니트|스웨터|터틀넥|목폴라|폴라티/, "knit"],
  [/후드|맨투맨|스웨트셔츠/, "hoodie"],
  [/티셔츠|반팔|긴팔|카라티|폴로|티(?![가-힣])/, "tshirt"],
  [/셔츠|블라우스|남방/, "blouse"],
  [/원피스|드레스|투피스/, "dress"],
  [/스커트|치마/, "skirt"],
  [/청바지|데님|팬츠|바지|슬랙스|레깅스|트레이닝|조거|반바지|쇼츠/, "jeans"],
  [/상의|하의|의류|여성복|옷(?![가-힣])/, "tshirt"],
  // 신발
  [/힐(?![가-힣])|하이힐|펌프스|로퍼|플랫슈즈|단화|구두|샌들|슬리퍼|쪼리|뮬(?![가-힣])/, "heels"],
  [/부츠|워커|어그|앵클/, "boots"],
  [/운동화|스니커|러닝화|조깅화|신발|슈즈/, "sneakers"],
  // 가방
  [/지갑|카드지갑/, "wallet"],
  [/가방|토트|숄더|크로스백|클러치|파우치|버킷백|백(?![가-힣])/, "bag"],
  // 잡화
  [/모자|볼캡|비니|버킷햇|캡(?![가-힣])/, "cap"],
  [/시계|워치/, "watch"],
  [/목걸이/, "necklace"],
  [/귀걸이/, "earrings"],
  [/헤어핀|곱창밴드|스크런치|머리끈|헤어(?![가-힣])|헤어악세/, "hairacc"],
  [/반지|팔찌|발찌|주얼리|키링|벨트|넥타이|양말|스타킹|악세|액세/, "acc"],
  [/목도리|머플러|스카프|숄(?![가-힣])/, "scarf"],
  [/장갑/, "gloves"],
  [/선글라스|안경/, "sunglasses"],
  // 브랜드 사전 — 종류 단어가 없을 때만 여기까지 내려온다
  [/롱샴|롱샹/, "bag"],
  [/뉴발란스|뉴발(?![가-힣])|미즈노|브룩스|아식스|나이키|아디다스|크록스|컨버스|반스|호카|살로몬|푸마|리복/, "sneakers"],
  [/이솝|딥디크|딥티크|조말론|바이레도|마르지엘라|산타마리아/, "perfume"],
];

// (전수조사·테스트용) 어떤 그림 파일로 매칭되는지. "" = 미인식(글자 카드).
export function productThumbArtKey(productName: string, category?: string): string {
  const c = `${String(category || "")} ${String(productName || "")}`.toLowerCase();
  for (const [re, key] of AUTO_THUMB_RULES) if (re.test(c)) return key;
  return "";
}

// 사진 없는 상품의 자동 썸네일 이미지 주소. 못 알아들으면 "" (글자 카드 사용).
export function productAutoThumbUrl(productName: string, category?: string): string {
  const key = productThumbArtKey(productName, category);
  return key ? `/thumbs/auto/${key}.png` : "";
}

// 미인식 상품용 글자 카드(SVG) — 상품코드/이름만 크게. 엉뚱한 그림은 안 붙인다.
export function productNameThumbnail(productName: string, category?: string) {
  void category;
  const raw = String(productName || "상품").trim() || "상품";
  const codeMatch = raw.match(/([A-Za-z]+)(?:\([^)]*\))?-(\d+[A-Za-z]*)/);
  const big = codeMatch ? `${codeMatch[1].toUpperCase()}-${codeMatch[2].toUpperCase()}` : raw.split(/\s+/)[0].slice(0, 10);
  const rest = codeMatch
    ? raw.replace(codeMatch[0], "").replace(/\s+/g, " ").trim()
    : raw.split(/\s+/).slice(1).join(" ").trim();
  const restShort = rest.length > 16 ? `${rest.slice(0, 15)}…` : rest;
  const bigFit = fittedText(big, 560, 110, 48);
  const restFit = fittedText(restShort || " ", 560, 48, 28);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdfb"/><stop offset="1" stop-color="#f4e9ed"/></linearGradient></defs>
    <rect width="800" height="800" rx="72" fill="url(#bg)"/>
    <rect x="42" y="42" width="716" height="716" rx="48" fill="none" stroke="#e5b8c6" stroke-width="4"/>
    <text x="400" y="330" text-anchor="middle" dominant-baseline="middle" fill="#7a1e47" font-family="Georgia,Times New Roman,serif" font-size="${bigFit.fontSize}" font-weight="700" letter-spacing="2"${bigFit.fit}>${escapeXml(big)}</text>
    ${restShort ? `<line x1="220" y1="430" x2="580" y2="430" stroke="#e5b8c6" stroke-width="4"/>
    <text x="400" y="520" text-anchor="middle" dominant-baseline="middle" fill="#2f2026" font-family="Arial,Noto Sans KR,sans-serif" font-size="${restFit.fontSize}" font-weight="800"${restFit.fit}>${escapeXml(restShort)}</text>` : ""}
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
