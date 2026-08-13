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

  // 0순위: 조합형 세부상품명 (가장 구체적 — 맞으면 옵션 1단 축까지 확정)
  //   "킬리안 굿걸" 전체도, 브랜드 뗀 "굿걸"도 잡는다.
  {
    const sq = squash(text);
    type VariantHit = { p: ParseProduct; variant: string; score: number };
    let bestScore = 0;
    let hits: VariantHit[] = [];
    for (const p of products) {
      for (const v of p.variants || []) {
        if (EMPTY_OPTION_WORDS.has(String(v).trim().toLowerCase())) continue;
        const cands = [squash(v)];
        const tail = squash(String(v).split(/\s+/).slice(1).join(" "));
        if (tail.length >= 2) cands.push(tail);
        let hit = 0;
        for (const c of cands) {
          if (c.length >= 2 && sq.includes(c)) hit = Math.max(hit, c.length);
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
    // 동점 후보가 여러 상품에 걸쳐 있으면 「지금 이거」로 지정된 상품을 우선한다.
    //   방송 중 셀러가 직접 지정한 값이므로 채팅 문자열보다 강한 신호다.
    //   (예: "딥티크 로즈"가 두 상품에 다 있을 때, 지금 파는 쪽으로 확정)
    if (!pick && uniq.length > 1 && currentProductId) {
      const onCurrent = uniq.filter((h) => h.p.id === currentProductId);
      if (onCurrent.length === 1) pick = onCurrent[0];
    }
    if (pick) {
      return {
        status: "parsed", productId: pick.p.id, productName: pick.p.name,
        matchedBy: "variant", variantName: pick.variant,
        qty, optionTokens, candidates: [],
        reason: uniq.length > 1 ? "세부상품 동점 → 「지금 이거」로 확정" : "세부상품 일치 → 옵션 확정",
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
        for (const piece of String(n).split(/[\s()[\]{}·・,./\-_~]+/).filter((x) => x.length >= 2)) {
          if (squashed.includes(squash(piece))) best = Math.max(best, squash(piece).length);
        }
      }
      return { p, score: best };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) {
    const p = scored[0].p;
    return { status: "parsed", productId: p.id, productName: p.name, matchedBy: "name", variantName: null, qty, optionTokens, candidates: [], reason: "상품명 일치" };
  }
  if (scored.length > 1) {
    // 상품명 동점도 「지금 이거」로 가린다.
    if (currentProductId) {
      const top = scored.filter((x) => x.score === scored[0].score);
      const onCurrent = top.find((x) => x.p.id === currentProductId);
      if (onCurrent) {
        return { status: "parsed", productId: onCurrent.p.id, productName: onCurrent.p.name, matchedBy: "name", variantName: null, qty, optionTokens, candidates: [], reason: "상품명 동점 → 「지금 이거」로 확정" };
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
