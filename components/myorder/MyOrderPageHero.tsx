// components/myorder/MyOrderPageHero.tsx
// 목적: 주문조회 페이지 상단 제목 UI
// 주의: UI 전용. 주문조회 로직, Supabase, 주문/입금/정산 로직 없음.

type MyOrderPageHeroProps = {
  isLoggedIn: boolean;
  customerName: string;
};

export default function MyOrderPageHero({
  isLoggedIn,
  customerName,
}: MyOrderPageHeroProps) {
  void isLoggedIn;
  void customerName;

  return (
    <section className="px-2 pb-3 pt-5 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-[36px] shadow-[0_12px_28px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
        🛍️
      </div>

      <h1 className="mt-5 text-[34px] font-black leading-tight tracking-[-0.08em] text-[#151923]">
        주문조회
      </h1>
    </section>
  );
}
