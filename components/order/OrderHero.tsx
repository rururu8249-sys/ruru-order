// components/order/OrderHero.tsx
// 새 파일 생성
// 위치: /Users/ruru/Desktop/ruru-order-app/components/order/OrderHero.tsx
// 목적: 주문서 작성 페이지 상단 안내 디자인
// 주의: 주문 저장/금액/DB 로직 없음

type OrderHeroProps = {
  broadcastTitle?: string;
};

export default function OrderHero({ broadcastTitle }: OrderHeroProps) {
  return (
    <section className="relative mb-5 overflow-hidden rounded-[34px] bg-[#fffaf3] p-6 text-center shadow-[0_18px_40px_rgba(70,45,25,0.10)] ring-1 ring-white/70">
      <div className="pointer-events-none absolute -left-8 top-8 h-28 w-28 rounded-full bg-[#d7e3c2]/60 blur-2xl" />
      <div className="pointer-events-none absolute -right-10 top-10 h-28 w-28 rounded-full bg-[#f5d7c8]/70 blur-2xl" />

      <div className="relative">
        <div className="text-sm font-black tracking-[-0.03em] text-[#f05a45]">
          RURU ORDER
        </div>

        <h1 className="mt-1 text-[38px] font-black leading-tight tracking-[-0.08em] text-[#2b211c]">
          주문서 작성
        </h1>

        <p className="mt-3 text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-[#7b6554]">
          방송에서 루루언니에게 접수하신 후,
          <br />
          주문서 작성은 꼭 완료해주세요!
        </p>

        {broadcastTitle && (
          <div className="mt-4 rounded-2xl bg-[#f8e9df] px-4 py-3 text-sm font-black tracking-[-0.04em] text-[#5a4034]">
            현재 방송: {broadcastTitle}
          </div>
        )}
      </div>
    </section>
  );
}
