// lib/chatOrderParser.ts
// [2026-08-14] 채팅 주문 파싱 — 순수 함수 (DB 접근 없음, 테스트 가능).
//   2단계 범위: 주문 의도 / 상품 / 수량까지만 확정. 옵션은 "후보 토큰"만 뽑는다.
//   옵션(색상·사이즈·조합형 세부상품)은 상품마다 축이 달라 여기서 확정하지 않는다.
//   ⚠️ 확신 없으면 담지 않는다. 후보가 2개 이상이면 ambiguous로 내려보낸다.
//   ⚠️ 돈·재고·주문 로직 무접촉. 문자열만 다룬다.

export type ParseProduct = {
  id: string;
  name: string;          // 등록 상품명. 앞 번호 포함 가능 ("3. 룰루레몬 차지필로우")
  // 조합형(combo_mode) 상품의 세부상품명. products.color_options 배열을 그대로 넣는다.
  //   예: ["킬리안 엔젤스쉐어 온더락", "킬리안 굿걸", "킬리안 돈비샤이", ...]
  //   여기가 맞으면 옵션 1단 축까지 확정된다.
  variants?: string[];
  aliases?: string[];    // 그 밖의 추가 명칭
  colors?: string[];     // 비조합형 상품의 등록 색상 목록 ("깔 저요" = 전 색상 주문에 필요)
  sizes?: string[];      // 비조합형 상품의 등록 사이즈 목록
};

export type ParseStatus =
  | "parsed"        // 상품 특정됨 → 대기열 후보
  | "need_product"  // 주문 같은데 상품을 모름 (「지금 이거」도 없음)
  | "ambiguous"     // 상품 후보가 2개 이상
  | "not_order";    // 주문 아님

export type ParseResult = {
  status: ParseStatus;
  productId: string | null;
  productName: string | null;
  matchedBy: "number" | "name" | "variant" | "current" | null;
  variantName: string | null;   // 조합형 세부상품이 특정됐으면 그 이름
  qty: number;
  optionTokens: string[];
  // 한 채팅에 여러 건: "블랙, 화이트 저요"=2건 / "블랙 미듐, 엑라"=2건 / "깔 저요"=전 색상.
  //   항상 1개 이상. 단건이면 [{color,size,qty}] 하나.
  items: { color: string | null; size: string | null; qty: number }[];
  candidates: string[];
  reason: string;
};

// ── 사전 ──────────────────────────────────────────────
const ORDER_WORDS = ["주문", "저요", "저용", "저여", "ㅈㅇ", "주세요", "주새요", "줘요", "주십시오", "살게요", "살께요", "구매", "담아", "담아주세요", "예약"];
const QUESTION_WORDS = ["언제", "얼마", "얼만", "뭐", "무엇", "어디", "어떻게", "왜", "있나요", "있어요",
  "되나요", "가능한가요", "인가요", "될까요", "인가여", "가요", "나요", "까요", "런가", "맞나", "어때", "어떤",
  "추천", "문의", "가격", "얼마에", "실측", "몇", "사이즈는", "재질", "소재", "무게", "총장", "총기장", "기장", "길이", "품절"];
const GREETINGS = ["안녕", "하이", "감사", "고마", "수고", "잘자", "잘가", "축하", "화이팅", "파이팅", "ㅎㅇ", "ㅇㅇ", "ㅋㅋ", "ㅎㅎ"];

const KO_NUM: Record<string, number> = {
  한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4,
  다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
};

// [2026-08-14 사장님 지시] 종류(카테고리) 유사어 — 손님의 상식 단어("가방")를 상품명 단어("토트백")와
//   같은 증거로 친다. 같은 그룹 안에서만, 그리고 상품명 조각이 그 단어로 끝날 때("단톤모자"←"모자")도 인정.
const CATEGORY_SYNONYMS: string[][] = [
  ["가방", "토트백", "백팩", "크로스백", "숄더백", "에코백", "클러치", "파우치"],
  ["모자", "캡", "볼캡", "비니", "버킷햇", "벙거지", "스냅백"],
  ["신발", "운동화", "스니커즈", "슈즈", "샌들", "슬리퍼", "로퍼", "부츠"],
  ["바지", "팬츠", "슬랙스"],
  ["반팔", "반팔티", "반팔티셔츠"],
  ["긴팔", "긴팔티", "긴팔티셔츠"],
  ["향수", "퍼퓸"],
];
// 신발 "상위어" — 상품명에 없는 큰 분류로만 말한 경우("신발 250"). 방송에 신발이 여러 개면 확정하지 않는다.
const SHOE_TOP_WORDS = new Set(["신발", "운동화", "스니커즈", "슈즈", "슬리퍼", "구두", "부츠", "로퍼", "샌들"]);
const isShoeSize = (v: string) => /^\d{3}$/.test(String(v).trim()) && Number(v) >= 200 && Number(v) <= 310;

function categoryHit(sw: string, sp: string): boolean {
  for (const g of CATEGORY_SYNONYMS) {
    if (!g.includes(sw)) continue;
    for (const syn of g) if (sp === syn || (sp.length > syn.length && sp.endsWith(syn))) return true;
  }
  return false;
}

// [2026-08-15 사장님 지시] 영문 상품명을 한글 발음으로 불러도 인식한다.
//   "젤NYC" → "젤엔와이씨" / "GLYCERIN MAX" → "글리세린맥스". 등록은 그대로 두고 매칭만 넓힌다.
const ALPHA_KO: Record<string, string> = {
  a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지", h: "에이치", i: "아이",
  j: "제이", k: "케이", l: "엘", m: "엠", n: "엔", o: "오", p: "피", q: "큐", r: "알",
  s: "에스", t: "티", u: "유", v: "브이", w: "더블유", x: "엑스", y: "와이", z: "제트",
};
const WORD_KO: Record<string, string> = {
  nyc: "엔와이씨", ny: "엔와이", max: "맥스", wave: "웨이브", gel: "젤", air: "에어", zoom: "줌",
  pro: "프로", new: "뉴", era: "에라", zip: "집", up: "업", plus: "플러스", mini: "미니",
  one: "원", two: "투", set: "세트", free: "프리", size: "사이즈", black: "블랙", white: "화이트",
  blue: "블루", red: "레드", pink: "핑크", gray: "그레이", grey: "그레이", green: "그린",
  brown: "브라운", beige: "베이지", cream: "크림", silver: "실버", gold: "골드", navy: "네이비",
  run: "런", city: "시티", star: "스타", club: "클럽", line: "라인", sport: "스포츠",
  // 브랜드·품목 (영문으로 등록해도 손님이 한글로 부르면 잡히게)
  nike: "나이키", adidas: "아디다스", puma: "푸마", asics: "아식스", brooks: "브룩스",
  mizuno: "미즈노", hoka: "호카", salomon: "살로몬", crocs: "크록스", birkenstock: "버켄스탁",
  lululemon: "룰루레몬", danton: "단톤", newera: "뉴에라", longchamp: "롱샴", gucci: "구찌",
  chanel: "샤넬", dior: "디올", prada: "프라다", diptyque: "딥티크", jomalone: "조말론",
  glycerin: "글리세린", prophecy: "프로페시", trail: "트레일", sandal: "샌들", sandals: "샌들",
  jacket: "자켓", coat: "코트", tweed: "트위드", leather: "레더", denim: "데님", knit: "니트",
  shirt: "셔츠", pants: "팬츠", bag: "백", tote: "토트", cap: "캡", shoes: "슈즈",
  perfume: "퍼퓸", candle: "캔들", box: "박스", limited: "리미티드",
};
// 이름 안의 영문 덩어리를 한글 발음으로 바꾼 변형들 (단어사전 / 낱자읽기)
function koreanReadings(name: string): string[] {
  const chunks = String(name).match(/[a-zA-Z]{1,12}/g);
  if (!chunks || chunks.length === 0) return [];
  const byWord = String(name).replace(/[a-zA-Z]{1,12}/g, (m) => WORD_KO[m.toLowerCase()] || m);
  const bySpell = String(name).replace(/[a-zA-Z]{1,12}/g, (m) =>
    m.toLowerCase().split("").map((c) => ALPHA_KO[c] || c).join(""));
  // 사전에 없는 영문이 남으면 그것만 낱자로 읽어 섞은 변형도 만든다 ("NIKE AIR" → "나이키에이아이알")
  const mixed = byWord.replace(/[a-zA-Z]{1,12}/g, (m) =>
    m.toLowerCase().split("").map((c) => ALPHA_KO[c] || c).join(""));
  const out = [byWord, bySpell, mixed].filter((v) => v && v !== name && !/[a-zA-Z]/.test(v));
  return Array.from(new Set(out));
}

const COLOR_WORDS = [
  "블랙", "검정", "검은", "깜장", "까망", "까만", "black",
  "화이트", "흰색", "하양", "white",
  "그레이", "회색", "gray", "grey",
  "네이비", "곤색", "navy",
  "베이지", "beige", "아이보리", "ivory", "크림", "cream",
  "브라운", "갈색", "brown", "카키", "khaki",
  "레드", "빨강", "red", "블루", "파랑", "파란", "blue",
  "그린", "초록", "green", "핑크", "분홍", "pink",
  "옐로", "노랑", "yellow", "퍼플", "보라", "purple",
  "실버", "골드", "은색", "금색",
];

const SIZE_WORDS = [
  "xs", "s", "m", "l", "xl", "xxl", "2xl", "3xl",
  "엠", "에스", "엘", "라지", "스몰", "미듐", "미디움", "미디엄", "라아지",
  "엑라", "엑스라지", "투엑라", "쓰리엑라",
  "프리", "free", "원사이즈",
];

// "없음/무/-" 같은 빈 옵션 표기는 세부상품명이 아니다. 로더에서도 거르지만
//   파서는 순수 함수라 어디서 호출돼도 안전하도록 여기서도 막는다.
const EMPTY_OPTION_WORDS = new Set(["없음", "없슴", "무", "-", "none", "n/a", "na"]);

// 색상 동의어 그룹 — 손님이 "검정"이라 쳐도 등록명이 "블랙"이면 그걸로 매핑
const COLOR_SYNONYM_GROUPS: string[][] = [
  ["블랙", "검정", "검은", "깜장", "까망", "까만", "black"],
  ["화이트", "흰색", "하양", "white"],
  ["그레이", "회색", "gray", "grey", "챠콜", "차콜"],
  ["네이비", "곤색", "navy"],
  ["베이지", "beige"], ["아이보리", "ivory"], ["크림", "cream"],
  ["브라운", "갈색", "brown"], ["카키", "khaki"],
  ["레드", "빨강", "red"], ["블루", "파랑", "파란", "blue"],
  ["그린", "초록", "green"], ["핑크", "분홍", "pink"],
  ["옐로", "노랑", "yellow"], ["퍼플", "보라", "purple"],
  ["실버", "은색"], ["골드", "금색"],
];
function sameColorWord(a: string, b: string): boolean {
  const x = a.toLowerCase(), y = b.toLowerCase();
  if (x === y) return true;
  return COLOR_SYNONYM_GROUPS.some((g) => g.includes(x) && g.includes(y));
}
// 손님 색상 토큰 → 그 상품의 등록 색상명 (동의어·오타 허용). 못 찾으면 원문 유지.
function mapToRegisteredColor(token: string, registered: string[]): string {
  for (const r of registered) {
    const rr = String(r).trim();
    if (!rr) continue;
    if (sameColorWord(token, rr) || squash(token) === squash(rr) || looseEqual(squash(token), squash(rr))) return rr;
  }
  // [2026-08-15 검수] 등록명이 손님 말을 품고 있으면 그 등록명으로 (실버→실버블랙, 그레이→다크그레이).
  //   재고·송장이 등록명 기준이라 여기서 맞춰두지 않으면 재고 매칭이 어긋난다. 후보가 둘 이상이면 포기(원문 유지).
  const tk = squash(token);
  if (tk.length >= 2) {
    const syn = COLOR_SYNONYM_GROUPS.find((g) => g.includes(token.toLowerCase())) || [token.toLowerCase()];
    const hit = registered.filter((r) => syn.some((w) => squash(r).includes(squash(w))));
    if (hit.length === 1) return String(hit[0]).trim();
  }
  return token;
}

// "깔 저요" = 전 색상 주문 신호
const ALL_COLORS_WORDS = new Set(["깔", "깔별", "깔별로", "색깔별", "색깔별로", "컬러별", "컬러별로", "전색상", "전컬러", "색상별", "색상별로"]);

// [2026-08-14 사장님 지침] 한 채팅에 여러 건 확장:
//   "화이트 블랙 그레이 저요" → 색상별 1건씩 / "블랙 미듐, 엑라" → 사이즈별 1건씩(색상 공유)
//   "깔 저요" → 등록 색상 전부 1건씩. 수량을 말했으면 각 건에 동일 적용.
function expandItems(
  text: string,
  optionTokens: string[],
  qty: number,
  p: ParseProduct | null
): { color: string | null; size: string | null; qty: number }[] {
  const registeredColors = (p?.colors || []).map((x) => String(x).trim()).filter((x) => x && !EMPTY_OPTION_WORDS.has(x.toLowerCase()));
  const words = text.split(/[^a-z0-9가-힣]+/).filter(Boolean);
  const wantAllColors = words.some((w) => ALL_COLORS_WORDS.has(w));

  const colorTokens: string[] = [];
  const sizeTokens: string[] = [];
  for (const t of optionTokens) {
    const isColor = COLOR_WORDS.includes(t) || registeredColors.some((r) => sameColorWord(t, r) || squash(r) === squash(t));
    if (isColor) { if (!colorTokens.some((x) => sameColorWord(x, t))) colorTokens.push(t); continue; }
    sizeTokens.push(t);
  }
  // [2026-08-15 검수] 등록명으로 맞춘 뒤 중복 제거 — "화이트로고블랙"이 화이트·블랙으로도 잡혀
  //   같은 색이 여러 건으로 늘어나던 사고 차단.
  const mappedColors = Array.from(new Set(colorTokens.map((t) => mapToRegisteredColor(t, registeredColors))));

  if (wantAllColors && registeredColors.length > 0) {
    return registeredColors.map((c) => ({ color: c, size: sizeTokens[0] ?? null, qty }));
  }
  if (mappedColors.length > 1) {
    return mappedColors.map((c) => ({ color: c, size: sizeTokens[0] ?? null, qty }));
  }
  if (sizeTokens.length > 1) {
    return sizeTokens.map((sz) => ({ color: mappedColors[0] ?? null, size: sz, qty }));
  }
  return [{ color: mappedColors[0] ?? null, size: sizeTokens[0] ?? null, qty }];
}

// ── 유틸 ──────────────────────────────────────────────
const norm = (v: unknown) =>
  String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();

// 매칭용: 공백·괄호·기호 제거
const squash = (v: unknown) =>
  String(v ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

// 상품명 앞의 번호 접두 추출 ("3. 몽글니트" / "3.몽글니트" / "3 몽글니트" → 3)
export function productLeadingNumber(name: string): number | null {
  const m = String(name || "").trim().match(/^(\d{1,3})\s*[.)\]:\-]?\s+?/) || String(name || "").trim().match(/^(\d{1,3})\s*[.)\]:]/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : null;
}

// 상품명에서 번호 접두를 뗀 본문
function nameBody(name: string): string {
  return String(name || "").replace(/^\s*\d{1,3}\s*[.)\]:\-]?\s*/, "").trim();
}

function extractQty(text: string): { qty: number; consumed: string[] } {
  const consumed: string[] = [];
  // 1) "2개", "2 개", "2장", "2벌"
  const m1 = text.match(/(\d{1,2})\s*(개|장|벌|족|켤레|병|세트|셋트)/);
  if (m1) {
    consumed.push(m1[0]);
    return { qty: Math.max(1, Math.min(99, Number(m1[1]))), consumed };
  }
  // 2) 한글 수사 + 단위 ("두개", "하나요", "세벌")
  for (const [word, n] of Object.entries(KO_NUM)) {
    const re = new RegExp(word + "\\s*(개|장|벌|족|켤레|병|세트)");
    const m = text.match(re);
    if (m) { consumed.push(m[0]); return { qty: n, consumed }; }
  }
  // 3) "하나요" 처럼 단위 없이 쓰는 경우 — 반드시 독립된 단어일 때만.
  //    ("셋업"의 "셋", "하나로"의 "하나" 같은 단어 조각을 수량으로 오인하면 안 된다)
  for (const w of text.split(/[^가-힣]+/)) {
    const m3 = w.match(/^(하나|둘|셋|넷|다섯)(요|개요)?$/);
    if (m3) { consumed.push(w); return { qty: KO_NUM[m3[1]] || 1, consumed }; }
  }
  return { qty: 1, consumed };
}

function extractOptionTokens(text: string, consumed: string[], registeredColors: string[] = [], registeredSizes: string[] = []): string[] {
  let rest = text;
  for (const c of consumed) rest = rest.replace(c, " ");
  rest = rest.replace(/(\d{1,3})\s*번/g, " ");   // 상품번호 제거
  const out: string[] = [];
  // [2026-08-15 검수·사고방지] 등록 색상명을 먼저 통째로 집어내고 지운다.
  //   안 그러면 "실버블랙"이 "실버"+"블랙" 두 색으로 쪼개져 주문이 2건으로 늘어난다.
  //   사전에 없는 등록 색상(카멜·브라이트 등)도 이 경로로 인식된다.
  for (const rc of [...registeredColors].sort((a, b) => String(b).length - String(a).length)) {
    const r = String(rc).trim();
    if (r.length < 2) continue;
    const rs = squash(r);
    if (!rs) continue;
    if (squash(rest).includes(rs)) {
      out.push(r);
      // 원문에서 제거 (괄호 등 표기 차이를 감안해 느슨하게)
      const re = new RegExp(r.split("").map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "gi");
      rest = rest.replace(re, " ");
    }
  }
  for (const w of COLOR_WORDS) if (rest.includes(w)) out.push(w);
  // 사이즈 단어는 단독 토큰일 때만 (예: "m"이 "메종" 안에 걸리지 않게)
  for (const token0 of rest.split(/[^a-z0-9가-힣]+/).filter(Boolean)) {
    // "55사이즈" "250mm" "240미리" "웨이브250이요" — 붙어 있는 숫자를 꺼내 사이즈로 본다
    const token = token0.replace(/(사이즈|사이즈로|미리|mm|밀리|호|요|이요|짜리)$/g, "") || token0;
    if (SIZE_WORDS.includes(token)) { out.push(token); continue; }
    // [2026-08-16] 숫자는 "등록된 사이즈"일 때만 사이즈로 본다 — 닉네임 숫자(박시계79)·키·몸무게 오인 방지
    if (/^\d{2,3}$/.test(token)) {
      if (registeredSizes.length > 0) { if (registeredSizes.includes(token)) out.push(token); continue; }
      if (token.length === 3) { out.push(token); continue; }
      if (Number(token) >= 44 && Number(token) <= 120) { out.push(token); continue; }
    }
    const m = token0.match(/(\d{2,3})(?:사이즈|미리|mm|밀리|호|요|이요|짜리)?$/);
    if (m) {
      const n = Number(m[1]);
      // 등록 사이즈가 있으면 그 목록에 있는 값만 (닉네임 뒤 숫자 "박시계79" 오인 방지)
      if (registeredSizes.length > 0) { if (registeredSizes.includes(m[1])) { out.push(m[1]); continue; } }
      else if ((m[1].length === 3 && n >= 200 && n <= 310) || (m[1].length === 2 && n >= 44 && n <= 120)) { out.push(m[1]); continue; }
    }
    // [2026-08-15 검수] 말끝까지 다 붙여 쓴 경우("막스코트카멜55저요") — 토큰 안쪽 숫자도 본다.
    //   오인 방지를 위해 "등록된 사이즈 값과 정확히 같은 숫자"만 인정한다.
    if (registeredSizes.length > 0) {
      for (const g of token0.match(/\d{2,3}/g) || []) if (registeredSizes.includes(g)) out.push(g);
    }
  }
  return Array.from(new Set(out));
}

// ── 표기 흔들림(딥티크/딥디크) 허용 ─────────────────────
//   한글 자모로 쪼개 한 글자 차이까지만 같은 말로 본다.
//   ⚠️ 안전장치 3개: (1) 한글만 (숫자·용량·호수는 절대 흔들면 안 됨)
//                   (2) 첫 글자가 같아야 함 (마스크↔머스크 차단)
//                   (3) 자모 6개 이상인 긴 단어만
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONG = "_ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
const HANGUL_ONLY = /^[가-힣]+$/;

function toJamo(v: string): string {
  let out = "";
  for (const c of v) {
    const k = c.charCodeAt(0) - 0xac00;
    if (k >= 0 && k < 11172) {
      out += CHO[Math.floor(k / 588)] + JUNG[Math.floor((k % 588) / 28)];
      const t = k % 28;
      if (t) out += JONG[t];
    } else out += c;
  }
  return out;
}

function isEditDistanceOne(a: string, b: string): boolean {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 1) return false;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let k = 1; k <= n; k += 1) {
      cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n] === 1;
}

function looseEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (!HANGUL_ONLY.test(a) || !HANGUL_ONLY.test(b)) return false;
  const ja = toJamo(a), jb = toJamo(b);
  if (ja.length < 6 || jb.length < 6) return false;
  return isEditDistanceOne(ja, jb);
}

// ── 앞머리(브랜드/카테고리) ─────────────────────────────
//   세부상품명은 [앞머리 + 세부] 로 등록돼 있다. (예: "샤넬 블루드 10ml", "크림 라메르크림 100ml")
//   손님이 앞머리를 말했으면, 다른 앞머리의 세부상품은 애초에 후보가 아니다.
//   → "미니 샤넬 블루드" 가 [불가리 블루] 로 가는 일이 원천 차단된다.
function variantHead(v: string): string {
  return squash(String(v).trim().split(/\s+/)[0] || "");
}

function collectHeads(products: ParseProduct[]): Set<string> {
  const out = new Set<string>();
  for (const p of products) {
    for (const v of p.variants || []) {
      const h = variantHead(v);
      if (h.length >= 1) out.add(h);   // "립" 처럼 한 글자 앞머리도 실재한다
    }
    const first = squash(nameBody(p.name).split(/\s+/)[0] || "");
    if (first.length >= 1) out.add(first);
  }
  return out;
}

// 채팅에 등장한 앞머리들. 표기 흔들림도 받아준다("딥디크" → "딥티크").
function chatHeadsOf(text: string, heads: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const w of text.split(/[^a-z0-9가-힣]+/).filter(Boolean)) {
    const sw = squash(w);
    if (sw.length < 1) continue;
    // 정확히 맞는 앞머리가 있으면 그걸 쓴다. (마스크/머스크처럼 둘 다 실재하는 말을 지켜준다)
    if (heads.has(sw)) { out.add(sw); continue; }
    // 정확한 게 없을 때만 표기 흔들림을 본다. 후보가 둘 이상이면 어느 쪽인지 모르므로 포기.
    const near: string[] = [];
    for (const h of heads) if (looseEqual(sw, h)) near.push(h);
    if (near.length === 1) out.add(near[0]);
  }
  return out;
}

// 상품이 정해진 뒤, 그 상품의 세부상품 중 채팅 단어로 좁혀 정확히 하나면 그걸 돌려준다.
//   상품이 이미 특정된 상태라 오탐 위험이 낮다. 하나로 안 좁혀지면 null(옵션 미확정).
function narrowVariant(text: string, p: ParseProduct): string | null {
  const words = text.split(/[^a-z0-9가-힣]+/).filter((w) => w.length >= 2);
  if (words.length === 0) return null;
  let bestScore = 0;
  let best: string[] = [];
  for (const v of p.variants || []) {
    if (EMPTY_OPTION_WORDS.has(String(v).trim().toLowerCase())) continue;
    const sv = squash(v);
    const vWords = String(v).split(/[^a-z0-9가-힣]+/i).map((x) => squash(x)).filter(Boolean);
    let sc = 0;
    for (const w of words) {
      const sw = squash(w);
      if (sw.length < 2) continue;
      if (sv.includes(sw)) { sc += sw.length; continue; }
      // 표기 흔들림("딥디크" → "딥티크")
      if (vWords.some((x) => looseEqual(sw, x))) sc += sw.length;
    }
    if (sc === 0) continue;
    if (sc > bestScore) { bestScore = sc; best = [v]; }
    else if (sc === bestScore) best.push(v);
  }
  // 최고점이 하나일 때만 확정. 동점이면 옵션 미확정으로 남긴다(손님에게 되물어야 하는 상황).
  return best.length === 1 ? best[0] : null;
}

// 손님이 말한 단어가 등록된 상품명과 "정확히" 같으면 그 상품이다.
//   사장님 등록 규칙이 [세부상품명 = 상품명 + 세부] 이므로 이게 가장 강한 신호다.
//   예) "크림 라메르 주세요" → 상품 [크림]  ("아이크림"에 크림이 들어있다고 끌려가면 안 된다)
//   붙여 쓴 두 단어까지 본다("바디 크림" → "바디크림").
function exactProductByName(text: string, products: ParseProduct[]): ParseProduct | null {
  const words = text.split(/[^a-z0-9가-힣]+/).filter(Boolean);
  const grams: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    let acc = "";
    for (let k = i; k < words.length && k < i + 5; k += 1) {
      acc += squash(words[k]);
      grams.push(acc);
    }
  }
  let bestLen = 0;
  let best: ParseProduct[] = [];
  for (const p of products) {
    const body = squash(nameBody(p.name));
    if (body.length < 1) continue;   // "립" 같은 한 글자 상품명도 실재한다
    if (!grams.includes(body) && !grams.some((g) => looseEqual(g, body))) continue;
    if (body.length > bestLen) { bestLen = body.length; best = [p]; }
    else if (body.length === bestLen && !best.some((x) => x.id === p.id)) best.push(p);
  }
  if (best.length === 0) return null;
  // 더 긴 상품명이 이긴다("아이크림" > "크림").
  // 같은 길이로 여럿이어도 "이름이 전부 같은 상품"(과거 방송 중복 등록)이면 모호가 아니다 — 하나를 쓴다.
  const bodies = new Set(best.map((x) => squash(nameBody(x.name))));
  return bodies.size === 1 ? best[0] : null;
}

// ── 본체 ──────────────────────────────────────────────
type ParseResultCore = Omit<ParseResult, "items">;

function parseChatOrderCore(
  rawText: string,
  products: ParseProduct[],
  currentProductId?: string | null
): ParseResultCore {
  const text = norm(rawText);
  const base: ParseResultCore = {
    status: "not_order", productId: null, productName: null, matchedBy: null, variantName: null,
    qty: 1, optionTokens: [], candidates: [], reason: "",
  };
  if (!text) return { ...base, reason: "빈 메시지" };

  const hasOrderWord = ORDER_WORDS.some((w) => text.includes(w));
  const hasNumberRef = /(\d{1,3})\s*번/.test(text);
  const hasQtyRef = /(\d{1,2})\s*(개|장|벌|족|켤레|병|세트)/.test(text) ||
    Object.keys(KO_NUM).some((w) => new RegExp(w + "\\s*(개|장|벌|족|켤레|병|세트)").test(text)) ||
    /(하나|둘|셋|넷|다섯)\s*요/.test(text);   // 단위 없는 수량 ("하나요")

  // 색상+사이즈가 같이 나오면 그 자체로 주문 맥락 ("검정 미디움 하나요")
  const preTokens = extractOptionTokens(text, []);
  // [2026-08-15 검수] 등록 색상(카멜·브라이트·실버블랙 등 사전에 없는 이름)도 주문 신호로 인정
  const textSq0 = squash(text);
  const regColorsAll = products.flatMap((p) => [...(p.colors || []), ...(p.variants || [])]).map((c) => squash(c));
  const hasRegColor = regColorsAll.some((c) => c.length >= 2 && textSq0.includes(c));
  const hasColor = preTokens.some((t) => COLOR_WORDS.includes(t)) || hasRegColor;
  const hasSize = preTokens.some((t) => SIZE_WORDS.includes(t) || /^\d{2,3}$/.test(t));
  const hasOptionCombo = hasColor && hasSize;
  // [2026-08-15 검수] 등록 사이즈만 말해도 주문 신호 ("웨이브 250", "트위드자켓 55")
  //   — 등록된 사이즈 값과 정확히 같은 토큰일 때만. 상품명이 안 잡히면 어차피 접수되지 않는다.
  const regSizesAll = new Set(products.flatMap((p) => (p.sizes || []).map((z) => squash(z))));
  const hasRegSize = text.split(/[^0-9a-z가-힣]+/).filter(Boolean).some((w) => {
    const t = squash(w);
    if (regSizesAll.has(t)) return true;
    const tail = t.replace(/(사이즈|사이즈로|미리|mm|밀리|요|이요|짜리)$/g, "").match(/(\d{2,3})$/);
    return Boolean(tail && regSizesAll.has(tail[1]));
  });

  // 질문/인사는 주문 단어가 있어도 제외 ("이거 주문 되나요?")
  // 물음표가 없어도 "~가요/나요/까요/은지/할까"로 끝나면 질문으로 본다 ("66 총기장이 얼만가요")
  const looksQuestion = text.includes("?") || QUESTION_WORDS.some((w) => text.includes(w)) ||
    /(가요|나요|까요|은지|는지|을까|ㄹ까|던가|겠죠|죠\??)\s*$/.test(text.trim());
  // 인사로 시작해도 뒤에 주문이 붙어 있으면 주문이다 ("안녕하세요 막스마라 카멜 55 주문")
  const looksGreeting = GREETINGS.some((w) => text.startsWith(w)) && !hasOrderWord && !hasNumberRef && !hasQtyRef;
  // 살 생각이 없다는 말은 주문이 아니다 ("다음에 살게요", "담에 살래요")
  const looksDecline = ["다음에", "담에", "나중에", "안살", "못살", "안사", "못사", "주소", "환불", "교환", "취소", "입금", "송장"].some((w) => text.includes(w));
  if (looksDecline) return { ...base, reason: "주문이 아닌 문의·요청" };
  // [2026-08-16] 이미 끝낸 일을 말하는 과거형은 주문이 아니다 ("채널가서주문했어요", "아까 샀어요")
  if (/(주문했|구매했|결제했|샀어|샀습|샀네|담았|넣었|제출했|완료했|했어요|했습니다|했네요)/.test(text)) {
    return { ...base, reason: "이미 주문했다는 말" };
  }
  // [2026-08-16 실방송] 보여달라·알려달라·입어봐달라 = 요청이지 주문이 아니다.
  //   상품·색상이 함께 있어도(예: "카멜 색도 한번 보여주세요 막지마라") 주문으로 보지 않는다.
  const REQUEST_WORDS = ["보여주", "보여줘", "보여줄", "올려주", "알려주", "설명해", "찍어주", "비교해",
    "입어주", "입어봐", "신어주", "신어봐", "틀어주", "해주세요", "해 주세요", "부탁", "언제해", "다시해",
    "궁금", "고민", "볼래", "봐주세요", "확인해주"];
  if (REQUEST_WORDS.some((w) => text.includes(w))) {
    return { ...base, reason: "요청·문의 (주문 아님)" };
  }
  // "블랙도 해 주세요~~" 같은 건의 (도/또 + 어절 + 해·만들어·올려·보여 + 주세요)
  if (/(도|또)\s*\S*\s*(해|하|만들어|만드러|올려|보여|넣어|준비|입어|신어|찍어)\s*주(세|시)?요?/.test(text)) {
    return { ...base, reason: "건의·요청 (주문 아님)" };
  }
  if (looksQuestion || looksGreeting) {
    return { ...base, reason: looksQuestion ? "질문으로 보임" : "인사말" };
  }
  // [2026-08-15 전수조사] 등록 상품명을 통째로 말했으면 주문 맥락으로 본다 ("막스코트 카멜").
  //   여기서 바로 접수되는 게 아니라, 옵션이 빠졌으면 아래에서 봇이 되묻는다.
  const sqText0 = squash(text);
  const hasExactName = products.some((x) => {
    const nb = squash(nameBody(x.name));
    return nb.length >= 4 && sqText0.includes(nb);
  });
  if (!hasOrderWord && !hasNumberRef && !hasQtyRef && !hasOptionCombo && !hasRegSize && !hasExactName) {
    return { ...base, reason: "주문 신호 없음" };
  }

  const { qty, consumed } = extractQty(text);
  // 등록 색상 전체를 넘겨 "실버블랙"·"카멜" 같은 이름을 통째로 인식하게 한다(쪼개짐·미인식 방지)
  const optionTokens = extractOptionTokens(text, consumed, products.flatMap((x) => x.colors || []), products.flatMap((x) => (x.sizes || []).map((z) => String(z).trim())));

  // 최우선: 손님이 등록 상품명을 그대로 말했으면 그 상품으로 확정한다.
  //   세부상품명이 [상품명 + 세부] 로 등록돼 있어, 부분일치보다 이게 훨씬 정확하다.
  {
    const exact = exactProductByName(text, products);
    if (exact) {
      const v = narrowVariant(text, exact);
      return {
        status: "parsed", productId: exact.id, productName: exact.name,
        matchedBy: "name", variantName: v, qty, optionTokens, candidates: [],
        reason: v ? "상품명 그대로 말함 → 세부상품까지 확정" : "상품명 그대로 말함 (세부상품 미확정)",
      };
    }
  }

  // 0순위: 세부상품명 매칭 — 원칙 하나로 통일한 점수 모델.
  //   후보(상품×세부상품)가 손님의 말을 얼마나 "설명"하는지 본다.
  //   ① 설명되는 단어(세부상품명/상품명에 있는 말)는 가점
  //   ② 설명 안 되는 단어는 감점 — "미니 구찌 블롬"의 "미니"를
  //      일반 [구찌 향수]는 설명 못 하고 [미니어처 향수]는 설명한다 → 자동으로 갈린다
  //   ③ 손님이 안 말한 세부상품 쪽 단어(5ml 등)는 소폭 감점 — 정확히 말한 쪽이 이긴다
  {
    // 주문어("주세요")·수량어("2개","하나요")는 상품 판단에서 제외한다.
    const stop = new Set<string>();
    for (const w of ORDER_WORDS) stop.add(squash(w));
    for (const c of consumed) for (const x of c.split(/\s+/)) stop.add(squash(x));
    const isMeasure = (w: string) => /^\d+(\.\d+)?(ml|g|kg|호|종|개입|cm|mm)?$/.test(w);
    const chatWords = text.split(/[^a-z0-9가-힣]+/).map((w) => squash(w))
      .filter((w) => w.length >= 2 && !stop.has(w));
    type VariantHit = { p: ParseProduct; variant: string; score: number };
    let bestScore = -Infinity;
    let hits: VariantHit[] = [];
    const weak: VariantHit[] = [];
    for (const p of products) {
      const pNameWords = nameBody(p.name).split(/[^a-zA-Z0-9가-힣]+/).map((x) => squash(x)).filter(Boolean);
      for (const v of p.variants || []) {
        if (EMPTY_OPTION_WORDS.has(String(v).trim().toLowerCase())) continue;
        const sv = squash(v);
        const vWords = String(v).split(/[^a-zA-Z0-9가-힣]+/).map((x) => squash(x)).filter(Boolean);
        // 등록명이 "로스트 체리"처럼 띄어 있고 손님이 "로스트채리"(붙임+오타)로 칠 때를 위해
        //   이웃 단어를 붙인 형태도 오타 비교 대상에 넣는다.
        const vWordsJoined = vWords.slice();
        for (let i = 0; i + 1 < vWords.length; i += 1) vWordsJoined.push(vWords[i] + vWords[i + 1]);
        let score = 0;
        let matched = 0;      // 세부상품명 단어를 맞힌 개수
        let matchedChars = 0; // 맞힌 글자수 (근거 세기)
        for (const w of chatWords) {
          // (0) 용량·호수·수치("100ml","144호")는 상품을 정하는 근거가 아니라 참고 신호.
          //     맞으면 소폭 가점, 없으면 소폭 감점 — 이것만으로 후보가 되지는 않는다.
          if (isMeasure(w)) { score += sv.includes(w) ? w.length : -w.length; continue; }
          // (1) 세부상품명 단어와 일치 — 통째(오타 허용) 또는 4글자 이상의 붙여쓰기 포함
          if (vWordsJoined.some((x) => x === w || looseEqual(w, x)) || (w.length >= 4 && sv.includes(w))) {
            score += w.length * 3; matched += 1; matchedChars += w.length; continue;
          }
          // (2) 짧은 단어가 세부상품명 안에 묻힘 ("블룸" ⊂ "블룸그린") — 약한 근거
          if (sv.includes(w)) { score += w.length; matched += 1; matchedChars += w.length; continue; }
          // (3) 상품명 쪽 단어와 일치 ("미니" → [미니어처 향수]) — 종류를 콕 집은 것
          if (pNameWords.some((x) => x === w || x.startsWith(w) || looseEqual(w, x))) {
            score += w.length * 3; continue;
          }
          // (4) 이 후보로는 설명이 안 되는 말 — 감점
          //     "룰루레몬 반바지 아이보리"가 향수(발렌티노돈나 아이보리)로 새지 않는 핵심 장치.
          score -= w.length * 2;
        }
        if (matched === 0) continue;
        // 손님이 언급 안 한 세부상품 쪽 단어는 소폭 감점 ("5ml" 안 말했으면 일반이 이긴다)
        for (const x of vWords) {
          const spoken = chatWords.some((w) => w === x || w.includes(x) || x.includes(w) || looseEqual(w, x));
          if (!spoken) score -= x.length;
        }
        // 설명 못 한 말이 더 많으면(총점 0 이하) 후보 자격이 없다.
        if (score <= 0) continue;
        const hit: VariantHit = { p, variant: v, score };
        // 근거가 약한 후보(2~3글자 단어 하나) — 유일할 때만 쓴다 ("굿걸"은 되고 "샤넬"은 안 된다)
        if (matched < 2 && matchedChars < 4) { weak.push(hit); continue; }
        if (score > bestScore) { bestScore = score; hits = [hit]; }
        else if (score === bestScore) hits.push(hit);
      }
    }
    if (hits.length === 0) {
      const uw = weak.filter((h, i) => weak.findIndex((x) => x.p.id === h.p.id && x.variant === h.variant) === i);
      if (uw.length === 1) hits = uw;
    }
    const uniq = hits.filter((h, i) => hits.findIndex((x) => x.p.id === h.p.id && x.variant === h.variant) === i);

    let pick: VariantHit | null = uniq.length === 1 ? uniq[0] : null;
    let tieReason = "";

    // 동점인데 전부 같은 상품이면: 상품은 확정, 세부상품만 미확정으로 접수
    if (!pick && uniq.length > 1 && uniq.every((h) => h.p.id === uniq[0].p.id)) {
      return {
        status: "parsed", productId: uniq[0].p.id, productName: uniq[0].p.name,
        matchedBy: "variant", variantName: null, qty, optionTokens,
        candidates: uniq.map((h) => h.variant).slice(0, 5),
        reason: "상품 확정 · 세부상품 후보 여러 개(미확정)",
      };
    }

    // 동점 해소 ①: 상품명 쪽 구분 단어 (등록 표기 차이로 갈린 동점)
    if (!pick && uniq.length > 1) {
      const strongTokens = chatWords.filter((w) => !uniq.every((h) => squash(h.variant).includes(w)));
      for (const tokens of [strongTokens, chatWords]) {
        if (tokens.length === 0) continue;
        const byName = uniq.filter((h) => {
          const body = squash(nameBody(h.p.name));
          return tokens.some((w) => body.includes(w));
        });
        if (byName.length === 1) { pick = byName[0]; tieReason = "상품 구분 단어로 확정"; break; }
      }
    }

    // 동점 해소 ②: 「지금 이거」
    if (!pick && uniq.length > 1 && currentProductId) {
      const onCurrent = uniq.filter((h) => h.p.id === currentProductId);
      if (onCurrent.length === 1) { pick = onCurrent[0]; tieReason = "「지금 이거」로 확정"; }
    }
    if (pick) {
      return {
        status: "parsed", productId: pick.p.id, productName: pick.p.name,
        matchedBy: "variant", variantName: pick.variant,
        qty, optionTokens, candidates: [],
        reason: tieReason ? `세부상품 동점 → ${tieReason}` : "세부상품 일치 → 옵션 확정",
      };
    }
    // 동점을 못 가렸으면 여기서 멈춘다 — 아래 이름 매칭으로 흘려보내면
    //   "딥티크 로즈"(캔들/차량용 동점)가 [딥티크 향수]로 잘못 확정될 수 있다.
    if (uniq.length > 1) {
      const names = Array.from(new Set(uniq.map((h) => h.p.name)));
      return {
        status: "ambiguous", productId: null, productName: null, matchedBy: null,
        variantName: null, qty, optionTokens,
        candidates: names.slice(0, 4),
        reason: "여러 상품에 같은 이름 — 종류를 같이 적어야 접수",
      };
    }
  }

  // 1순위: 상품 앞 번호
  const numMatch = text.match(/(\d{1,3})\s*번/);
  if (numMatch) {
    const want = Number(numMatch[1]);
    const hit = products.filter((p) => productLeadingNumber(p.name) === want);
    if (hit.length === 1) {
      return { status: "parsed", productId: hit[0].id, productName: hit[0].name, matchedBy: "number", variantName: null, qty, optionTokens, candidates: [], reason: `${want}번 상품` };
    }
    if (hit.length > 1) {
      return { status: "ambiguous", productId: null, productName: null, matchedBy: null, qty, optionTokens, variantName: null, candidates: hit.map((p) => p.name), reason: `${want}번 상품이 여러 개` };
    }
    // 번호는 말했는데 그 번호 상품이 없음 → 이름 매칭으로 계속 진행
  }

  // 2순위: 상품명 부분 일치 (등록명 + 별칭). 2글자 이상 토큰이 메시지에 포함되면 후보.
  const squashed = squash(text);
  const scored = products
    .map((p) => {
      const names = [nameBody(p.name), ...koreanReadings(nameBody(p.name)), ...(p.aliases || [])].filter(Boolean);
      let best = 0;
      let weakOnly = false;
      for (const n of names) {
        const s = squash(n);
        // 이름 전체가 통째로 들어있으면: 맞은 글자수 = 이름 길이 (배수 없음 —
        //   "밴딩바지"(4)가 "이중허리밴딩바지"(8) 조각보다 커지는 왜곡 방지)
        if (s.length >= 2 && squashed.includes(s)) { best = Math.max(best, s.length); continue; }
        // 상품명을 단어로 쪼개, 맞은 조각들의 "글자수 합"으로 점수를 낸다.
        //   "알로 블랙 셔츠스트라이프 셋업"은 조각 3개 합이 커서 일반 "셔츠"를 이긴다.
        const chatWords = text.split(/[^a-z0-9가-힣]+/).filter(Boolean);
        let sum = 0;
        let weakSum = 0; // 상품명에 없는 상위어("신발"→"샌들")로 얻은 점수 — 이것만으로는 확정하지 않는다
        for (const piece of String(n).split(/[\s()[\]{}·・,./\-_~]+/).filter((x) => x.length >= 2)) {
          const sp = squash(piece);
          // 색상·사이즈 단어는 상품명 증거로 안 친다 — 손님의 "화이트"는 옵션 선택이지
          //   [알로 화이트 셋업]을 가리키는 말이 아니다. (이름 전체 일치는 위에서 이미 처리)
          if (COLOR_WORDS.includes(sp) || SIZE_WORDS.includes(sp)) continue;
          if (sp.length >= 2 && squashed.includes(sp)) { sum += sp.length; continue; }
          for (const w of chatWords) {
            const sw = squash(w);
            // [2026-08-15] 한 글자 이름("젤NYC"의 젤)도 그 상품에만 있는 고유값이면 인정 — 토큰이 정확히 같을 때만
            if (sw.length === 1) {
              if (sp.startsWith(sw) && !products.some((o) => o.id !== p.id && squash(nameBody(o.name)).includes(sw))) { sum += 2; break; }
              continue;
            }
            if (sw.length < 2) continue;
            if (sp.startsWith(sw)) { sum += sw.length; break; }
            // 뒤에 붙은 이름도 인정 ("코트"→"막스코트"). 약한 근거로 표시해 단독 확정은 신중히.
            if (sw.length >= 2 && sp.length > sw.length && sp.endsWith(sw)) { sum += sw.length; weakSum += sw.length; break; }
            // [2026-08-15 사장님 지시] 브랜드를 흐리게 써도 뒷부분이 같으면 인정
            //   ("막땡코트"·"막코트"·"막스마라코트" → 막스코트). 공통 꼬리 2글자 이상, 약한 근거.
            {
              let tail = 0;
              while (tail < sw.length && tail < sp.length && sw[sw.length - 1 - tail] === sp[sp.length - 1 - tail]) tail += 1;
              if (tail >= 2) { sum += tail; weakSum += tail; break; }
            }
            if (looseEqual(sw, sp)) { sum += sp.length; break; }   // "딥디크" → "딥티크"
            if (categoryHit(sw, sp)) { const add = sw === sp ? sw.length : 1; sum += add; if (sw !== sp) weakSum += add; break; }  // "가방"→"토트백"(약함)
            // 붙여쓰기 대응("룰루가방 주문") — 단어 끝에 붙은 종류 단어도 인정 (2026-08-14 실채팅)
            const catTail = CATEGORY_SYNONYMS.flat().find((g) => sw.length > g.length && sw.endsWith(g));
            if (catTail && categoryHit(catTail, sp)) { sum += catTail.length; if (catTail !== sp) weakSum += catTail.length; break; }
          }
        }
        if (sum > best) { best = sum; weakOnly = sum > 0 && weakSum >= sum; }
        else if (sum === best && sum > 0 && weakSum < sum) weakOnly = false;
      }
      return { p, score: best, weakOnly };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) {
    // [2026-08-15 검수] "신발 250 주세요" — 큰 분류로만 말했는데 방송에 신발이 여러 개면 확정 금지.
    //   ("샌들 240"처럼 상품명에 있는 단어를 말했으면 강한 근거라 그대로 접수된다)
    if (scored[0].weakOnly) {
      const saidShoeTop = text.split(/[^0-9a-z가-힣]+/).some((w) => SHOE_TOP_WORDS.has(squash(w)));
      if (saidShoeTop) {
        const shoes = products.filter((x) => (x.sizes || []).some(isShoeSize));
        if (shoes.length >= 2) {
          return { status: "ambiguous", productId: null, productName: null, matchedBy: null, qty, optionTokens,
            variantName: null, candidates: shoes.slice(0, 5).map((x) => x.name),
            reason: "어느 상품인지 알 수 없음 — 상품명을 함께 적어주세요" };
        }
      }
    }
    const p = scored[0].p;
    // 상품이 정해졌으면 그 상품의 세부상품 안에서 한 번 더 좁힌다.
    //   예) "미니 샤넬 저요" → 상품=[미니어처 향수] 확정 → 그 안에서 "샤넬"이 든 세부상품 1개면 확정.
    const v = narrowVariant(text, p);
    return {
      status: "parsed", productId: p.id, productName: p.name, matchedBy: "name",
      variantName: v, qty, optionTokens, candidates: [],
      reason: v ? "상품명 일치 → 세부상품까지 확정" : "상품명 일치",
    };
  }
  if (scored.length > 1) {
    const top = scored.filter((x) => x.score === scored[0].score);

    // 동점 해소 ①: "카테고리 지정어"로 가린다.
    //   어떤 세부상품명에도 안 나오는 단어(= 브랜드·향 이름이 아닌 단어)는 손님이 종류를 지정한 것이다.
    //   예) "미니 샤넬 저요" — "샤넬"은 세부상품명에 나오니 브랜드, "미니"는 안 나오니 종류 지정어.
    //       → 상품명에 "미니"가 든 [미니어처 향수] 로 확정.
    {
      const chatWords = text.split(/[^a-z0-9가-힣]+/).filter((w) => w.length >= 2);
      // 비교 대상은 "전체 상품"이 아니라 "지금 동점인 후보들"의 세부상품명이다.
      //   전체로 보면 무관한 상품(예: 립 루이비통 미니사이즈) 때문에 "미니"가 지정어에서 빠진다.
      const topVariants = top.flatMap((x) => (x.p.variants || []).map((v) => squash(v)));
      const categoryWords = chatWords.filter((w) => {
        const sw = squash(w);
        return sw.length >= 2 && !topVariants.some((v) => v.includes(sw));
      });
      if (categoryWords.length > 0) {
        const byCategory = top.filter((x) => {
          const body = squash(nameBody(x.p.name));
          return categoryWords.some((w) => body.includes(squash(w)));
        });
        if (byCategory.length === 1) {
          const p2 = byCategory[0].p;
          const v2 = narrowVariant(text, p2);
          return {
            status: "parsed", productId: p2.id, productName: p2.name, matchedBy: "name",
            variantName: v2, qty, optionTokens, candidates: [],
            reason: v2 ? "종류 지정어로 확정 → 세부상품까지 확정" : "종류 지정어로 확정",
          };
        }
      }
    }

    // 동점 해소 ②: 「지금 이거」로 가린다.
    if (currentProductId) {
      const onCurrent = top.find((x) => x.p.id === currentProductId);
      if (onCurrent) {
        return { status: "parsed", productId: onCurrent.p.id, productName: onCurrent.p.name, matchedBy: "name", variantName: narrowVariant(text, onCurrent.p), qty, optionTokens, candidates: [], reason: "상품명 동점 → 「지금 이거」로 확정" };
      }
    }
    return { status: "ambiguous", productId: null, productName: null, matchedBy: null, qty, optionTokens, variantName: null, candidates: scored.slice(0, 5).map((x) => x.p.name), reason: "상품 후보가 여러 개" };
  }

  // [2026-08-16 실방송 데이터 반영] 3순위: 색상·사이즈만 말한 주문 ("카멜55주세요", "베이지55저요")
  //   방송 상품 중 그 색상(+사이즈)을 가진 상품이 **딱 하나면** 그 상품으로 확정한다.
  //   여러 개면 후보를 봇이 물어본다. 손님이 색+사이즈를 말한 건 주문 맥락이 확실하다.
  {
    const colorToks = optionTokens.filter((t) => {
      if (COLOR_WORDS.includes(t)) return true;
      return products.some((x) => (x.colors || []).some((c) => squash(c) === squash(t)));
    });
    const sizeToks = optionTokens.filter((t) => !colorToks.includes(t));
    if (colorToks.length > 0) {
      const hit = products.filter((x) => {
        const cs = (x.colors || []).filter((c) => c && !EMPTY_OPTION_WORDS.has(String(c).toLowerCase()));
        if (cs.length === 0) return false;
        const colorOK = colorToks.some((t) => cs.some((c) => sameColorWord(t, String(c)) || squash(c).includes(squash(t)) || squash(t).includes(squash(c))));
        if (!colorOK) return false;
        if (sizeToks.length === 0) return true;
        const zs = (x.sizes || []).map((z) => squash(z));
        return sizeToks.some((t) => zs.includes(squash(t)));
      });
      if (hit.length === 1) {
        const p1 = hit[0];
        return { status: "parsed", productId: p1.id, productName: p1.name, matchedBy: "variant",
          variantName: null, qty, optionTokens, candidates: [], reason: "색상·사이즈로 상품 확정" };
      }
      if (hit.length >= 2) {
        // 「지금 이거」가 그 색을 가진 상품 중 하나면 그걸로, 아니면 후보를 물어본다
        const cur = currentProductId ? hit.find((x) => x.id === currentProductId) : null;
        if (cur) {
          return { status: "parsed", productId: cur.id, productName: cur.name, matchedBy: "current",
            variantName: null, qty, optionTokens, candidates: [], reason: "「지금 이거」+색상으로 확정" };
        }
        return { status: "ambiguous", productId: null, productName: null, matchedBy: null, qty, optionTokens,
          variantName: null, candidates: hit.slice(0, 4).map((x) => x.name),
          reason: "색상만으로는 상품을 몰라요 — 상품명을 함께 적어주세요" };
      }
      // 말한 색이 어느 상품에도 없으면(오타·없는 색) 「지금 이거」로 밀어넣지 않는다 — 잘못 담기는 사고 방지
      if (hit.length === 0 && currentProductId) {
        const cp = products.find((x) => x.id === currentProductId);
        const cpColors = (cp?.colors || []).filter((c) => c && !EMPTY_OPTION_WORDS.has(String(c).toLowerCase()));
        const okOnCur = cpColors.length === 0 || colorToks.some((t) => cpColors.some((c) => sameColorWord(t, String(c)) || squash(c).includes(squash(t))));
        if (!okOnCur) {
          return { status: "ambiguous", productId: cp?.id ?? null, productName: cp?.name ?? null, matchedBy: null,
            qty, optionTokens, variantName: null, candidates: cpColors.slice(0, 4),
            reason: "색상 미지정 — 색상까지 적어야 접수" };
        }
      }
    }
  }

  // 4순위: 「지금 이거」
  if (currentProductId) {
    const p = products.find((x) => x.id === currentProductId);
    if (p) {
      return { status: "parsed", productId: p.id, productName: p.name, matchedBy: "current", variantName: null, qty, optionTokens, candidates: [], reason: "「지금 이거」로 적용" };
    }
  }

  return { ...base, status: "need_product", qty, optionTokens, reason: "상품을 말하지 않았고 「지금 이거」도 없음" };
}

// 공개 진입점 — 판정 후 "한 채팅 = 여러 건" 확장까지 계산해 돌려준다.
//   조합형(세부상품 확정)은 세부상품 1건. 일반 상품은 색상/사이즈 토큰·"깔"로 확장.
export function parseChatOrder(
  rawText: string,
  products: ParseProduct[],
  currentProductId?: string | null
): ParseResult {
  const core = parseChatOrderCore(rawText, products, currentProductId);

  // [2026-08-14 사장님 지침] 조합형(세부상품 있는) 상품은 "종류까지" 말해야 접수.
  //   "뉴에라 모자 주세요"(17종) 같은 건 접수하지 않고 보류 → 봇이 종류를 물어본다.
  //   productName은 남겨서 관리자 화면·봇 안내에 어느 상품인지 보이게 한다.
  if (core.status === "parsed" && !core.variantName && core.productId) {
    const p0 = products.find((x) => x.id === core.productId);
    if (p0 && (p0.variants || []).length > 0) {
      return {
        ...core,
        status: "ambiguous",
        candidates: (p0.variants || []).slice(0, 4),
        reason: "종류(세부상품) 미지정 — 이름이나 번호까지 적어야 접수",
        items: [],
      };
    }
  }

  // [2026-08-15 검수] 한 채팅에 서로 다른 상품을 두 개 이상 말했으면 접수하지 않는다.
  //   ("웨이브 250 샌들 240 주세요" → 한 상품으로 뭉뚱그려져 사이즈 2건으로 담기던 사고)
  if (core.status === "parsed" && core.productId) {
    const sqAll = squash(norm(rawText));
    const piecesOf = (nm: string) => String(nameBody(nm)).split(/[\s()[\]{}·・,./\-_~]+/)
      .map((x) => squash(x)).filter((x) => x.length >= 2 && !COLOR_WORDS.includes(x) && !SIZE_WORDS.includes(x));
    const uniqHits = products.filter((p1) => {
      const others = products.filter((x) => x.id !== p1.id).map((x) => squash(nameBody(x.name)));
      return piecesOf(p1.name).some((pc) => sqAll.includes(pc) && !others.some((o) => o.includes(pc)));
    });
    if (uniqHits.length >= 2) {
      return { ...core, status: "ambiguous", candidates: uniqHits.slice(0, 4).map((x) => x.name), items: [],
        reason: "한 채팅에 상품이 여러 개 — 한 번에 한 상품씩 적어주세요" };
    }
  }

  let items: ParseResult["items"] = [];
  if (core.status === "parsed") {
    if (core.variantName) {
      items = [{ color: core.variantName, size: null, qty: core.qty }];
    } else {
      const p = core.productId ? products.find((x) => x.id === core.productId) || null : null;
      items = expandItems(norm(rawText), core.optionTokens, core.qty, p);
    }
  }

  // [2026-08-15 검수·사고방지] 등록 옵션이 있는데 손님이 말하지 않았으면 접수하지 않고 봇이 되묻는다.
  //   빈 옵션으로 담기면 재고 매칭이 안 되고 배송 사고로 이어진다.
  //   단, 선택지가 하나뿐인 옵션은 자동으로 채운다(물어볼 이유가 없음).
  if (core.status === "parsed" && core.productId && !core.variantName && items.length > 0) {
    const pp = products.find((x) => x.id === core.productId);
    const cs = (pp?.colors || []).map((x) => String(x).trim()).filter((x) => x && !EMPTY_OPTION_WORDS.has(x.toLowerCase()));
    const zs = (pp?.sizes || []).map((x) => String(x).trim()).filter((x) => x && !EMPTY_OPTION_WORDS.has(x.toLowerCase()));
    if (cs.length === 1) items = items.map((i) => (i.color ? i : { ...i, color: cs[0] }));
    if (zs.length === 1) items = items.map((i) => (i.size ? i : { ...i, size: zs[0] }));
    const needColor = cs.length >= 2 && items.some((i) => !i.color);
    const needSize = zs.length >= 2 && items.some((i) => !i.size);
    if (needColor || needSize) {
      const what = needColor && needSize ? "색상과 사이즈" : needColor ? "색상" : "사이즈";
      const ex = needColor ? cs.slice(0, 3) : zs.slice(0, 3);
      return { ...core, status: "ambiguous", candidates: ex, items: [],
        reason: `${what} 미지정 — ${what}까지 적어야 접수 (예: ${ex.join(" / ")})` };
    }
  }

  // 수량이 과하면(10개 초과) 오타일 수 있으니 되묻는다 ("250 99개")
  if (core.status === "parsed" && items.some((i) => i.qty > 10)) {
    return { ...core, status: "ambiguous", candidates: [], items: [],
      reason: "수량이 많아요 — 맞으면 수량을 다시 적어주세요" };
  }

  return { ...core, items };
}
