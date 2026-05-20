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
          🔵 현재 방송상품 {broadcastProductCount}개가 연결되어 있습니다.
          <br />
          상품명 칸을 누르면 방송상품 선택과 금액 자동입력이 가능합니다.
          <br />
          목록에 없는 상품은 직접 입력해주세요.
        </div>
      )}

      {broadcastActive && broadcastProductCount === 0 && (
        <div className="rounded-[1.2rem] bg-yellow-50 p-3 text-xs font-bold leading-relaxed text-yellow-700 ring-1 ring-yellow-100">
          ⚠️ 현재 방송은 ON 상태지만 연결된 방송상품이 없습니다.
          <br />
          상품명은 직접 입력해주세요.
        </div>
      )}

      <div className="rounded-[1.2rem] bg-red-50 p-3 text-xs font-black leading-relaxed text-red-600 ring-1 ring-red-100">
        ⚠️ 상품 1칸에는 상품 1개만 입력해주세요.
        <br />
        상품이 여러 개인 경우 아래 [+ 상품 추가하기]를 눌러 각각 입력해주세요.
        <br />
        상품금액은 택배비를 제외한 상품 가격만 적어주세요.
      </div>

      <div className="rounded-[1.2rem] bg-white p-3 text-xs font-bold leading-relaxed text-slate-600 ring-1 ring-blue-100">
        색상·사이즈가 없으면 반드시 “없음”이라고 입력해주세요.
        <br />
        상품명 / 색상 / 사이즈 / 수량 / 금액은 전부 필수입니다.
      </div>
    </div>
  );
}
