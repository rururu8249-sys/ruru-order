// lib/nicknameOwnerPhone.ts
// [2026-09-13] "이 닉네임의 주인 전화번호" — «한 명으로 확정될 때만» 알려준다.
//
// 왜 만들었나 (실측)
//   customers 에 같은 youtube_nickname 을 쓰는 회원이 2026-09-13 기준 18쌍(36명) 있다.
//   예) sunny = 유동(01058417333) / 김선혜(01044964911)   감자 = 김수미 / 김란희   곰 = 김수선 / 김민서
//   전부 «서로 다른 진짜 손님»이다. 흔한 이름이라 겹치는 것이고 사고가 아니다.
//
//   그런데 이벤트 당첨 포인트 지급은 닉네임으로 번호를 찾은 뒤 «첫 줄»을 그대로 썼다(.limit(1)).
//   → 「감자」가 당첨되면 두 감자 중 아무나에게 포인트가 갈 수 있었다. 돈이 잘못 나가는 길이다.
//
// 규칙 (이 파일은 판정만 한다 — DB·포인트·주문 무접촉)
//   · 서로 다른 번호가 2개 이상 나오면 «누구인지 모른다» → ambiguous. 절대 아무나 고르지 않는다.
//   · 정확히 1개면 그 번호. 0개면 none(다음 방법으로 넘어가도 된다).
//   · 같은 번호가 여러 줄 나오는 건 중복이 아니다(주문 여러 건 등) → 1명으로 본다.

export type PhoneRow = { customer_phone?: unknown };

export type PhoneResolveResult =
  | { ok: true; phone: string }
  | { ok: false; reason: "none" }
  | { ok: false; reason: "ambiguous"; phones: string[] };

const digitsOf = (value: unknown) => String(value ?? "").replace(/[^0-9]/g, "");

/** 줄들에서 «서로 다른 번호»를 모아, 딱 하나일 때만 알려준다. */
export function resolveUniqueOwnerPhone(rows: PhoneRow[] | null | undefined): PhoneResolveResult {
  const phones = Array.from(
    new Set((rows || []).map((row) => digitsOf(row?.customer_phone)).filter((p) => p.length >= 10)),
  );
  if (phones.length === 0) return { ok: false, reason: "none" };
  if (phones.length === 1) return { ok: true, phone: phones[0] };
  return { ok: false, reason: "ambiguous", phones };
}

/**
 * 여러 조회 방법을 «순서대로» 시도한다.
 *   · 한 명으로 확정되면 그 번호로 끝.
 *   · 번호가 갈리면(ambiguous) 거기서 «멈춘다» — 다음 방법으로 넘어가지 않는다.
 *     (넘어가면 또 다른 «아무나»를 고르게 되므로, 돈이 나가는 길에서는 멈추는 게 맞다.)
 *   · 아무것도 못 찾으면(none) 다음 방법으로 넘어간다.
 */
export async function resolveOwnerPhoneBySteps(
  steps: (() => Promise<PhoneRow[]>)[],
): Promise<PhoneResolveResult> {
  for (const step of steps) {
    const found = resolveUniqueOwnerPhone(await step());
    if (found.ok) return found;
    if (found.reason === "ambiguous") return found;
  }
  return { ok: false, reason: "none" };
}
