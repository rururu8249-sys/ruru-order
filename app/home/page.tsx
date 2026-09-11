// app/home/page.tsx
// [2026-09-11 사장님 지적 «완전 옛날 화면인데 이게 왜 나와?»]
//   초창기 HOME(공지·인스타·밴드·유튜브 카드)은 지금 주문서(/order)의 문의 시트·공지 시트가 전부 대신한다.
//   링크는 이미 어디에도 없었다(OrderCustomerTopNav 는 import 만 남은 죽은 파일, 로그아웃 함수는 호출처 없음).
//   옛 북마크·옛 공지 링크로 들어오는 손님만 남으므로 시작 화면(/)으로 보낸다 — 로그인돼 있으면 / 가 알아서 /order 로 통과시킨다.
//   삭제한 파일: components/home/CustomerHomePage.tsx · CustomerHomeHero.tsx · CustomerHomeMenu.tsx · components/order/OrderCustomerTopNav.tsx

import { redirect } from "next/navigation";

export default function HomeMenuPage() {
  redirect("/");
}
