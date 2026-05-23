// components/order/OrderProductInputGuideDetail.tsx
// 목적: 주문상품 입력 안내 상세 UI
// 주의: UI 전용. 상품 저장, 금액계산, 배송비, Supabase, 주문 제출 로직 없음.

type OrderProductInputGuideDetailProps = {
  show: boolean;
  broadcastActive: boolean;
  broadcastProductCount: number;
};

export default function OrderProductInputGuideDetail({
  show,
  broadcastActive,
  broadcastProductCount,
}: OrderProductInputGuideDetailProps) {
  if (!show) return null;

  return (
    <div className="mt-3 grid gap-3">
      {broadcastActive && broadcastProductCount > 0 && (
        <div className="rounded-[1.2rem] bg-blue-50 p-3 text-xs font-bold leading-relaxed text-blue-700 ring-1 ring-blue-100">
          🔵 방송상품 {broadcastProductCount}개 연결됨
          <br />
          상품명 칸을 누르면 목록에서 선택할 수 있어요.
        </div>
      )}

      {broadcastActive && broadcastProductCount === 0 && (
        <div className="rounded-[1.2rem] bg-yellow-50 p-3 text-xs font-bold leading-relaxed text-yellow-700 ring-1 ring-yellow-100">
          ⚠️ 연결된 방송상품이 없어 직접 입력해주세요.
        </div>
      )}

      <div className="rounded-[1.2rem] bg-red-50 p-3 text-xs font-black leading-relaxed text-red-600 ring-1 ring-red-100">
        상품 1개당 1칸씩 작성해주세요.
        <br />
        색상·사이즈가 없으면 “없음”으로 입력해주세요.
        <br />
        상품금액은 택배비를 제외한 상품 가격만 입력해주세요.
      </div>
    </div>
  );
}
