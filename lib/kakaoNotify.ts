// [2026-10-26 사장님 「사이트 닫으면 쪽지를 몰라 — 손님이 아무것도 안 해도 폰이 울리게」]
//   카카오 알림톡 문구 틀(템플릿) 두 개 — 사장님이 SOLAPI 에 «이 글자 그대로» 붙여 넣어 카카오 심사를 받는다.
//   승인되면 받은 템플릿 ID 를 설정에 넣고, 그때부터 기존 버튼(결제요청 쪽지·주문 확인 알림)이 카톡도 같이 보낸다.
//   카톡이 없거나 실패하면 SOLAPI 가 같은 내용을 문자로 대신 보낸다(대체발송).
//   표시·발송 전용 — 주문·입금·돈 판정 무접촉. 정보성(주문·결제 안내)만, 할인·추천 문구 넣지 말 것(광고성이면 반려·제재).

export type KakaoNotifyKind = "unpaid" | "cart";

export const KAKAO_NOTIFY_SITE = "https://ruru-order.vercel.app";

export type KakaoNotifyTemplate = {
  kind: KakaoNotifyKind;
  title: string;          // 설정 화면 제목
  when: string;           // 언제 가는지 한 줄
  settingKey: string;     // settings 표에 템플릿 ID 저장하는 키
  name: string;           // SOLAPI 템플릿 이름 칸
  category: string;       // SOLAPI 카테고리 고를 때 안내
  content: string;        // 템플릿 본문 — SOLAPI 에 그대로
  variables: readonly string[];
  button: { name: string; link: string };
};

export const KAKAO_NOTIFY_TEMPLATES: Record<KakaoNotifyKind, KakaoNotifyTemplate> = {
  unpaid: {
    kind: "unpaid",
    title: "입금 요청",
    when: "주문서 「결제요청 쪽지」를 누르면 같이 갑니다(무통장 미입금 주문만)",
    settingKey: "kakao_notify_template_unpaid",
    name: "루루동이 입금 안내",
    category: "거래 > 주문 (또는 결제)",
    content: [
      "[루루동이] 입금 안내",
      "",
      "#{닉네임}님, 주문서가 접수되었습니다.",
      "아직 입금이 확인되지 않아 안내드립니다.",
      "",
      "■ 주문번호: #{주문번호}",
      "■ 입금금액: #{금액}",
      "■ 입금계좌: #{계좌}",
      "",
      "이미 입금하셨다면 확인까지 10~30분 정도 걸립니다.",
    ].join("\n"),
    variables: ["닉네임", "주문번호", "금액", "계좌"],
    button: { name: "주문 조회", link: `${KAKAO_NOTIFY_SITE}/myorder` },
  },
  cart: {
    kind: "cart",
    title: "주문서 제출 안내",
    when: "장바구니 창 「주문 확인 알림」을 누르면 같이 갑니다",
    settingKey: "kakao_notify_template_cart",
    name: "루루동이 주문서 제출 안내",
    category: "거래 > 주문",
    content: [
      "[루루동이] 주문서 제출 안내",
      "",
      "#{닉네임}님, 방송에서 접수하신 상품의 주문서가 아직 제출되지 않았습니다.",
      "",
      "■ 접수 상품: #{상품}",
      "",
      "주문서를 제출하시고 입금까지 마치셔야 주문이 확정됩니다.",
    ].join("\n"),
    variables: ["닉네임", "상품"],
    button: { name: "주문서 열기", link: `${KAKAO_NOTIFY_SITE}/order` },
  },
};

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/** 변수 값 다듬기 — 빈 값은 보내지 않는다(빈 변수는 카카오가 거절). 너무 길면 자른다. */
export function kakaoVariables(kind: KakaoNotifyKind, raw: Record<string, unknown>): Record<string, string> | null {
  const tpl = KAKAO_NOTIFY_TEMPLATES[kind];
  if (!tpl) return null;
  const out: Record<string, string> = {};
  for (const name of tpl.variables) {
    const v = clean(raw[name]).slice(0, name === "상품" ? 60 : 80);
    if (!v) return null;
    out[`#{${name}}`] = v;
  }
  return out;
}

/** 장바구니 상품 이름들 → 「A 외 2개」 */
export function cartProductSummary(names: readonly unknown[]): string {
  const list = Array.from(new Set(names.map(clean).filter(Boolean)));
  if (!list.length) return "";
  const first = list[0].length > 40 ? `${list[0].slice(0, 40)}…` : list[0];
  return list.length > 1 ? `${first} 외 ${list.length - 1}개` : first;
}

/** 템플릿 ID 모양 — SOLAPI 는 영문·숫자·_- 조합(예: KA01TP2410...) */
export function cleanTemplateId(v: unknown): string {
  const s = String(v ?? "").trim();
  return /^[A-Za-z0-9_-]{6,80}$/.test(s) ? s : "";
}

/** 받는 번호 — 휴대폰(010·011…)만. 집전화엔 카톡·문자 안 감. */
export function kakaoTargetPhone(v: unknown): string {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  return /^01[016789]\d{7,8}$/.test(d) ? d : "";
}

/** 설정 화면 미리보기 — 변수에 예시를 넣은 글자 */
export function renderKakaoPreview(kind: KakaoNotifyKind, vars: Record<string, string>): string {
  let text = KAKAO_NOTIFY_TEMPLATES[kind].content;
  for (const [k, v] of Object.entries(vars)) text = text.split(k).join(v);
  return text;
}

/** 버튼 결과 토스트 뒤에 붙일 한 줄 — 템플릿 미설정이면 빈 글자(쪽지만 간 것) */
export function kakaoResultNote(kakao: { status?: string; sent?: number } | null | undefined): string {
  if (!kakao || kakao.status === "not_configured") return "";
  if (kakao.status === "sent" && Number(kakao.sent) > 0) return `\n카톡(또는 문자) ${Number(kakao.sent)}명에게도 보냈어요.`;
  if (kakao.status === "no_phone") return "\n카톡은 휴대폰 번호가 없어 못 보냈어요.";
  return "\n카톡 알림은 실패했어요(설정 › 카톡 알림 확인).";
}
