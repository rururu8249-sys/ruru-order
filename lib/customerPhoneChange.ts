// lib/customerPhoneChange.ts
// [2026-08-30] 회원 전화번호 변경의 "판단 규칙"만 따로 뺀 것.
//
// 왜 뺐나
//   전화번호는 포인트·합배송·입금매칭의 기준(식별키)이다.
//   여기서 한 글자만 잘못 통과시켜도 남의 주문이 딸려오거나 택배비가 다시 붙는다.
//   그래서 화면·API 와 분리해서 자동 검사를 돌릴 수 있게 한다.
//
// ⚠️ 판단만 한다. DB 를 쓰지 않는다.

export const phoneDigits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");

/** 옛 주문이 하이픈 포맷일 수 있어 매칭 후보를 숫자/하이픈 둘 다 만든다. */
export function phoneVariants(d: string): string[] {
  const digits = phoneDigits(d);
  const set = new Set<string>();
  if (!digits) return [];
  set.add(digits);
  if (digits.length === 11) set.add(`${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`);
  else if (digits.length === 10) set.add(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`);
  // 서울 9자리 (02-777-1234)
  else if (digits.length === 9 && digits.startsWith("02")) set.add(`${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`);

  // [2026-08-30] 서울 10자리는 옛 저장분("026-4906-376")과 새 표기("02-6490-6376")가 섞인다.
  //   번호 변경 때 옛 주문을 놓치면 안 되므로 두 형태를 모두 후보에 넣는다.
  if (digits.length === 10 && digits.startsWith("02")) {
    set.add(`${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`);
  }
  return [...set];
}

export type PhoneCheck = { ok: true } | { ok: false; message: string };

/**
 * 새 전화번호가 저장 가능한 값인지.
 * 010 을 강제하지 않는다 — 일반전화(02-…)로 주문하는 손님이 있다.
 */
export function validateNewPhone(currentRaw: unknown, nextRaw: unknown): PhoneCheck {
  const current = phoneDigits(currentRaw);
  const next = phoneDigits(nextRaw);
  if (!next) return { ok: false, message: "새 전화번호를 입력해주세요." };
  if (next.length < 9 || next.length > 11) return { ok: false, message: "전화번호는 숫자 9~11자리여야 합니다." };
  if (!current) return { ok: false, message: "지금 번호를 찾지 못했습니다." };
  if (next === current) return { ok: false, message: "지금 번호와 같습니다." };
  return { ok: true };
}

/** 새 번호를 쓰는 다른 회원이 있으면 막는다(번호 재사용 → 남의 주문 딸려옴 방지). */
export function conflictMessage(
  owners: Array<{ id?: unknown; youtube_nickname?: unknown; customer_name?: unknown }>,
  targetId: unknown,
): string {
  const others = (owners || []).filter((row) => String(row?.id ?? "") !== String(targetId ?? ""));
  if (others.length === 0) return "";
  const first = others[0];
  const who = String(first?.youtube_nickname || first?.customer_name || "다른 회원").trim() || "다른 회원";
  return `이미 「${who}」님이 이 번호를 쓰고 있습니다.\n번호만 바꾸면 두 사람 주문이 섞입니다 — 고객 병합으로 처리해주세요.`;
}
