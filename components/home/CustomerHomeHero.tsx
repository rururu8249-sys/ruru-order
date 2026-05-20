// components/home/CustomerHomeHero.tsx
// 목적: 고객 HOME 메인 주문 CTA 영역
// 주의: UI 전용. 주문 저장/금액/배송비/입금 로직 없음.

import Link from "next/link";

type CustomerHomeHeroProps = {
  isLoggedIn: boolean;
  greetingName: string;
};

export default function CustomerHomeHero({
  isLoggedIn,
  greetingName,
}: CustomerHomeHeroProps) {
  return (
    <section className="overflow-hidden rounded-[34px] bg-white px-5 pb-5 pt-6 shadow-[0_18px_40px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="inline-flex rounded-full bg-blue-50 px-3 py-1.5 text-[13px] font-black tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100">
            오늘도 좋은 상품만 🤍
          </p>

          <h1 className="mt-4 text-[32px] font-black leading-tight tracking-[-0.08em] text-[#151923]">
            루루동이
            <br />
            집구석 LIVE
          </h1>

          <p className="mt-3 break-keep text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
            {isLoggedIn
              ? `${greetingName || "고객"}님, 바로 상품 입력으로 이동할 수 있어요.`
              : "주문을 위한 최초 1회 정보 확인 후 상품 입력으로 이동해요."}
          </p>
        </div>

        <div className="mt-2 flex h-[98px] w-[98px] shrink-0 items-center justify-center rounded-[30px] bg-gradient-to-br from-blue-50 to-white text-[46px] shadow-inner ring-1 ring-blue-100">
          🛍️
        </div>
      </div>

      <Link
        href="/order"
        className="mt-6 block rounded-[30px] bg-blue-600 px-5 py-6 text-white shadow-[0_18px_34px_rgba(37,99,235,0.26)] active:scale-[0.99]"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-white/18 text-[36px]">
            📝
          </div>

          <div className="min-w-0 flex-1">
            <p className="whitespace-nowrap text-[32px] font-black leading-none tracking-[-0.08em]">
              주문서 작성
            </p>
            <p className="mt-3 break-keep text-[15px] font-extrabold leading-relaxed tracking-[-0.04em] text-white/95">
              방송에서 상품 확인 후 여기를 눌러 작성해주세요.
            </p>
          </div>

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[28px] font-black text-blue-700 shadow-lg">
            ›
          </div>
        </div>
      </Link>

      <p className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-blue-800">
        주문을 위한 최초 1회 정보 확인입니다. 한 번만 입력하면 로그아웃 전까지는 바로 상품 입력으로 이동해요.
      </p>
    </section>
  );
}
