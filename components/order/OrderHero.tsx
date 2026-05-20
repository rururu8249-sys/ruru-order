// components/order/OrderHero.tsx
// 목적: 주문서 작성 페이지 상단 안내 디자인
// 주의: 주문 저장/금액/DB 로직 없음

type OrderHeroProps = {
  broadcastTitle?: string;
};

export default function OrderHero({ broadcastTitle }: OrderHeroProps) {
  return (
    <section className="mb-5 rounded-[34px] bg-white p-6 text-center shadow-[0_18px_40px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-[32px] text-white shadow-[0_12px_26px_rgba(37,99,235,0.24)]">
        📝
      </div>

      <div className="mt-4 text-sm font-black tracking-[-0.03em] text-blue-600">
        RURU ORDER
      </div>

      <h1 className="mt-1 text-[36px] font-black leading-tight tracking-[-0.08em] text-[#151923]">
        주문서 작성
      </h1>

      <p className="mt-3 break-keep text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
        방송에서 루루언니에게 접수하신 후,
        <br />
        주문서 작성 및 입금을 진행해주세요.
      </p>

      {broadcastTitle && (
        <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100">
          현재 방송: {broadcastTitle}
        </div>
      )}
    </section>
  );
}
