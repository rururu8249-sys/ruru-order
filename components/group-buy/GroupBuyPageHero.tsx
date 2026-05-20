// components/group-buy/GroupBuyPageHero.tsx
// 목적: 공구상품 페이지 상단 안내 UI
// 주의: UI 전용. 상품조회, 주문저장, 금액/배송비 계산, Supabase 로직 없음.

export default function GroupBuyPageHero() {
  return (
    <header className="mb-5 rounded-[34px] bg-white px-5 py-6 shadow-[0_18px_40px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="inline-flex rounded-full bg-blue-50 px-3 py-1.5 text-[12px] font-black tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100">
        🛒 공구상품
      </div>

      <h1 className="mt-3 text-[36px] font-black leading-tight tracking-[-0.08em] text-[#151923]">
        공구상품
      </h1>

      <p className="mt-2 break-keep text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
        사진 확인 후 바로 주문할 수 있어요.
        <br />
        상품별 배송방식을 꼭 확인해주세요.
      </p>

      <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-blue-800 ring-1 ring-blue-100">
        공구상품은 HOME 하단 메뉴에서만 들어오는 전용 페이지입니다.
      </div>
    </header>
  );
}
