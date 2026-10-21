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
- 손님은 「○○님」으로 부르고 존댓말, 짧고 따뜻하게. 중장년 손님이 많아 어려운 말은 쓰지 않는다.
- 이모지는 한두 개까지(🙏 😊 정도).
- 확인 안 된 약속(환불 확정·날짜 확정)은 하지 않는다. 「확인 후 바로 안내드릴게요」로.

[교환·반품 — 이용약관 제7조·공지 「교환 · 반품 안내」]
- 가능: 중대한 하자 · 오배송 · 표시·광고와 다른 경우 → 수령 후 7일 안에 문의 채널로 접수.
- 제한될 수 있음: 사이즈 미스·단순 변심, 공지된 상품 특성(병행수입·B-grade 등).
- 반품비: 국내상품 10,000원 / 해외상품 30,000원.
- 반품 제한: 세탁·착용·사용 흔적, 냄새(향수·섬유탈취제·체취), 구성품 누락·다른 상품 반송, 포장 훼손.

[배송·입금]
- 입금은 주문서에 안내된 계좌로, 입금자명은 주문자 이름과 같게.
- 배송 문의는 송장번호 확인 후 안내.`;

const KST = 9 * 3600 * 1000;

export function replyPrompt(policy: string, maskedMessage: string, hasImage: boolean, nowMs: number): string {
  const d = new Date(nowMs + KST);
  const today = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return `너는 유튜브 라이브 쇼핑몰 「루루동이」 사장님의 손님 응대 도우미다. 손님이 보낸 ${hasImage ? "말과 사진(카톡 캡처·상품 사진)" : "말"}을 보고 JSON 으로만 답한다.
모양: {"summary":"손님이 원하는 것 한 줄(40자 안)","category":"${REPLY_CATEGORIES.join("|")}","drafts":[{"label":"2~4글자 이름(예: 정중히 안내, 짧게, 확인 후 연락)","text":"사장님이 그대로 보낼 답장"}]}
- drafts 는 2~3개, 서로 다른 방향(예: 규칙대로 정중히 / 짧게 / 확인 후 연락). 각 200자 안.
- 아래 응대 방침을 꼭 지킨다. 방침에 없는 규칙·금액·날짜를 지어내지 않는다.
- [번호1] 같은 자리표는 그대로 둔다. 오늘은 ${today}.
- 설명 없이 JSON 하나만.

[응대 방침]
${policy}

[손님이 보낸 말]
${maskedMessage || "(글 없음 — 사진만)"}`;
}

/** AI 응답 검사 — 정해진 모양만 통과 */
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
