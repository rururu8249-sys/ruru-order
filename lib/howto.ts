// 주문 방법 팝업(손님 주문서 접속 시) 설정 — 관리자/고객 페이지 공용.
//   settings 테이블 키: howto_enabled("true"/"false"), howto_steps(JSON 문자열)
//   표시 전용이며 돈/주문 로직과 무관하다.

export type HowtoStep = { title: string; desc: string };
export type HowtoConfig = { steps: HowtoStep[]; warn: string };

// 설정이 비어 있거나 깨져 있으면 이 기본값이 그대로 보인다(기존 하드코딩 문구와 동일).
export const HOWTO_DEFAULT: HowtoConfig = {
  steps: [
    { title: "방송 채팅에서 상품 주문", desc: "상품명·옵션·수량을 남기고 접수 여부를 확인해 주세요." },
    { title: "주문서에서 상품·옵션 확인 후 담기", desc: "방송에서 주문한 상품을 찾아 옵션과 수량을 확인해 담아 주세요." },
    { title: "배송지·결제금액 확인 후 제출·결제", desc: "주문서를 제출한 뒤 선택한 결제 방법의 안내를 따라 주세요." },
  ],
  warn: "무통장입금은 닉네임과 결제금액이 정확히 일치해야 자동 확인됩니다. 입금 확인은 보통 10~30분 걸리며 주문내역에서 확인할 수 있어요.",
};

// JSON 파싱 실패 / 형식 불일치 시 기본값 반환 → 손님 화면이 절대 비지 않는다.
export function parseHowtoSteps(raw: unknown): HowtoConfig {
  try {
    const j = JSON.parse(String(raw ?? "")) as { steps?: unknown; warn?: unknown };
    const steps = Array.isArray(j?.steps) ? (j.steps as HowtoStep[]) : [];
    if (steps.length !== 3) return HOWTO_DEFAULT;
    return {
      steps: steps.map((s, i) => ({
        title: String(s?.title ?? HOWTO_DEFAULT.steps[i].title),
        desc: String(s?.desc ?? ""),
      })),
      warn: String(j?.warn ?? HOWTO_DEFAULT.warn),
    };
  } catch {
    return HOWTO_DEFAULT;
  }
}
