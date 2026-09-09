// lib/nicknameConflict.ts
// [2026-09-09] "이 닉네임, 남이 쓰는 이름인가?" 판정 한 곳 — 용서린 사고로 신설
//
// 무엇이 잘못됐었나 (실측)
//   customers 91  = 01071437473 · youtube_nickname '용서린' · kakao_id 없음 · 주문 6건 · 포인트 3,450
//   customers 2855= 01086247473 · youtube_nickname '용서린' · kakao_id 5079103151 · 주문 0
//   손님이 카톡을 새로 만들어 들어왔는데 «중복 닉네임 검사»를 그냥 통과했다.
//
//   예전 조건:  existingPhone && cleanPhone && existingPhone !== cleanPhone
//   ↑ 「내 번호(cleanPhone)를 알 때만」 남인지 따진다.
//     그런데 닉네임 관문은 «전화번호를 입력하기 전» 화면이다. 새 카톡 손님은 그 시점에 번호가 없다.
//     → cleanPhone = "" → 조건이 통째로 거짓 → 누구나 남의 닉네임을 가져갈 수 있었다.
//
// 새 규칙 (셋 다 만족해야 «남»)
//   ① 내 카톡이 이미 쓰던 이름이면 → 내 이름 (폰 바꿔 번호를 몰라도 통과)
//   ② 내 번호를 모르면 → 남일 수 있다 (막다른 길 대신 «계정 연결» 화면으로 보낸다)
//   ③ 내 번호를 알면 → 번호가 다를 때만 남 (예전 규칙 그대로)
//
// 이 파일은 판정만 한다. 돈·포인트·주문·입금·정산·배송 무접촉.

import { normalizeOrderPhone } from "./order/phone";

export type NicknameOwnerRow = {
  customer_phone?: unknown;
  kakao_id?: unknown;
};

export type NicknameConflictInput = {
  /** 같은 youtube_nickname 을 쓰는 customers 줄들 */
  rows: NicknameOwnerRow[];
  /** 지금 손님의 전화번호 (아직 모르면 "") */
  myPhone: unknown;
  /** 지금 손님의 카카오ID (없으면 "") */
  myKakaoId: unknown;
};

const clean = (value: unknown) => String(value ?? "").trim();

export function isNicknameTakenByOthers({ rows, myPhone, myKakaoId }: NicknameConflictInput): boolean {
  const phone = normalizeOrderPhone(String(myPhone ?? ""));
  const kakaoId = clean(myKakaoId);

  return (rows || []).some((row) => {
    const rowPhone = normalizeOrderPhone(String(row?.customer_phone ?? ""));
    const rowKakaoId = clean(row?.kakao_id);

    // ① 내 카톡이 이미 쓰던 이름 → 내 이름
    if (kakaoId && rowKakaoId && rowKakaoId === kakaoId) return false;

    // ② 내 번호를 아직 모른다 → 남일 수 있다
    if (!phone) return true;

    // ③ 번호가 다르면 남
    return Boolean(rowPhone && rowPhone !== phone);
  });
}
