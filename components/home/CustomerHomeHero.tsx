// components/home/CustomerHomeHero.tsx
// 목적: 고객 HOME 첫 화면 주문서 작성 메인 버튼
// 주의: UI 전용. 주문 저장, 금액, Supabase, 입금매칭, 송장 로직 없음.

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
    <section className="mt-5">
      <Link
        href="/"
        className="group relative block overflow-hidden rounded-[30px] bg-blue-600 px-4 pb-6 pt-7 text-white shadow-[0_18px_36px_rgba(37,99,235,0.25)] ring-4 ring-white active:scale-[0.99] min-[390px]:rounded-[34px] min-[390px]:px-5 min-[390px]:pb-7 min-[390px]:pt-8"
      >
        <div className="pointer-events-none absolute -left-12 -top-12 h-36 w-36 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-14 -right-12 h-44 w-44 rounded-full bg-white/10" />

        <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-[34px] shadow-inner ring-4 ring-white/30 min-[390px]:mb-5 min-[390px]:h-20 min-[390px]:w-20 min-[390px]:text-[42px]">
          📝
        </div>

        <div className="relative text-center">
          <p className="break-keep text-[40px] font-black leading-none tracking-[-0.08em] min-[390px]:text-[46px] sm:text-[52px]">
            주문서 작성
          </p>

          <p className="mt-4 break-keep text-[16px] font-bold leading-relaxed tracking-[-0.04em] text-white/95">
            방송에서 접수 후
            <br />
            방송·공구상품 주문서 작성 및 입금을 진행해주세요
          </p>
        </div>

        <div className="relative mt-5 flex items-center justify-center gap-2 text-[15px] font-black text-white/95">
          <span className="rounded-full bg-white/18 px-4 py-2">
            주문서 작성
          </span>
          <span className="text-[28px] leading-none">›</span>
        </div>
      </Link>

    </section>
  );
}
