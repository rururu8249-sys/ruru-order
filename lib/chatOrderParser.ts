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
  candidates: string[];
  reason: string;
};

// ── 사전 ──────────────────────────────────────────────
const ORDER_WORDS = ["주문", "저요", "저용", "저여", "ㅈㅇ", "주세요", "주새요", "줘요", "주십시오", "살게요", "살께요", "구매", "담아", "담아주세요", "예약"];
const QUESTION_WORDS = ["언제", "얼마", "뭐", "무엇", "어디", "어떻게", "왜", "있나요", "있어요", "되나요", "가능한가요", "인가요", "될까요"];
const GREETINGS = ["안녕", "하이", "감사", "고마", "수고", "잘자", "잘가", "축하", "화이팅", "파이팅", "ㅎㅇ", "ㅇㅇ", "ㅋㅋ", "ㅎㅎ"];

const KO_NUM: Record<string, number> = {
  한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4,
  다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
};

const COLOR_WORDS = [
  "블랙", "검정", "검은", "깜장", "black",
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
  "프리", "free", "원사이즈",
];

// "없음/무/-" 같은 빈 옵션 표기는 세부상품명이 아니다. 로더에서도 거르지만
//   파서는 순수 함수라 어디서 호출돼도 안전하도록 여기서도 막는다.
const EMPTY_OPTION_WORDS = new Set(["없음", "없슴", "무", "-", "none", "n/a", "na"]);

// ── 유틸 ──────────────────────────────────────────────
const norm = (v: unknown) =>
  String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();

// 매칭용: 공백·괄호·기호 제거
const squash = (v: unknown) =>
  String(v ?? "").toLowerCase().replace(/[\s()[\]{}·・,./\-_~]/g, "");

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
  const m1 = text.match(/(\d{1,2})\s*(개|장|벌|족|병|세트|셋트)/);
  if (m1) {
    consumed.push(m1[0]);
    return { qty: Math.max(1, Math.min(99, Number(m1[1]))), consumed };
  }
  // 2) 한글 수사 + 단위 ("두개", "하나요", "세벌")
  for (const [word, n] of Object.entries(KO_NUM)) {
    const re = new RegExp(word + "\\s*(개|장|벌|족|병|세트)");
    const m = text.match(re);
    if (m) { consumed.push(m[0]); return { qty: n, consumed }; }
  }
  // 3) "하나요" 처럼 단위 없이 쓰는 경우
  const m3 = text.match(/(하나|둘|셋|넷)\s*요?/);
  if (m3) { consumed.push(m3[0]); return { qty: KO_NUM[m3[1]] || 1, consumed }; }
  return { qty: 1, consumed };
}

function extractOptionTokens(text: string, consumed: string[]): string[] {
  let rest = text;
  for (const c of consumed) rest = rest.replace(c, " ");
  rest = rest.replace(/(\d{1,3})\s*번/g, " ");   // 상품번호 제거
  const out: string[] = [];
  for (const w of COLOR_WORDS) if (rest.includes(w)) out.push(w);
  // 사이즈 단어는 단독 토큰일 때만 (예: "m"이 "메종" 안에 걸리지 않게)
  for (const token of rest.split(/[^a-z0-9가-힣]+/).filter(Boolean)) {
    if (SIZE_WORDS.includes(token)) out.push(token);
    else if (/^\d{3}$/.test(token)) out.push(token);      // 신발 사이즈 230/250
    else if (/^\d{2}$/.test(token) && Number(token) >= 44 && Number(token) <= 120) out.push(token); // 의류 44/55/66/77
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
  if (a[0] !== b[0]) return false;
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
      if (h.length >= 2) out.add(h);
    }
    const first = squash(nameBody(p.name).split(/\s+/)[0] || "");
    if (first.length >= 2) out.add(first);
  }
  return out;
}

// 채팅에 등장한 앞머리들. 표기 흔들림도 받아준다("딥디크" → "딥티크").
function chatHeadsOf(text: string, heads: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const w of text.split(/[^a-z0-9가-힣]+/).filter(Boolean)) {
    const sw = squash(w);
    if (sw.length < 2) continue;
    if (heads.has(sw)) { out.add(sw); continue; }
    for (const h of heads) if (looseEqual(sw, h)) { out.add(h); break; }
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
    grams.push(squash(words[i]));
    if (i + 1 < words.length) grams.push(squash(words[i] + words[i + 1]));
  }
  let bestLen = 0;
  let best: ParseProduct[] = [];
  for (const p of products) {
    const body = squash(nameBody(p.name));
    if (body.length < 2) continue;
    if (!grams.includes(body) && !grams.some((g) => looseEqual(g, body))) continue;
    if (body.length > bestLen) { bestLen = body.length; best = [p]; }
    else if (body.length === bestLen && !best.some((x) => x.id === p.id)) best.push(p);
  }
  // 더 긴 상품명이 이긴다("아이크림" > "크림"). 같은 길이로 겹치면 포기.
  return best.length === 1 ? best[0] : null;
}

// ── 본체 ──────────────────────────────────────────────
export function parseChatOrder(
  rawText: string,
  products: ParseProduct[],
  currentProductId?: string | null
): ParseResult {
  const text = norm(rawText);
  const base: ParseResult = {
    status: "not_order", productId: null, productName: null, matchedBy: null, variantName: null,
    qty: 1, optionTokens: [], candidates: [], reason: "",
  };
  if (!text) return { ...base, reason: "빈 메시지" };

  const hasOrderWord = ORDER_WORDS.some((w) => text.includes(w));
  const hasNumberRef = /(\d{1,3})\s*번/.test(text);
  const hasQtyRef = /(\d{1,2})\s*(개|장|벌|족|병|세트)/.test(text) ||
    Object.keys(KO_NUM).some((w) => new RegExp(w + "\\s*(개|장|벌|족|병|세트)").test(text)) ||
    /(하나|둘|셋|넷|다섯)\s*요/.test(text);   // 단위 없는 수량 ("하나요")

  // 색상+사이즈가 같이 나오면 그 자체로 주문 맥락 ("검정 미디움 하나요")
  const preTokens = extractOptionTokens(text, []);
  const hasColor = preTokens.some((t) => COLOR_WORDS.includes(t));
  const hasSize = preTokens.some((t) => SIZE_WORDS.includes(t) || /^\d{2,3}$/.test(t));
  const hasOptionCombo = hasColor && hasSize;

  // 질문/인사는 주문 단어가 있어도 제외 ("이거 주문 되나요?")
  const looksQuestion = text.includes("?") || QUESTION_WORDS.some((w) => text.includes(w));
  const looksGreeting = GREETINGS.some((w) => text.startsWith(w));
  if (looksQuestion || looksGreeting) {
    return { ...base, reason: looksQuestion ? "질문으로 보임" : "인사말" };
  }
  if (!hasOrderWord && !hasNumberRef && !hasQtyRef && !hasOptionCombo) {
    return { ...base, reason: "주문 신호 없음" };
  }

  const { qty, consumed } = extractQty(text);
  const optionTokens = extractOptionTokens(text, consumed);

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

  // 0순위: 조합형 세부상품명 (가장 구체적 — 맞으면 옵션 1단 축까지 확정)
  //   "킬리안 굿걸" 전체도, 브랜드 뗀 "굿걸"도 잡는다.
  {
    const sq = squash(text);
    // 손님이 말한 "단어 덩어리"들. 단어 경계를 지켜야 오탐이 없다.
    //   "미니 샤넬 블루드 저요" 에서 "블루"(불가리 블루)가 걸리면 안 된다 — 블루드의 일부일 뿐이다.
    const chatGrams = new Set<string>();
    {
      const ws = text.split(/[^a-z0-9가-힣]+/).filter(Boolean);
      for (let i = 0; i < ws.length; i += 1) {
        let acc = "";
        for (let k = i; k < ws.length && k < i + 6; k += 1) { acc += squash(ws[k]); chatGrams.add(acc); }
      }
    }
    // 손님이 말한 앞머리(브랜드/카테고리)와 다른 세부상품은 후보에서 제외한다.
    const chatHeads = chatHeadsOf(text, collectHeads(products));
    type VariantHit = { p: ParseProduct; variant: string; score: number };
    let bestScore = 0;
    let hits: VariantHit[] = [];
    for (const p of products) {
      for (const v of p.variants || []) {
        if (EMPTY_OPTION_WORDS.has(String(v).trim().toLowerCase())) continue;
        if (chatHeads.size > 0 && !chatHeads.has(variantHead(v))) continue;
        const cands = [squash(v)];
        const tail = squash(String(v).split(/\s+/).slice(1).join(" "));
        if (tail.length >= 2) cands.push(tail);
        let hit = 0;
        for (const c of cands) {
          if (c.length < 2) continue;
          // 1차: 단어 경계가 딱 맞는 경우 (짧아도 안전 — "굿걸")
          if (chatGrams.has(c)) { hit = Math.max(hit, c.length); continue; }
          // 2차: 조사·오타로 붙여 쓴 경우("킬리안굿걸요"). 짧으면 오탐이라 4글자 이상만.
          if (c.length >= 4 && sq.includes(c)) hit = Math.max(hit, c.length);
        }
        if (hit === 0) continue;
        if (hit > bestScore) { bestScore = hit; hits = [{ p, variant: v, score: hit }]; }
        else if (hit === bestScore) hits.push({ p, variant: v, score: hit });
      }
    }
    // 같은 상품에 같은 세부상품이 중복 등록된 경우는 하나로 본다.
    const uniq = hits.filter(
      (h, i) => hits.findIndex((x) => x.p.id === h.p.id && x.variant === h.variant) === i
    );

    let pick: VariantHit | null = uniq.length === 1 ? uniq[0] : null;
    let tieReason = "";

    // 동점 해소 ①: 손님이 상품 쪽 구분 단어를 말했으면 그걸로 가린다.
    //   세부상품명이 완전히 같은 경우가 있다.
    //   예) "펜할리곤스 더치스로즈" 는 [펜할리곤스 향수] 와 [미니어처 향수] 양쪽에 똑같이 있고,
    //       구분 단어("미니")는 세부상품명이 아니라 상품명에만 들어 있다.
    //   → 채팅에 "미니"가 있으면 [미니어처 향수] 로 확정한다.
    if (!pick && uniq.length > 1) {
      const chatTokens = text.split(/[^a-z0-9가-힣]+/).filter((w) => w.length >= 2);
      // 후보 세부상품명에 "공통으로" 든 단어(=브랜드·향 이름)는 구분 단어가 아니다.
      //   "미니 펜할리곤스 더치스로즈" 에서 구분 단어는 "미니" 하나뿐이다.
      //   "펜할리곤스"를 구분에 쓰면 [펜할리곤스 향수] 쪽으로 잘못 끌려간다.
      const strong = chatTokens.filter(
        (w) => !uniq.every((h) => squash(h.variant).includes(squash(w)))
      );
      // 구분 단어 우선 → 없으면 전체 단어로 한 번 더 시도
      for (const tokens of [strong, chatTokens]) {
        if (tokens.length === 0) continue;
        const byName = uniq.filter((h) => {
          const body = squash(nameBody(h.p.name));
          return tokens.some((w) => {
            const sw = squash(w);
            return sw.length >= 2 && body.includes(sw);
          });
        });
        if (byName.length === 1) { pick = byName[0]; tieReason = "상품 구분 단어로 확정"; break; }
      }
    }

    // 동점 해소 ②: 그래도 못 가리면 「지금 이거」로 지정된 상품을 우선한다.
    //   방송 중 셀러가 직접 지정한 값이므로 채팅 문자열보다 강한 신호다.
    //   (예: "딥티크 로즈"가 캔들·차량용 양쪽에 있을 때, 지금 파는 쪽으로 확정)
    if (!pick && uniq.length > 1 && currentProductId) {
      const onCurrent = uniq.filter((h) => h.p.id === currentProductId);
      if (onCurrent.length === 1) { pick = onCurrent[0]; tieReason = "「지금 이거」로 확정"; }
    }
    // 둘 다 실패하면 담지 않는다 — 손님이 어느 쪽인지 말해야 접수된다.
    if (pick) {
      return {
        status: "parsed", productId: pick.p.id, productName: pick.p.name,
        matchedBy: "variant", variantName: pick.variant,
        qty, optionTokens, candidates: [],
        reason: tieReason ? `세부상품 동점 → ${tieReason}` : "세부상품 일치 → 옵션 확정",
      };
    }
    // 동점인데 「지금 이거」로도 못 가리면 아래 번호/상품명 매칭으로 계속 진행한다(기존 동작 유지).
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
      const names = [nameBody(p.name), ...(p.aliases || [])].filter(Boolean);
      let best = 0;
      for (const n of names) {
        const s = squash(n);
        if (s.length >= 2 && squashed.includes(s)) { best = Math.max(best, s.length * 10); continue; }
        // 상품명을 단어로 쪼개 2글자 이상 조각이 메시지에 있으면 부분 점수
        const chatWords = text.split(/[^a-z0-9가-힣]+/).filter((x) => x.length >= 2);
        for (const piece of String(n).split(/[\s()[\]{}·・,./\-_~]+/).filter((x) => x.length >= 2)) {
          const sp = squash(piece);
          if (squashed.includes(sp)) { best = Math.max(best, sp.length); continue; }
          // 손님은 줄여서 말한다: "미니" → "미니어처". 채팅 단어가 상품명 조각의 앞부분이면 인정.
          for (const w of chatWords) {
            const sw = squash(w);
            if (sw.length < 2) continue;
            if (sp.startsWith(sw)) { best = Math.max(best, sw.length); continue; }
            if (looseEqual(sw, sp)) best = Math.max(best, sp.length);   // "딥디크" → "딥티크"
          }
        }
      }
      return { p, score: best };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) {
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

  // 3순위: 「지금 이거」
  if (currentProductId) {
    const p = products.find((x) => x.id === currentProductId);
    if (p) {
      return { status: "parsed", productId: p.id, productName: p.name, matchedBy: "current", variantName: null, qty, optionTokens, candidates: [], reason: "「지금 이거」로 적용" };
    }
  }

  return { ...base, status: "need_product", qty, optionTokens, reason: "상품을 말하지 않았고 「지금 이거」도 없음" };
}
