// components/order/OrderGuideCard.tsx
// 목적: 주문서 작성 전 고객 안내 카드
// 주의: 주문 저장/금액/DB 로직 없음

export default function OrderGuideCard() {
  return (
    <section className="mb-5 rounded-[28px] bg-white p-5 shadow-[0_12px_26px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[24px] text-blue-600 ring-1 ring-blue-100">
          🛡️
        </div>

        <div>
          <h2 className="text-[20px] font-black tracking-[-0.06em] text-[#151923]">
            주문 전 확인
          </h2>

          <div className="mt-2 space-y-1 text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
            <p>• 방송에서 접수 후 주문서를 작성해주세요.</p>
            <p>• 상품명 / 색상 / 사이즈 / 수량 / 금액을 정확히 입력해주세요.</p>
            <p>• 자동입력된 색상/사이즈는 제출 전 한 번만 확인해주세요.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
