// [2026-10-22 AI 비서 9단계] 좋은 응대 사례 — 사장님이 실제로 보낸 답장을 「사례」로 남기고, 다음 비슷한 문의에서 AI 가 참고한다.
//   저장 = admin_assistant_memos kind='case' 한 줄(body 에 JSON 글자, who=분류). 새 표·SQL 없음. 돈 무접촉.
//   AI 로 가기 전·저장 전에 전화·계좌 번호는 자리표로 가린다(maskSensitive). 이름·닉네임은 사장님 결정대로 그대로.
import { maskSensitive } from "./assistantMemo";

export const CASE_CATEGORIES = ["교환", "반품", "환불", "배송", "입금", "결제", "상품문의", "사이즈", "기타"] as const;
export type CaseCategory = (typeof CASE_CATEGORIES)[number];

export type ReplyCase = {
  /** 손님이 보낸 말(가린 그대로) */
  customer: string;
  /** 당시 상황(AI 분석 또는 사장님 메모) */
  situation: string;
  /** 사장님이 최종으로 보낸 문구 */
  reply: string;
  /** 그 답을 고른 이유 */
  reason: string;
  /** 관련 방침 한 줄(선택) */
  policy: string;
  /** 처리 결과(선택) */
  outcome: string;
};

export const CASE_LIMITS = { customer: 1500, situation: 1200, reply: 1200, reason: 400, policy: 300, outcome: 300 } as const;

export function normalizeCaseCategory(raw: unknown): CaseCategory {
  const s = String(raw ?? "").replace(/\s/g, "");
  if (/반품.?환불|환불/.test(s)) return s.startsWith("반품") && !/환불/.test(s) ? "반품" : "환불";
  for (const c of CASE_CATEGORIES) if (s.includes(c)) return c;
  if (/사이즈|치수/.test(s)) return "사이즈";
  if (/카드|결제/.test(s)) return "결제";
  if (/입금/.test(s)) return "입금";
  if (/배송|출고|택배/.test(s)) return "배송";
  if (/상품/.test(s)) return "상품문의";
  return "기타";
}

/** 사장님이 보낸 사례 입력 → 저장용(번호 가림·길이 제한). 손님 말·최종 문구가 없으면 null */
export function buildCase(input: Partial<Record<keyof ReplyCase, unknown>>): ReplyCase | null {
  const pick = (k: keyof ReplyCase) => maskSensitive(String(input[k] ?? "")).masked.trim().slice(0, CASE_LIMITS[k]);
  const c: ReplyCase = { customer: pick("customer"), situation: pick("situation"), reply: pick("reply"), reason: pick("reason"), policy: pick("policy"), outcome: pick("outcome") };
  if (!c.customer || !c.reply) return null;
  return c;
}

export function serializeCase(c: ReplyCase): string {
  return JSON.stringify(c);
}

export function parseCase(body: unknown): ReplyCase | null {
  try {
    const o = JSON.parse(String(body ?? "")) as Partial<ReplyCase>;
    if (!o || typeof o !== "object") return null;
    const c: ReplyCase = {
      customer: String(o.customer ?? ""), situation: String(o.situation ?? ""), reply: String(o.reply ?? ""),
      reason: String(o.reason ?? ""), policy: String(o.policy ?? ""), outcome: String(o.outcome ?? ""),
    };
    return c.customer && c.reply ? c : null;
  } catch {
    return null;
  }
}

/** AI 에게 주는 모양(분류가 같은 것 우선, 최근순, 최대 n) */
export function casesForAi(rows: { who: string | null; body: string; created_at: string }[], category: string, n = 5): { category: string; customer: string; situation: string; reply: string; reason: string; when: string }[] {
  const want = category ? normalizeCaseCategory(category) : "";
  const parsed = rows.map((r) => ({ cat: String(r.who || "기타"), when: String(r.created_at || "").slice(0, 10), c: parseCase(r.body) })).filter((x): x is { cat: string; when: string; c: ReplyCase } => !!x.c);
  const same = want ? parsed.filter((x) => x.cat === want) : parsed;
  const list = (same.length ? same : parsed).slice(0, n);
  return list.map((x) => ({ category: x.cat, customer: x.c.customer.slice(0, 400), situation: x.c.situation.slice(0, 300), reply: x.c.reply.slice(0, 600), reason: x.c.reason.slice(0, 200), when: x.when }));
}
