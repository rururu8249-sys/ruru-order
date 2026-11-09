// app/order-feed-widget/page.tsx
// [2026-11-09 사장님 「주문·입금 알림 위젯 그 기능 없애, 상품 위젯 하나만 살리자」]
//   주문·입금 피드 위젯 기능 폐지. 프리즘에 예전 주소가 남아 있어도 아무것도 안 그리고(투명) DB·실시간을 전혀 부르지 않는다.
//   주문완료·결제완료 알림은 상품 위젯(/product-widget) 스티커가 그대로 띄운다.

export const dynamic = "force-static";

export default function OrderFeedWidgetPage() {
  return <div style={{ background: "transparent" }} />;
}
