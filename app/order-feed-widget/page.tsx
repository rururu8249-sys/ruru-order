// app/order-feed-widget/page.tsx
// [2026-09-12] 방송 화면용 «주문·입금 피드» 위젯 라우트 (PRISM/OBS 브라우저 소스 URL)
//   유튜브 채팅처럼 쌓이는 주문/입금/카드 알림 — 유튜브 API 안 씀(쿼터 0). 배경 투명. 읽기 전용.
//   PRISM: 브라우저 소스 → https://ruru-order.vercel.app/order-feed-widget  (폭 640 이상 권장)
//   미리보기: ?preview=1  (방송 없어도 견본 3줄)

import OrderFeedWidgetClient from "@/components/order-feed-widget/OrderFeedWidgetClient";

export const dynamic = "force-dynamic";

export default function OrderFeedWidgetPage() {
  return <OrderFeedWidgetClient />;
}
