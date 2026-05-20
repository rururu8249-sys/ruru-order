// components/myorder/MyOrderPageHero.tsx
// 목적: 주문조회 페이지 상단 안내 UI
// 주의: UI 전용. 주문조회 로직 없음.

type MyOrderPageHeroProps = {
  isLoggedIn: boolean;
  customerName: string;
};

export default function MyOrderPageHero({
  isLoggedIn,
  customerName,
}: MyOrderPageHeroProps) {
  return (
    <header className="mb-5">
      <h1 className="text-[34px] font-black tracking-[-0.08em] text-[#151923]">
        주문조회
      </h1>

      <section className="mt-4 rounded-[24px] bg-blue-50 p-4 shadow-[0_10px_24px_rgba(30,64,175,0.06)] ring-1 ring-blue-100">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-[31px] ring-1 ring-blue-100">
            🛡️
          </div>

          <p className="break-keep text-[16px] font-bold leading-relaxed tracking-[-0.04em] text-[#151923]">
            {isLoggedIn
              ? `${customerName || "고객"}님 주문내역을 최근 7일 기준으로 확인할 수 있어요.`
              : "로그아웃 상태에서는 이름 + 전화번호로 최근 7일 주문내역을 조회할 수 있어요."}
          </p>
        </div>
      </section>
    </header>
  );
}
