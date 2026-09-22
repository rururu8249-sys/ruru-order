// ═══ 상품 주문 안내 문구 — 2026-09-22 신설 ═══
//
//   사장님: 「관리자페이지 주문서표시 메뉴에다가 밑에 문구 설정가능하게 / 문구는 너의 추천을 따를게」
//
//   손님이 «이 상품을 지금 바로 살 수 있는지»를 담기 버튼 누르기 «전에» 알게 하는 한 줄이다.
//
//   문구를 고른 기준 (사장님 안 → 다듬은 이유):
//     · 사장님 안 1·2(「라이브방송에서 주문가능여부 확인후」 / 「라이브방송 접수후」)는 뜻이 같아 하나로 합쳤다.
//     · 「해당 상품은 ~ 가능한 상품입니다」는 약관·공지 말투라 손님(중장년)이 한 번에 못 읽는다.
//       → 「~해 주세요 / ~할 수 있어요」로 바꿔 «무엇을 하면 되는지»가 먼저 오게 했다.
//     · 이모지는 맨 앞에 하나만 — 스마트스토어·쿠팡의 구매조건 안내와 같은 방식(아이콘 1 + 짧은 한 줄).
//
//   ⚠ 표시 전용이다. 주문 가능 여부를 «막는» 기능이 아니다(막으려면 재고·진열 쪽을 손대야 하고,
//     그건 돈·주문 로직이라 따로 위험분석이 필요하다). 지금은 안내만 한다.

export type ProductNoticeMode = "off" | "live_only" | "instant" | "custom";

/** 고를 수 있는 기본 문구. 사장님이 관리자에서 라디오로 고른다. */
export const PRODUCT_NOTICE_PRESETS: { mode: ProductNoticeMode; label: string; text: string }[] = [
  { mode: "off", label: "표시 안 함", text: "" },
  {
    mode: "live_only",
    label: "라이브 접수 후 구매",
    // [2026-09-22 4차] 사장님: 「말을 좀 못줄이나? 두줄 별로인거 같음」
    //   35자 → 20자. 아래 «바로 구매»와 끝맺음("~주문할 수 있어요")을 맞춰 나란히 읽힌다.
    //   ⚠ 여기를 늘리면 좁은 폰에서 다시 두 줄이 된다. 한 줄 상한은 PRODUCT_NOTICE_ONE_LINE_MAX(테스트가 지킨다)
    text: "📺 방송에서 접수한 분만 주문할 수 있어요",
  },
  {
    mode: "instant",
    label: "바로 구매 가능",
    text: "🛒 방송 접수 없이 바로 주문할 수 있어요",
  },
  { mode: "custom", label: "직접 입력", text: "" },
];

/** 직접 입력 글자수 상한 — 손님 화면에서 두 줄을 넘기지 않는 길이(실측 기준). */
export const PRODUCT_NOTICE_MAX_LEN = 60;

/** 기본 문구가 «한 줄»로 들어가는 상한 — 2026-09-22 사장님 폰 실측(좁은 폭에서 약 24자부터 넘어감).
 *  ⚠ 기본 문구(PRODUCT_NOTICE_PRESETS)를 이보다 길게 쓰면 두 줄이 된다. 테스트가 막는다. */
export const PRODUCT_NOTICE_ONE_LINE_MAX = 24;

/** 저장값(문자열)을 안전하게 모드로 바꾼다. 모르는 값이면 «표시 안 함». */
export function parseProductNoticeMode(raw: unknown): ProductNoticeMode {
  const v = String(raw ?? "").trim();
  return v === "live_only" || v === "instant" || v === "custom" ? v : "off";
}

/** 손님 화면에 실제로 보일 한 줄. ""(빈 문자열)이면 아무것도 그리지 않는다. */
export function resolveProductOrderNotice(mode: unknown, custom: unknown): string {
  const m = parseProductNoticeMode(mode);
  if (m === "off") return "";
  if (m === "custom") return String(custom ?? "").trim().slice(0, PRODUCT_NOTICE_MAX_LEN);
  return PRODUCT_NOTICE_PRESETS.find((p) => p.mode === m)?.text || "";
}

// ═══ [2026-09-22 3차] 두 줄을 «처음부터» 나눠 보여준다 ═══
//
//   사장님: 「문장이 짤려서 밑으로 내려가는게 싫은데 … 보기좋게 «접수 확인된 분만» 이 문장을
//            처음부터 밑에 (줄로) 내리던지」
//
//   좁은 폰에서 글자가 흐르다 아무 데서나 끊기면 «잘린 것»처럼 보인다.
//   문구는 그대로 두고(사장님: 「문장도 매끄럽고」), 가운데점 «·» 을 기준으로
//     첫 줄 = 무엇을 하면 되는지(굵게) / 둘째 줄 = 조건(작게)
//   으로 «항상» 나눈다. 폭이 넓든 좁든 모양이 같다.
//   · 이 없으면(짧은 문구·직접입력) 한 줄 그대로. 사장님이 직접 입력할 때도 · 로 나눌 수 있다.

/** 안내 문구를 «윗줄 / 아랫줄»로 나눈다. 가운데점(·)이 기준. 없으면 sub 는 빈 문자열. */
export function splitProductOrderNotice(text: unknown): { head: string; sub: string } {
  const full = String(text ?? "").trim();
  if (!full) return { head: "", sub: "" };
  const at = full.indexOf("·");
  if (at < 0) return { head: full, sub: "" };
  const head = full.slice(0, at).trim();
  const sub = full.slice(at + 1).trim();
  // 한쪽이 비면 나누지 않는다(«· 주문 가능» 처럼 점으로 시작/끝나는 경우)
  if (!head || !sub) return { head: full.replace(/^·|·$/g, "").trim(), sub: "" };
  return { head, sub };
}

// ═══ [2026-09-22 2차] 상품마다 «개별로» ═══
//
//   사장님: 「아니 특정상품에 개별로 할거라서 이거 상품등록(수정) 하는곳에 설계 해야 하나?」
//   → 맞다. 상품 등록·수정에 칸을 두고, 설정 화면의 값은 «전체 기본값»이 된다.
//     · 상품마다 기본은 «기본값 따름» → 상품 100개를 올려도 매번 고를 필요가 없다
//     · 다른 상품만 골라서 바꾼다 (스마트스토어의 «상품별 안내» 와 같은 구조)
//   저장 자리: products.product_note JSON 에 키 2개(order_notice_mode / order_notice_custom).
//     재고·옵션 플래그들이 이미 쓰는 자리라 **DB 변경이 없다**(ADD COLUMN 조차 불필요).

export type ProductNoticeProductMode = "inherit" | ProductNoticeMode;

/** 상품 등록·수정 화면의 선택지. 맨 위가 기본값(= 전체 설정을 따른다). */
export const PRODUCT_NOTICE_PRODUCT_OPTIONS: { mode: ProductNoticeProductMode; label: string }[] = [
  { mode: "inherit", label: "기본값 따름 (설정 → 주문서 표시)" },
  { mode: "off", label: "이 상품만 표시 안 함" },
  { mode: "live_only", label: "라이브 접수 후 구매" },
  { mode: "instant", label: "바로 구매 가능" },
  { mode: "custom", label: "직접 입력" },
];

/** 상품에 저장된 값을 안전하게 모드로. 키가 없으면(예전 상품) «기본값 따름». */
export function parseProductNoticeProductMode(raw: unknown): ProductNoticeProductMode {
  const v = String(raw ?? "").trim();
  if (v === "off" || v === "live_only" || v === "instant" || v === "custom") return v;
  return "inherit"; // "" · "inherit" · 모르는 값 전부 여기로
}

/** 손님 화면 한 줄 — 상품 설정이 먼저, «기본값 따름»이면 전체 설정으로 내려간다.
 *  ⚠ 표시 전용. 주문을 막지 않는다. */
export function resolveProductNoticeFor(input: {
  productMode?: unknown;
  productCustom?: unknown;
  globalMode?: unknown;
  globalCustom?: unknown;
}): string {
  const pm = parseProductNoticeProductMode(input.productMode);
  if (pm !== "inherit") return resolveProductOrderNotice(pm, input.productCustom);
  return resolveProductOrderNotice(input.globalMode, input.globalCustom);
}
