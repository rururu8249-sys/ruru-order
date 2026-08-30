// scripts/test-alert-identity.mjs
// 쪽지 조회 본인 확인 규칙 검증 — lib/customerAlertIdentity.ts 의 실제 함수를 불러서 확인한다.
//
// 막으려는 사고: 전화번호만 알면 남의 쪽지(제목·내용)를 읽을 수 있던 것.
import {
  cleanSessionKey, cleanPhone, cleanKakaoId, cleanNickname,
  planIdentityLookup, isEmptyPlan, phoneVariants,
} from "../lib/customerAlertIdentity.ts";

let fail = 0;
const ok = (cond, label) => { if (cond) console.log(`✅ ${label}`); else { console.log(`❌ ${label}`); fail = 1; } };
const eq = (got, want, label) => ok(JSON.stringify(got) === JSON.stringify(want), `${label} → ${JSON.stringify(got)}`);

console.log("── 세션키 ──");
eq(cleanSessionKey("3f2a9c1e-0b44-4f2a-9d7e-1a2b3c4d5e6f"), "3f2a9c1e-0b44-4f2a-9d7e-1a2b3c4d5e6f", "UUID 세션키 통과");
eq(cleanSessionKey("abc"), "", "너무 짧으면 버림(찍어 맞히기 방지)");
eq(cleanSessionKey("x".repeat(81)), "", "너무 길면 버림");
eq(cleanSessionKey(null), "", "없으면 빈칸");

console.log("\n── 전화번호 ──");
eq(cleanPhone("010-2849-5209"), "01028495209", "하이픈 제거");
eq(cleanPhone("0212345678"), "0212345678", "일반전화 10자리도 통과(02 손님 있음)");
eq(cleanPhone("0101234"), "", "자릿수 모자라면 버림");
eq(cleanPhone("010123456789"), "", "자릿수 넘치면 버림");
eq(phoneVariants("01028495209"), ["01028495209", "010-2849-5209"], "숫자·하이픈 두 형태로 찾는다");

console.log("\n── 본인 확인 계획 ──");
{
  // ① 핵심: 전화번호만으로는 절대 조회 재료가 안 나온다
  const p = planIdentityLookup({ phone: "01028495209" });
  ok(p.byKakaoId === "" && p.byPhoneAndNickname === null, "전화번호만 → 조회 재료 없음 (남의 쪽지 못 읽음)");
  ok(isEmptyPlan(p) === true, "전화번호만 → 빈 계획으로 판정");
}
{
  const p = planIdentityLookup({ sessionKey: "3f2a9c1e-0b44-4f2a-9d7e-1a2b3c4d5e6f" });
  ok(p.sessionKey !== "" && isEmptyPlan(p) === false, "세션키만 → 통과(추측 불가능한 값)");
}
{
  const p = planIdentityLookup({ phone: "01028495209", kakaoId: "4192837465" });
  eq(p.byKakaoId, "4192837465", "카카오 계정 있으면 그걸로 회원 조회");
}
{
  const p = planIdentityLookup({ phone: "01028495209", nickname: "루루짱" });
  ok(p.byPhoneAndNickname !== null, "번호+닉네임 둘 다 있으면 조회 재료가 된다");
  eq(p.byPhoneAndNickname.phones, ["01028495209", "010-2849-5209"], "번호는 두 형태로 조회");
  eq(p.byPhoneAndNickname.nickname, "루루짱", "닉네임 그대로");
}
{
  const p = planIdentityLookup({ nickname: "루루짱" });
  ok(p.byPhoneAndNickname === null, "닉네임만으로는 안 된다(번호 없이 남의 것 못 봄)");
}
{
  const p = planIdentityLookup({});
  ok(isEmptyPlan(p) === true, "아무것도 없으면 빈 계획");
}
{
  // 공백만 들어온 경우
  const p = planIdentityLookup({ sessionKey: "   ", phone: "  ", kakaoId: " ", nickname: "  " });
  ok(isEmptyPlan(p) === true, "공백만 보내도 통과 못 함");
}

console.log("\n── 부가 검사 ──");
eq(cleanKakaoId("ab"), "", "카카오 계정이 비정상적으로 짧으면 버림");
eq(cleanKakaoId(" 4192837465 "), "4192837465", "앞뒤 공백 제거");
eq(cleanNickname(" 루루짱 "), "루루짱", "닉네임 앞뒤 공백 제거");
eq(cleanNickname("가".repeat(61)), "", "닉네임이 비정상적으로 길면 버림");

console.log(fail ? "\n쪽지 본인확인 테스트 실패" : "\n쪽지 본인확인 테스트 통과");
process.exit(fail);
