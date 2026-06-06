// 방송 위젯 라우트 (OBS/PRISM 브라우저 소스용 URL) — 시안 6번.
// 배경 투명(크로마키). 고정/순환 상품 + 주문 토스트. 읽기 전용.

import ProductWidgetClient from "@/components/product-widget/ProductWidgetClient";

export const dynamic = "force-dynamic";

export default function ProductWidgetPage() {
  return <ProductWidgetClient />;
}
