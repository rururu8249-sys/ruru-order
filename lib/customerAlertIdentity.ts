// lib/customerAlertIdentity.ts
// [2026-08-30] 쪽지 조회 본인 확인 규칙.
//
// 왜 필요한가
//   예전엔 /api/customer-site-alerts?phone=010… 만 넣으면 그 사람 쪽지 제목·내용이 그대로 나왔다.
//   전화번호는 추측·유출이 쉬운 값이라, 번호만으로 남의 쪽지를 읽을 수 있었다.
//   (8/30에 "기기를 바꿔도 받게" 하려고 번호 조회를 넣으면서 생긴 구멍이다)
//
// 규칙
//   ① 세션키(cart_session_key) — crypto.randomUUID() 라 추측 불가. 이것만으로 통과.
//   ② 전화번호는 "혼자서는" 절대 통과 못 한다. 아래 둘 중 하나로 증명돼야 한다.
//      · 카카오 계정(kakao_id) — 이 프로젝트의 고객 식별 원칙(customer-login-sync 참고)
//      · 전화번호 + 유튜브 닉네임이 둘 다 맞는 회원이 실제로 있을 때
//   ③ 증명된 번호는 클라이언트가 보낸 값이 아니라 DB에 있는 값을 쓴다.
//      (번호가 바뀐 손님도 자동으로 최신 번호로 맞춰진다)
//
// ⚠️ 판단 규칙만 둔다. 여기서 DB를 직접 쓰지 않는다(테스트 가능하게).

import { phoneDigits, phoneVariants } from "./customerPhoneChange";

export { phoneDigits, phoneVariants };

/** 세션키로 인정할 수 있는 값인가 — 너무 짧으면 찍어 맞힐 수 있다. */
export function cleanSessionKey(v: unknown): string {
  const t = String(v ?? "").trim();
  return !t || t.length < 6 || t.length > 80 ? "" : t;
}

/** 전화번호 숫자만. 10~11자리가 아니면 버린다. */
export function cleanPhone(v: unknown): string {
  const d = phoneDigits(v);
  return d.length >= 10 && d.length <= 11 ? d : "";
}

export function cleanKakaoId(v: unknown): string {
  const t = String(v ?? "").trim();
  return t.length >= 3 && t.length <= 60 ? t : "";
}

export function cleanNickname(v: unknown): string {
  const t = String(v ?? "").trim();
  return t.length >= 1 && t.length <= 60 ? t : "";
}

export type IdentityInput = {
  sessionKey?: unknown;
  phone?: unknown;
  kakaoId?: unknown;
  nickname?: unknown;
};

/** 회원 조회에 쓸 재료. 어느 것도 없으면 조회 자체를 하지 않는다. */
export type IdentityLookupPlan = {
  sessionKey: string;
  /** kakao_id 로 회원을 찾을 수 있으면 그 값 */
  byKakaoId: string;
  /** 번호+닉네임이 둘 다 있을 때만 채워진다 */
  byPhoneAndNickname: { phones: string[]; nickname: string } | null;
};

export function planIdentityLookup(input: IdentityInput): IdentityLookupPlan {
  const sessionKey = cleanSessionKey(input.sessionKey);
  const phone = cleanPhone(input.phone);
  const kakaoId = cleanKakaoId(input.kakaoId);
  const nickname = cleanNickname(input.nickname);
  return {
    sessionKey,
    byKakaoId: kakaoId,
    byPhoneAndNickname: phone && nickname ? { phones: phoneVariants(phone), nickname } : null,
  };
}

/** 조회할 것이 하나도 없으면 true — 이때는 빈 결과를 준다(에러 아님). */
export function isEmptyPlan(plan: IdentityLookupPlan): boolean {
  return !plan.sessionKey && !plan.byKakaoId && !plan.byPhoneAndNickname;
}
