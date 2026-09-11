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
  const list = rows || [];

  // ★ [2026-09-11 실기기에서 잡힘] «내가 이미 이 이름의 주인인가»를 «줄 전체»에서 먼저 본다.
  //   왜 먼저 보나 — 예전엔 줄 하나하나를 따로 판정해서, 내 줄을 통과시켜 놓고도
  //   같은 이름의 «다른 줄» 하나 때문에 some() 이 true 가 되어 결국 막혔다.
  //   실측(2026-09-11, 사장님 카톡 로그인): 「루루동이」는 회원 줄이 2개(카톡 있는 줄 1 = 사장님).
  //     → 사장님 본인인데 「이 이름을 쓰는 분이 이미 계세요」가 떴다.
  //   내 카톡이나 내 번호로 된 줄이 하나라도 있으면 그 이름은 «내 이름»이다.
  const mine = list.some((row) => {
    const rowKakaoId = clean(row?.kakao_id);
    if (kakaoId && rowKakaoId && rowKakaoId === kakaoId) return true;
    const rowPhone = normalizeOrderPhone(String(row?.customer_phone ?? ""));
    return Boolean(phone && rowPhone && rowPhone === phone);
  });
  if (mine) return false;

  // 내 줄이 하나도 없을 때만 «남인지»를 따진다
  return list.some((row) => {
    const rowPhone = normalizeOrderPhone(String(row?.customer_phone ?? ""));

    // ② 내 번호를 아직 모른다 → 남일 수 있다 (계정 연결 화면으로 보낸다)
    if (!phone) return true;

    // ③ 번호가 다르면 남
    return Boolean(rowPhone && rowPhone !== phone);
  });
}
