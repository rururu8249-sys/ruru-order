// lib/cardPayNoticeText.ts
// 카드결제 안내 한 줄 — 「카톡으로 결제링크 보냈으니 확인해달라」.
//
// 쓰이는 곳 «두 군데»이고 문구가 달라지면 안 되므로 여기 한 곳에서만 만든다.
//   1) components/admin-live/AdminLiveCardPayPopup.tsx — 복사 + 방송위젯 📢 한 줄(feed_notice_text)
//   2) app/api/admin-live/card-pay-notice/route.ts      — 봇이 유튜브 채팅에 올리는 글
//
// [2026-09-20 사장님 지적] 「글씨 내용이 너무 많아 두 줄로 보이고 오른쪽으로 너무 간다」
//   실측(lib/feedText.ts 의 estimateTextWidth · FEED_PIN_AVAIL_W=778px 기준):
//     예전 문구 「💳 ○○님 카카오톡으로 카드결제 링크 보내드렸어요! 📩 확인 부탁드려요 🙏」
//       닉네임 3자(임언냐)에도 1254px — 한도의 1.6배. 26px까지 줄여도 «항상» 2줄이었다.
//     지금 문구는 닉네임 8자에서 775px(34px 그대로 한 줄), 10자여도 글자를 조금 줄여 한 줄.
//   ⚠ 아래 문구를 늘리면 다시 2줄이 된다. scripts/test-card-pay-notice.mjs 가 이를 막는다.
//
// 공개 채팅·방송화면에 뜨는 글이라 금액·전화번호는 «절대» 넣지 않는다(기존 기준 유지).
export function buildCardPayNoticeText(nickname: string): string {
  const nick = String(nickname ?? "").trim();
  return `💳 ${nick}님 카톡 결제링크 확인해주세요 🙏`;
}
