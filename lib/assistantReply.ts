// lib/assistantReply.ts
// [2026-10-22 AI 비서 4단계] 응대 문구 — 손님이 보낸 말(글·사진)을 요약하고 답장 문구 2~3개를 만든다(순수 함수).
//   - 응대 방침(말투·교환반품 규칙·금지 표현)은 사장님이 비서 창에서 고쳐 저장(서버 전용 저장).
//   - 기본 방침은 이용약관 제7조·공지 「교환 · 반품 안내」와 같은 내용으로 시작.
//   - 돈·주문을 바꾸지 않는다: 문구만 만들고, 보내기는 사장님이 복사해서 직접.

export const REPLY_CATEGORIES = ["교환", "반품·환불", "배송", "입금·결제", "상품 문의", "주문 변경", "칭찬·인사", "기타"] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];
export type ReplyDraft = { label: string; text: string };
export type ReplyResult = { summary: string; category: ReplyCategory; drafts: ReplyDraft[] };

export const DEFAULT_REPLY_POLICY = `[말투]
- 손님은 「고객님」(이름을 알면 「○○님」)으로 부르고 존댓말, 짧고 따뜻하게. 중장년 손님이 많아 어려운 말·영어 줄임말은 쓰지 않는다.
- 이모지는 한두 개까지(🙏 😊 정도). 느낌표 남발 금지.
- 확인 안 된 약속(환불 확정·날짜 확정·재입고 날짜)은 하지 않는다. 「확인 후 바로 안내드릴게요」로.
- 불만·불량 연락엔 먼저 공감·사과 한 줄, 그다음 처리 방법 한 줄. 변명·공지 복붙식 긴 답은 금지. 불량 여부를 손님에게 단정해 말하지 않는다(실물 확인 후).

[배송·출고 — 공지 「배송 및 출고 안내」]
- 출고는 평일 영업일 기준 1~3일(주말·공휴일 제외, 물량에 따라 지연 가능).
- 송장번호는 출고 당일 저녁 루루동이 밴드에서 확인. 배송 당일 택배사가 손님 휴대폰으로 문자·카톡을 자동 발송하니 문의 전에 문자함·스팸함 먼저 확인 안내.
- 같은 방송의 일반 상품 여러 주문은 자동 합배송·배송비 1번(따로 요청 불필요). 이미 출고된 주문은 합배송 불가.
- 업체배송 상품(다이슨 등 업체에서 직접 보내는 상품)은 일반 배송과 별도로 따로 배송되며 3~4일 소요된다고 안내. 업체배송비 4,000원(제주·산간 7,000원)이 따로 붙음(기본 배송 무료여도 붙음). 일반 상품과 합배송 안 됨(업체별 배송비 각각 1번).
- 해외배송 상품은 평균 2~3주(주문 날짜 기준이 아니라 해외 일정이 끝나는 날 기준. 현지 제작·통관·배송 상황에 따라 추가 지연 가능).

[주문 전 확인 — 공지]
- 유튜브 닉네임과 주문서 닉네임은 같아야 함. 주문서 제출·입금은 방송에서 주문 접수(장바구니 담기) 후 10분 이내 ~ 방송 종료 전까지.
- 장바구니에 담기만 하면 주문이 아님(주문서 제출 → 입금까지 해야 확정). 담은 지 10일 지나면 장바구니는 자동으로 비워짐.
- 사이즈 추천은 참고용(체형·발볼·발등·착용감 차이) — 정확한 사이즈를 보장하지 않음. 사이즈 문의는 상품 옵션 창의 「사이즈 실측표」를 먼저 보라고 안내.
- 같은 상품을 여러 번 주문하면 1인당 구매 제한에 걸릴 수 있음(상품마다 다름).

[입금·결제 — 공지 「무통장입금 및 입금 확인 안내」]
- 무통장: 주문서에 안내된 계좌로, 입금자명은 주문서 닉네임과 같게, 금액은 안내 금액과 정확히. 입금 후 평균 10~30분 안에 자동 확인 → 주문내역 입금 상태가 「입금확인」으로 바뀜.
- 입금자명·금액을 다르게 넣었으면 방송 채팅이나 쪽지로 알려 달라고 안내(확인 후 처리).
- 카드: 주문서에서 「카드」를 고르면 카톡으로 결제 링크가 가고(휴대폰 번호로만), 그 링크에서 결제. 결제 전엔 「카드미결제」, 결제되면 「카드결제완료」. 카드엔 카드 추가금(약 7%)이 붙어 무통장보다 금액이 조금 높음 — 카드 수수료 성격이라고 안내. 카드 결제는 배송비 포함 5만원 이상만 가능 — 그 미만은 무통장으로 안내.
- 집 전화로도 주문은 되지만 카드 결제 링크·방송 알림톡은 휴대폰 번호로만 감.

[교환·반품·환불 — 이용약관 제7조·공지 「교환·반품 및 환불 안내」]
- 가능: 중대한 하자·불량 · 오배송 · 표시·광고와 다른 경우 · 법령 기간 안 단순 변심(수령 후 7일 이내 청약철회).
- 제한될 수 있음: 사전 안내된 상품 특성에 해당하고 하자 없음 · 세탁·착용·사용으로 가치 감소 · 냄새·오염·구성품 누락·훼손 · 개별 주문·제작 상품(해외 상품은 접수 후 해외 업체에 개별 주문·제작이라 단순변심·사이즈 미스 교환·반품 제한 가능).
- 손님 사유(사이즈 미스·단순 변심) 반품비: 국내상품 10,000원 / 해외상품 30,000원(반품 배송비 포함). 불량·오배송 등 판매자 사유면 배송비는 판매자 부담.
- 반품·교환 보내는 방법: 받으신 그대로(구성품·포장 포함) 다시 포장해서 문 앞에 두시면 반품 접수(택배 회수)를 도와드린다고 안내. 손님이 직접 보낼 필요 없음.
- 환불 방식: 무통장 주문은 손님 계좌로 이체(은행·계좌번호·예금주를 받아야 함), 카드 주문은 카드 결제 전체 취소(부분 취소 없음) 후 손님 부담 반품비가 있으면 그 금액만 따로 입금 받음. 반품·환불된 주문의 적립 포인트는 회수됨.
- 환불은 반품 상품 회수 후 상태·구성품 확인하고 법령에 따라 처리. 환불 확정·날짜는 지어내지 않음.
- 법으로 보장된 손님 권리(수령 7일 이내 청약철회 등)는 공지·사전 안내를 이유로 일괄 거절하지 않음. 거절·제한은 사장님이 실물 확인 후 결정.

[주문 변경·취소·배송지]
- 입금 전 취소는 손님이 주문서에서 직접 취소하거나 쪽지로 요청. 입금 후 취소·옵션 변경은 사장님 확인 후 처리(「확인 후 안내」).
- 이미 낸 주문의 배송지 변경은 카톡채널로 알려 달라고(내정보에서 바꾸면 다음 주문부터 적용). 출고 뒤엔 변경 불가.

[포인트·조회·연락]
- 결제 확인 시 결제금액의 1% 자동 적립(단위 P), 다음 주문서에서 사용. 지급·차감 문의는 사장님 확인 후.
- 주문 조회: 사이트 「주문조회」에서 최근 14일(해외배송 포함 주문은 30일). 그보다 오래된 건 쪽지로 문의.
- 송장은 밴드, 문의는 카톡채널, 방송 중엔 채팅. 주말·공휴일은 답변이 늦을 수 있다고 안내.

[상품 특성 — 공지]
- 병행수입·B-grade·backdoor 유통 상품: A/S·보증 범위, 패키지·구성품, 라벨/QR/시리얼 표기, 품번(SKU), 마감·봉제·로고 디테일이 국내 공식 유통품과 다를 수 있음 → 사전 고지된 특성이라 이 사유는 단순 변심으로 분류, 교환·반품 대상 아님. QR·시리얼·라벨만으로 정품 여부 단정 불가.
- 명품 브랜드는 부티크 전용·익스클루시브·시즌 한정·품절 등으로 공식 홈페이지에 안 보일 수 있고, 일부는 클라이언트 어드바이저로만 판매 → 공홈·구글 검색만으로 출시·유통 여부 단정 불가.
- 1:1 제작 상품은 실밥·미세 이염·마감·세부 디테일에 미세한 차이가 있을 수 있고 품번·시리얼·QR 도 공식 판매품과 다를 수 있음.

[하지 말 것]
- 정품 여부·출시 여부를 단정하지 않음(「병행수입 특성」 안내로 대체). 「무조건」「100%」「최저가」 같은 말 금지.
- 손님의 전화·주소·계좌를 답장에 되묻거나 적지 않음(주문서 기준으로 처리한다고만). 환불 계좌만 필요할 때 요청.
- 다른 셀러·브랜드 비교·비방, 가격 흥정 응답 금지.`;

const KST = 9 * 3600 * 1000;

export function replyPrompt(policy: string, maskedMessage: string, imageCount: number | boolean, nowMs: number): string {
  const n = typeof imageCount === "number" ? imageCount : imageCount ? 1 : 0;
  const d = new Date(nowMs + KST);
  const today = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return `너는 유튜브 라이브 쇼핑몰 「루루동이」 사장님의 손님 응대 도우미다. 손님이 보낸 ${n > 0 ? `말과 사진 ${n}장(카톡 캡처·상품 사진, 순서대로 이어진 대화일 수 있음. 검게 가린 부분은 개인정보라 무시)` : "말"}을 보고 JSON 으로만 답한다.
모양: {"summary":"손님이 원하는 것 한 줄(40자 안)","category":"${REPLY_CATEGORIES.join("|")}","drafts":[{"label":"2~4글자 이름(예: 정중히 안내, 짧게, 확인 후 연락)","text":"사장님이 그대로 보낼 답장"}]}
- drafts 는 2~3개, 서로 다른 방향(예: 규칙대로 정중히 / 짧게 / 확인 후 연락). 각 200자 안.
- 아래 응대 방침을 꼭 지킨다. 방침에 없는 규칙·금액·날짜를 지어내지 않는다.
- 손님 호칭은 「고객님」으로 쓴다(이름을 모르면 지어내지 말 것). [번호1] 같은 자리표는 손님 말에 있을 때만 그대로 두고, 새로 만들지 않는다. 오늘은 ${today}.
- 설명 없이 JSON 하나만.

[응대 방침]
${policy}

[손님이 보낸 말]
${maskedMessage || "(글 없음 — 사진만 보고 판단)"}`;
}

/** AI 응답 검사 — 정해진 모양만 통과 */
/** 손님 말에 없던 자리표([번호2] 등)가 답에 남으면 「고객」으로 바꾼다(AI 가 이름 자리로 지어낸 것) */
export function dropUnknownPlaceholders(s: string, known: number): string {
  return String(s ?? "").replace(/\[번호(\d+)\]/g, (all, n) => (Number(n) <= known ? all : "고객"));
}

export function parseReplyJson(text: string, restore: (s: string) => string = (s) => s): ReplyResult | null {
  try {
    const body = String(text ?? "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const obj = JSON.parse(body) as { summary?: unknown; category?: unknown; drafts?: unknown };
    const summary = restore(String(obj.summary ?? "").trim()).slice(0, 120);
    const category = (REPLY_CATEGORIES as readonly string[]).includes(String(obj.category)) ? (obj.category as ReplyCategory) : "기타";
    const drafts = (Array.isArray(obj.drafts) ? obj.drafts : [])
      .slice(0, 3)
      .map((d) => {
        const r = (d || {}) as Record<string, unknown>;
        return { label: String(r.label ?? "").trim().slice(0, 12) || "답장", text: restore(String(r.text ?? "").trim()).slice(0, 600) };
      })
      .filter((d) => d.text.length > 0);
    if (!summary && drafts.length === 0) return null;
    if (drafts.length === 0) return null;
    return { summary, category, drafts };
  } catch {
    return null;
  }
}

/** 사진 확인: 응대 문구용으로 받는 사진 형식·크기 */
export function validReplyImage(img: unknown): { mime_type: string; data: string } | null {
  const r = (img || {}) as { mimeType?: unknown; data?: unknown };
  const mime = String(r.mimeType ?? "");
  const data = String(r.data ?? "");
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(data)) return null;
  if (data.length > 2_800_000) return null; // 약 2MB 이하(화면에서 줄여서 보냄)
  return { mime_type: mime, data };
}
