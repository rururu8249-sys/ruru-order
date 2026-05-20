// components/myorder/MyOrderPageHero.tsx
// 목적: 주문조회 페이지 상단 안내 UI
// 주의: UI 전용. 주문조회, Supabase, DB 로직 없음.

type MyOrderPageHeroProps = {
  isLoggedIn: boolean;
  customerName: string;
};

export default function MyOrderPageHero({
  isLoggedIn,
  customerName,
}: MyOrderPageHeroProps) {
  return (
    <header className="mb-5 rounded-[30px] bg-white p-5 text-center shadow-[0_14px_30px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="text-[13px] font-black tracking-[-0.04em] text-blue-700">
        RURU ORDER
      </div>

      <h1 className="mt-1 text-[34px] font-black tracking-[-0.08em] text-[#151923]">
        내 주문내역 조회
      </h1>

      <p className="mt-3 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
        {isLoggedIn
          ? `${customerName || "고객"}님 주문내역을 최근 7일 기준으로 확인할 수 있어요.`
          : "로그아웃 상태에서는 이름 + 전화번호로 최근 7일 주문내역을 조회할 수 있어요."}
      </p>

      <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-blue-800 ring-1 ring-blue-100">
        7일이 지난 주문이나 조회가 안 되는 주문은 카톡채널로 문의해주세요.
      </div>
    </header>
  );
}
