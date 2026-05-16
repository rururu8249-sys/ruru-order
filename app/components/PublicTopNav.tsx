// app/components/PublicTopNav.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/components/PublicTopNav.tsx
//
// 방송 전 안전패치:
// - 모바일 홈 화면을 루루동이 집구석LIVE 스타일로 변경
// - 메뉴 중요도 반영: 주문서작성 1순위, 카톡채널 2순위
// - 공지/주문조회/루루동이밴드/유튜브는 하단 2x2 카드
// - 하단 고정 문구 추가
// - 기존 app/page.tsx의 HomeCenterMenu import 유지

"use client";

type MenuItemProps = {
  href: string;
  title: string;
  icon: string;
  variant?: "primary" | "kakao" | "small";
  external?: boolean;
};

const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_xkxlxkxn";
const BAND_URL = "https://band.us/@ruru";
const YOUTUBE_URL = "https://www.youtube.com/@ruru";

function MenuItem({
  href,
  title,
  icon,
  variant = "small",
  external = false,
}: MenuItemProps) {
  const commonClass =
    "group relative flex items-center justify-between border border-white/80 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-1 hover:border-pink-200 hover:bg-pink-50 hover:shadow-[0_22px_55px_rgba(236,72,153,0.16)] active:scale-[0.99]";

  if (variant === "primary") {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className={`${commonClass} rounded-[2rem] px-7 py-7 min-h-[132px]`}
      >
        <span className="flex items-center gap-5">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-pink-100 text-4xl shadow-inner">
            {icon}
          </span>
          <span className="text-3xl font-black tracking-[-0.04em] text-gray-950">
            {title}
          </span>
        </span>

        <span className="text-5xl font-light text-gray-950 transition group-hover:translate-x-1 group-hover:text-pink-500">→</span>
      </a>
    );
  }

  if (variant === "kakao") {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className={`${commonClass} rounded-[2rem] px-7 py-6 min-h-[110px]`}
      >
        <span className="flex items-center gap-5">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 text-3xl shadow-inner">
            {icon}
          </span>
          <span className="text-2xl font-black tracking-[-0.04em] text-gray-950">
            {title}
          </span>
        </span>

        <span className="text-4xl font-light text-gray-950 transition group-hover:translate-x-1 group-hover:text-pink-500">→</span>
      </a>
    );
  }

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={`${commonClass} min-h-[150px] flex-col justify-center gap-3 rounded-[2rem] px-5 py-6 text-center`}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-2xl shadow-inner">
        {icon}
      </span>

      <span className="text-xl font-black tracking-[-0.04em] text-gray-950">
        {title}
      </span>

      <span className="text-2xl font-light leading-none text-gray-950 transition group-hover:translate-x-1 group-hover:text-pink-500">→</span>
    </a>
  );
}

export function HomeCenterMenu() {
  return (
    <section className="mx-auto w-full max-w-md overflow-hidden rounded-[2.5rem] border border-gray-200 bg-white/70 px-6 pb-9 pt-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-20 items-center justify-center text-3xl">
          ⌂
        </div>

        <h1 className="text-[2rem] font-black tracking-[-0.07em] text-gray-950">
          루루동이 집구석LIVE
        </h1>

        <p className="mt-3 text-base font-bold text-gray-400">
          오늘도 좋은 상품만 🤍
        </p>
      </div>

      <div className="grid gap-5">
        <MenuItem
          href="/?screen=order"
          title="주문서 작성"
          icon="📝"
          variant="primary"
        />

        <MenuItem
          href={KAKAO_CHANNEL_URL}
          title="카톡채널 문의"
          icon="💬"
          variant="kakao"
          external
        />

        <div className="grid grid-cols-2 gap-4">
          <MenuItem href="/notice" title="공지" icon="📢" />
          <MenuItem href="/?screen=lookup" title="주문조회" icon="📦" />
          <MenuItem href={BAND_URL} title="루루동이밴드" icon="👥" external />
          <MenuItem href={YOUTUBE_URL} title="유튜브" icon="▶️" external />
        </div>
      </div>

      <div className="mt-9 text-center">
        <div className="text-xl font-light italic text-gray-400">
          Thank you 💕
        </div>
        <div className="mt-2 text-xs font-bold tracking-[0.18em] text-gray-300">
          LULUDONGI HOME LIVE
        </div>
        <div className="mt-5 text-[11px] font-semibold text-gray-300">
          © since 2024 루루동이 | All Rights Reserved.
        </div>
      </div>
    </section>
  );
}

export default function PublicTopNav() {
  return <HomeCenterMenu />;
}
