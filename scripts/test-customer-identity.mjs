// [2026-08-29] 고객 식별 통합 테스트
import { buildCustomerIdentityResolver } from "../lib/customerIdentity.ts";
function assert(c, m) { if (!c) throw new Error(m); }
function equal(a, e, m) { if (a !== e) throw new Error(`${m}: expected=${String(e)} actual=${String(a)}`); }

// ── 1. 실제 사례: 루루짱929 — 카카오ID 같고 번호 2개 → 반드시 한 사람 ──
{
  const refs = [
    { kakaoId: "5006208833", phone: "01028495209" }, // 8/28 버버리
    { kakaoId: "5006208833", phone: "01028495209" }, // 7/24 롱샴
    { kakaoId: "5006208833", phone: "01033995209" }, // 7/24 롱샴 (옛 번호)
    { kakaoId: "5006208833", phone: "01033995209" }, // 회원 프로필
  ];
  const resolve = buildCustomerIdentityResolver(refs);
  const keys = new Set(refs.map(resolve));
  equal(keys.size, 1, "카카오ID가 같으면 번호가 달라도 한 사람이어야 한다");
}

// ── 2. 번호만 같고 카카오ID가 없는 옛 주문도 같이 묶인다 (기존 동작 유지) ──
{
  const refs = [
    { kakaoId: "", phone: "01011112222" },      // 카카오 없던 시절 주문
    { kakaoId: "999", phone: "01011112222" },   // 같은 번호로 카카오 로그인 후 주문
    { kakaoId: "999", phone: "01033334444" },   // 번호 바꾼 뒤 주문
  ];
  const resolve = buildCustomerIdentityResolver(refs);
  equal(new Set(refs.map(resolve)).size, 1, "번호 또는 카카오로 이어지면 전부 한 사람");
}

// ── 3. 남남은 절대 안 합쳐진다 ──
{
  const refs = [
    { kakaoId: "111", phone: "01011112222" },
    { kakaoId: "222", phone: "01033334444" },
  ];
  const resolve = buildCustomerIdentityResolver(refs);
  equal(new Set(refs.map(resolve)).size, 2, "관련 없는 두 사람은 따로여야 한다");
}

// ── 4. 절대 쪼개지지 않는다 — 전화번호로 묶이던 것이 늘어나면 안 된다 ──
{
  // 무작위로 만든 데이터에서, 전화기준 묶음 수보다 새 방식 묶음 수가 많으면 실패
  const refs = [];
  for (let i = 0; i < 300; i += 1) {
    const phone = `0101111${String(i % 40).padStart(4, "0")}`;
    const kakao = i % 3 === 0 ? "" : `k${i % 25}`;
    refs.push({ kakaoId: kakao, phone });
  }
  const resolve = buildCustomerIdentityResolver(refs);
  const byPhone = new Set(refs.map((r) => `p:${r.phone}`)).size;
  const byNew = new Set(refs.map(resolve)).size;
  assert(byNew <= byPhone, `새 방식이 더 잘게 쪼개면 안 된다 (전화기준 ${byPhone} / 새방식 ${byNew})`);
}

// ── 5. 입력 순서가 달라도 같은 결과 ──
{
  const a = [{ kakaoId: "7", phone: "01000000001" }, { kakaoId: "7", phone: "01000000002" }];
  const b = [...a].reverse();
  const ra = buildCustomerIdentityResolver(a);
  const rb = buildCustomerIdentityResolver(b);
  equal(ra(a[0]), rb(a[0]), "입력 순서가 달라도 같은 키가 나와야 한다");
  equal(ra(a[1]), rb(a[1]), "입력 순서가 달라도 같은 키가 나와야 한다(2)");
}

// ── 6. 식별값이 없으면 빈 문자열 (호출부가 이름 기반 폴백) ──
{
  const resolve = buildCustomerIdentityResolver([]);
  equal(resolve({ kakaoId: "", phone: "" }), "", "식별값 없으면 빈 문자열");
  equal(resolve({ kakaoId: null, phone: null }), "", "null도 빈 문자열");
  equal(resolve({ phone: "010-2849-5209" }), "p:01028495209", "번호는 숫자만 남긴다");
}

// ── 7. 회원 프로필과 주문이 다른 값을 들고 있어도 이어진다 ──
{
  const refs = [
    { kakaoId: "5006208833", phone: "01033995209" }, // 프로필(옛 번호)
    { kakaoId: "5006208833", phone: "01028495209" }, // 주문(새 번호)
  ];
  const resolve = buildCustomerIdentityResolver(refs);
  equal(resolve(refs[0]), resolve(refs[1]), "프로필과 주문이 한 사람으로 묶여야 한다");
  // 프로필에 카카오가 없고 번호만 있어도 주문과 이어진다
  const refs2 = [
    { kakaoId: "", phone: "01033995209" },
    { kakaoId: "5006208833", phone: "01033995209" },
    { kakaoId: "5006208833", phone: "01028495209" },
  ];
  const r2 = buildCustomerIdentityResolver(refs2);
  equal(new Set(refs2.map(r2)).size, 1, "카카오 없는 프로필도 번호로 이어진다");
}

console.log("customer identity tests passed");
