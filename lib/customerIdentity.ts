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

// ────────────────────────────────────────────────────────────────────────────
// [2026-08-29] 손님이 지금까지 써 온 "모든 전화번호" 모으기
//
//   왜 필요한가
//     로그인할 때 옛 주문에 카카오ID를 붙여 주는 로직이 있는데(customer-login-sync),
//     지금 쓰는 번호로만 찾아서 "번호를 바꾼 손님"의 옛 주문은 영영 연결되지 않았다.
//     그래서 번호를 바꾸면 그 이전 주문이 손님 화면에서 사라진다.
//
//   어디서 모으나
//     ① 지금 로그인에 실려 온 번호
//     ② 회원 프로필에 저장된 번호 (아직 안 바뀐 옛 번호일 수 있다)
//     ③ customers.customer_history 의 전화번호 변경 이력 (바꾸기 전 번호가 그대로 남아 있다)
//     ④ 이미 이 사람(카카오ID)으로 연결된 주문들의 전화번호
//        — 배송지 번호로 주문했거나 예전에 다른 번호를 썼던 흔적이 여기 남는다
//
//   안전
//     반환값은 "이 사람의 번호 후보"일 뿐이고, 실제 연결은 kakao_id 가 비어 있는 주문에만 한다.
//     이미 주인이 있는 주문은 절대 건드리지 않는다.
// ────────────────────────────────────────────────────────────────────────────

const PHONE_FIELD = /phone|전화|연락/i;

function toPhoneDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function collectKnownPhoneDigits(input: {
  current?: unknown;
  profilePhone?: unknown;
  history?: unknown;
  linkedOrderPhones?: unknown;
}): string[] {
  const found = new Set<string>();
  const push = (value: unknown) => {
    const digits = toPhoneDigits(value);
    // 10자리 미만은 전화번호로 보지 않는다(잘못 매칭되어 남의 주문을 잡는 것을 막는다)
    if (digits.length >= 10) found.add(digits);
  };

  push(input?.current);
  push(input?.profilePhone);

  const history = Array.isArray(input?.history) ? input.history : [];
  for (const entry of history) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const field = String(record.field ?? "");
    if (!PHONE_FIELD.test(field)) continue;
    push(record.old_value);
    push(record.new_value);
  }

  const linked = Array.isArray(input?.linkedOrderPhones) ? input.linkedOrderPhones : [];
  for (const value of linked) push(value);

  return [...found];
}

// [2026-08-29] 소급연결 대상 번호 고르기 — "번호 재사용"으로 남의 주문을 끌어오는 사고 방지
//
// 상황: 손님이 예전에 쓰던 번호가 통신사에서 해지·재판매되어 지금은 다른 손님의 회원번호일 수 있다.
//       그 번호로 kakao_id를 소급 연결하면 남의 주문이 내 주문내역에 뜬다(개인정보 사고).
// 규칙: 그 번호를 "kakao_id가 있는 다른 회원"이 쓰고 있으면 제외한다.
//       kakao_id가 비어 있는 회원 번호는 제외하지 않는다(옛 전화번호 로그인 시절 본인 계정일 수 있음).
// 금액/입금/정산/배송 로직과 무관. 순수 함수.
export function selectBackfillPhoneDigits(input: {
  knownDigits: string[];
  owners: Array<{ customer_phone?: unknown; kakao_id?: unknown }>;
  kakaoId: unknown;
}): string[] {
  const myKakaoId = String(input?.kakaoId ?? "").trim();
  const blocked = new Set<string>();

  for (const owner of Array.isArray(input?.owners) ? input.owners : []) {
    if (!owner || typeof owner !== "object") continue;
    const ownerKakaoId = String(owner.kakao_id ?? "").trim();
    if (!ownerKakaoId) continue;
    if (myKakaoId && ownerKakaoId === myKakaoId) continue;
    const digits = toPhoneDigits(owner.customer_phone);
    if (digits) blocked.add(digits);
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of Array.isArray(input?.knownDigits) ? input.knownDigits : []) {
    const digits = toPhoneDigits(value);
    if (digits.length < 10) continue;
    if (blocked.has(digits)) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    result.push(digits);
  }

  return result;
}
