// lib/kakaoPhoto.ts
// [2026-11-10] 카카오 프로필 사진 주소 다듬기 — 방송 채팅 닉네임 앞 사진용.
//   기본 프로필(사진 안 올린 사람)·이상한 주소는 "" → 화면은 닉네임 첫 글자 동그라미로.
//   http 주소는 https 로(사이트가 https 라 http 사진은 브라우저가 막음).
export function cleanKakaoPhotoUrl(url: unknown): string {
  let u = String(url ?? "").trim();
  if (!u || !/^https?:\/\//i.test(u)) return "";
  if (/default_profile|profile_nophoto|anonymous/i.test(u)) return "";
  u = u.replace(/^http:\/\//i, "https://");
  return u.slice(0, 500);
}
