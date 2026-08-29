// [2026-08-29] 고객 식별 통합 — 관리자 고객목록에서 같은 사람이 여러 명으로 갈라지는 문제 해결
//
// 왜 생겼나 (실측)
//   관리자 고객목록은 주문의 "전화번호"로만 사람을 묶고 있었다(buildCustomerKey).
//   손님이 배송지 번호를 바꾸거나 다른 번호로 주문하면 주문마다 번호가 달라져
//   화면에서 한 사람이 2명, 3명으로 갈라져 보인다.
//   실제 DB에는 회원이 1명뿐인데도 그렇다.
//   예: 루루짱929(kakao_id 5006208833)는 customers 행이 1개뿐인데
//       주문 전화번호가 01028495209 / 01033995209 두 개라 목록에 2명으로 나왔다.
//
// 어떻게 고치나 — "합치기만" 한다
//   카카오ID를 키로 바꾸는 방식은 위험하다. 주문에는 카카오ID가 없고 회원 프로필에는 있는 경우
//   서로 다른 키가 되어 오히려 목록이 늘어난다.
//   그래서 키를 바꾸는 대신, 카카오ID와 전화번호를 서로 이어붙여 하나의 덩어리로 만든다.
//     · 카카오ID가 같으면   → 번호가 달라도 한 사람
//     · 전화번호가 같으면   → 카카오ID가 없어도 한 사람 (기존 동작 그대로)
//   이 방식은 묶기만 하고 절대 쪼개지 않는다. 즉 이 수정으로 고객 수가 늘어날 수 없다.
//
// 표시 전용이다. 주문·회원 데이터를 쓰지 않는다.

export type CustomerIdentityRef = { kakaoId?: unknown; phone?: unknown };

const kakaoToken = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text ? `k:${text}` : "";
};
const phoneToken = (value: unknown) => {
  const text = String(value ?? "").replace(/\D/g, "");
  return text ? `p:${text}` : "";
};

export function buildCustomerIdentityResolver(refs: CustomerIdentityRef[]) {
  const parent = new Map<string, string>();

  const add = (token: string) => {
    if (!parent.has(token)) parent.set(token, token);
    return token;
  };

  const find = (token: string): string => {
    add(token);
    let root = token;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    // 경로 압축 — 다음 조회를 빠르게
    let cursor = token;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor) as string;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    // 사전순으로 작은 쪽을 대표로 → 입력 순서와 무관하게 같은 결과가 나온다
    if (rootA < rootB) parent.set(rootB, rootA);
    else parent.set(rootA, rootB);
  };

  for (const ref of refs ?? []) {
    const kakao = kakaoToken(ref?.kakaoId);
    const phone = phoneToken(ref?.phone);
    if (kakao) add(kakao);
    if (phone) add(phone);
    if (kakao && phone) union(kakao, phone);
  }

  // 식별값이 하나도 없으면 빈 문자열 → 호출부가 기존 이름 기반 키로 폴백한다.
  return (ref: CustomerIdentityRef): string => {
    const kakao = kakaoToken(ref?.kakaoId);
    if (kakao) return find(kakao);
    const phone = phoneToken(ref?.phone);
    if (phone) return find(phone);
    return "";
  };
}
