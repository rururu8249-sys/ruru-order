// 주문 방법 팝업(손님 주문서 접속 시) 설정 — 관리자/고객 페이지 공용.
//   settings 테이블 키: howto_enabled("true"/"false"), howto_steps(JSON 문자열)
//   표시 전용이며 돈/주문 로직과 무관하다.

export type HowtoStep = { title: string; desc: string };
export type HowtoConfig = { steps: HowtoStep[]; warn: string };

// 설정이 비어 있거나 깨져 있으면 이 기본값이 그대로 보인다(기존 하드코딩 문구와 동일).
export const HOWTO_DEFAULT: HowtoConfig = {
  steps: [
    { title: "방송에서 루루언니에게 접수 확인", desc: "채팅창에 상품명 · 옵션 · 수량 입력 후 루루언니 접수 완료 확인" },
    { title: "여기서 상품 담고 주문서 제출", desc: "목록에서 상품 찾아 담기 → 주문서 제출" },
    { title: "안내 계좌로 입금", desc: "" },
  ],
  warn: "입금자명은 닉네임으로, 금액은 주문서 결제금액과 정확히 일치해야 자동 확인됩니다",
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
