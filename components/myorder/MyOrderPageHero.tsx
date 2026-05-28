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
    <section className="px-2 pb-2 pt-3 text-center min-[390px]:pb-3 min-[390px]:pt-5">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-[30px] shadow-[0_12px_28px_rgba(30,64,175,0.08)] ring-1 ring-blue-100 min-[390px]:h-20 min-[390px]:w-20 min-[390px]:text-[36px]">
        🛍️
      </div>

      <h1 className="mt-4 break-keep text-[30px] font-black leading-tight tracking-[-0.07em] text-[#151923] min-[390px]:mt-5 min-[390px]:text-[34px]">
        주문조회
      </h1>
    </section>
  );
}
