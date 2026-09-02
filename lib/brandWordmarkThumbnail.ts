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


// ── [2026-09-03 사장님 확정] 사진 없는 상품용 자동 썸네일 (v3 — 정식 무료 일러스트) ──
//   v1 손그림("뭔지 모르겠다")·v2 이모지("이모지 말고 제대로") 폐기.
//   Microsoft Fluent 플랫 일러스트(MIT 라이선스, lib/productThumbnailArt.ts에 내장)를 합성한다.
//   규칙: ① 상품 종류 단어 먼저(트렌치코트→코트, 청바지→청바지, 립→립스틱 …)
//        ② 없으면 브랜드 사전(롱샴→가방, 뉴발란스·미즈노·아식스→운동화, 이솝→향수 …)
//        ③ 그래도 모르면 쇼핑백. 표시 전용 — 사진을 올리면 자연히 교체.

import { PRODUCT_THUMB_ART } from "./productThumbnailArt";

type ThumbArt = { main: string; sub?: string };
const THUMB_RULES: Array<[RegExp, ThumbArt]> = [
  // 특수 — 랜덤박스 = 박스 + 물음표 (사장님 확정)
  [/랜덤|럭키박스|복불복/, { main: "box", sub: "help" }],
  // 의류 — 종류별 전부 다른 그림
  [/패딩|잠바|점퍼|다운(?![가-힣])/, { main: "clothes-windbreaker" }],
  [/트렌치|코트/, { main: "women-coat" }],
  [/바람막이|윈드브레이커|아노락/, { main: "clothes-windbreaker" }],
  [/자켓|재킷|블레이저|무스탕|가죽자켓/, { main: "clothes-suit" }],
  [/가디건/, { main: "clothes-cardigan" }],
  [/니트|스웨터|터틀넥|목폴라|폴라티/, { main: "clothes-turtleneck" }],
  [/후드|맨투맨|스웨트/, { main: "clothes-hoodie" }],
  [/조끼|베스트/, { main: "vest" }],
  [/티셔츠|반팔|카라티|폴로|티(?![가-힣])/, { main: "t-shirt" }],
  [/셔츠|블라우스|남방/, { main: "clothes-suit" }],
  [/긴팔|롱슬리브/, { main: "clothes-crew-neck" }],
  [/트레이닝|조거|스웨트팬츠/, { main: "clothes-pants-sweat" }],
  [/반바지|쇼츠/, { main: "clothes-pants-short" }],
  [/와이드팬츠|부츠컷|나팔/, { main: "trousers-bell-bottoms" }],
  [/청바지|데님|팬츠|바지|슬랙스|레깅스/, { main: "clothes-pants" }],
  [/원피스|드레스|투피스/, { main: "full-dress-longuette" }],
  [/스커트|치마/, { main: "short-skirt" }],
  [/상의|의류|여성복|옷(?![가-힣])/, { main: "clothes-crew-neck" }],
  // 신발
  [/힐(?![가-힣])|하이힐|펌프스/, { main: "high-heeled-shoes" }],
  [/부츠|워커|어그|앵클/, { main: "boots" }],
  [/샌들|슬리퍼|쪼리|뮬|로퍼|플랫|단화/, { main: "slippers" }],
  [/운동화|스니커|러닝화|조깅화|구두|신발|슈즈/, { main: "spikedshoes" }],
  // 식음료 먼저 — "티백"이 가방(백)으로 오인되지 않게
  [/차(?![가-힣])|티백|녹차|홍차|커피/, { main: "tea-drink" }],
  // 가방 — 여성 가방 기본은 둥근 손잡이 토트
  [/백팩|배낭/, { main: "backpack" }],
  [/크로스백|미니백/, { main: "the-single-shoulder-bag" }],
  [/클러치|파우치/, { main: "handbag" }],
  [/가방|토트|숄더|백(?![가-힣])|버킷백/, { main: "shoulder-bag" }],
  // 잡화
  [/지갑|카드지갑/, { main: "wallet" }],
  [/벨트/, { main: "belt" }],
  [/넥타이/, { main: "necktie" }],
  [/선글라스|안경/, { main: "glasses" }],
  [/양말|스타킹/, { main: "socks" }],
  [/장갑/, { main: "clothes-gloves" }],
  [/비니|털모자/, { main: "woolen-hat" }],
  [/버킷햇|밀짚|벙거지/, { main: "straw-hat" }],
  [/모자|볼캡|캡(?![가-힣])/, { main: "baseball-cap" }],
  [/시계|워치/, { main: "watch" }],
  [/목걸이|네크리스/, { main: "diamond-necklace" }],
  [/반지|링(?![가-힣])/, { main: "diamond-ring" }],
  [/귀걸이|팔찌|주얼리|악세|액세/, { main: "jewelry" }],
  [/우산|양산/, { main: "umbrella" }],
  [/머플러|스카프|숄(?![가-힣])/, { main: "towel" }],
  [/거울/, { main: "mirror" }],
  // 뷰티·생활
  [/립스틱|립밤|립오일|틴트|립(?![가-힣])|립 /, { main: "lipstick" }],
  [/향수|퍼퓸|오드|바디미스트|edp|edt/, { main: "perfume" }],
  [/핸드크림/, { main: "hand-cream" }],
  [/마스크팩|팩(?![가-힣])/, { main: "facial-mask" }],
  [/브러시|메이크업/, { main: "cosmetic-brush" }],
  [/화장품|크림|스킨|로션|세럼|앰플|쿠션|팩트|섀도|마스카라|클렌징|선크림|코스메/, { main: "lotion" }],
  [/캔들|디퓨저|방향제/, { main: "spa-candle" }],
  [/선물|기프트/, { main: "gift" }],
  [/아이스크림|젤라또/, { main: "icecream" }],
  [/쿠키|과자|간식|초콜릿|음식|식품/, { main: "snacks" }],
  // 브랜드 사전 — 종류 단어가 없을 때만
  [/롱샴|롱샹/, { main: "shoulder-bag" }],
  [/뉴발란스|뉴발|미즈노|브룩스|아식스|나이키|아디다스|크록스|컨버스|반스|호카|살로몬|푸마|리복/, { main: "spikedshoes" }],
  [/이솝|딥디크|딥티크|조말론|바이레도|산타마리아|마르지엘라/, { main: "perfume" }],
];

function productThumbArt(category: string, nameHint: string): ThumbArt {
  const c = `${String(category || "")} ${String(nameHint || "")}`.toLowerCase();
  for (const [re, art] of THUMB_RULES) if (re.test(c)) return art;
  return { main: "" }; // 미인식 — 엉뚱한 그림 대신 글자만 크게
}

// (전수조사·테스트용) 이 상품이 어떤 그림으로 매칭되는지 키를 돌려준다. "shopping-bags" = 미인식 기본값.
export function productThumbArtKey(productName: string, category?: string): string {
  return productThumbArt(String(category || ""), String(productName || "")).main; // "" = 미인식(글자만)
}

// 상품명(+카테고리) → 자동 썸네일 SVG 데이터 URI. 일러스트 크게 + "MIU-201" 코드 + 이름.
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
  const art = productThumbArt(String(category || ""), raw);
  const mainBody = art.main ? PRODUCT_THUMB_ART[art.main] || "" : "";
  const subBody = art.sub ? PRODUCT_THUMB_ART[art.sub] || "" : "";
  const bigBig = fittedText(big, 560, 110, 48); // 미인식(그림 없음)일 때 글자를 더 크게
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdfb"/><stop offset="1" stop-color="#f4e9ed"/></linearGradient></defs>
    <rect width="800" height="800" rx="72" fill="url(#bg)"/>
    <rect x="42" y="42" width="716" height="716" rx="48" fill="none" stroke="#7a1e47" stroke-width="5"/>
    ${mainBody ? `<g transform="translate(208, 76) scale(8)">${mainBody}</g>
    ${subBody ? `<g transform="translate(504, 60) scale(3.6)">${subBody}</g>` : ""}
    <text x="400" y="530" text-anchor="middle" dominant-baseline="middle" fill="#7a1e47" font-family="Georgia,Times New Roman,serif" font-size="${bigFit.fontSize}" font-weight="700" letter-spacing="2"${bigFit.fit}>${escapeXml(big)}</text>
    ${restShort ? `<line x1="240" y1="586" x2="560" y2="586" stroke="#7a1e47" stroke-width="4"/>
    <text x="400" y="648" text-anchor="middle" dominant-baseline="middle" fill="#2f2026" font-family="Arial,Noto Sans KR,sans-serif" font-size="${restFit.fontSize}" font-weight="800"${restFit.fit}>${escapeXml(restShort)}</text>` : ""}`
    : `<text x="400" y="330" text-anchor="middle" dominant-baseline="middle" fill="#7a1e47" font-family="Georgia,Times New Roman,serif" font-size="${bigBig.fontSize}" font-weight="700" letter-spacing="2"${bigBig.fit}>${escapeXml(big)}</text>
    ${restShort ? `<line x1="220" y1="430" x2="580" y2="430" stroke="#7a1e47" stroke-width="4"/>
    <text x="400" y="520" text-anchor="middle" dominant-baseline="middle" fill="#2f2026" font-family="Arial,Noto Sans KR,sans-serif" font-size="${restFit.fontSize}" font-weight="800"${restFit.fit}>${escapeXml(restShort)}</text>` : ""}`}
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
