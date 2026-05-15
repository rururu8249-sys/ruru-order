// app/components/PublicTopNav.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/components/PublicTopNav.tsx
//
// 역할:
// 1) 첫화면(/)에서는 상단바 숨김
// 2) 첫화면(/)에서는 HomeCenterMenu를 따로 불러서 가운데 메뉴로 사용
// 3) 첫화면 밖 페이지에서는 상단바 노출
//
// 메뉴 순서:
// 홈 → 공지 → 주문서작성 → 주문조회 → 카톡채널 → 루루동이밴드 → 유튜브
//
// 연결:
// 홈 = /
// 공지 = /notice
// 주문서작성 = /#order-form
// 주문조회 = /myorder
// 카톡채널 = .env.local 의 NEXT_PUBLIC_KAKAO_CHANNEL_URL
// 루루동이밴드 = .env.local 의 NEXT_PUBLIC_BAND_URL
// 유튜브 = .env.local 의 NEXT_PUBLIC_YOUTUBE_URL

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const YOUTUBE_URL =
  process.env.NEXT_PUBLIC_YOUTUBE_URL || "https://www.youtube.com/@루루동이";

const BAND_URL =
  process.env.NEXT_PUBLIC_BAND_URL || "https://band.us/@ruru8249";

const KAKAO_CHANNEL_URL =
  process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || "https://pf.kakao.com/_RMxaqX";

// 기존 첫화면 안의 주문서작성 영역으로 이동시키는 링크입니다.
// 다음 단계에서 app/page.tsx의 주문서작성 영역에 id="order-form"을 붙입니다.
const ORDER_FORM_URL = "/#order-form";

const MENU_ITEMS = [
  {
    label: "홈",
    href: "/",
    type: "internal",
  },
  {
    label: "공지",
    href: "/notice",
    type: "internal",
  },
  {
    label: "주문서작성",
    href: ORDER_FORM_URL,
    type: "internal",
    highlight: true,
  },
  {
    label: "주문조회",
    href: "/myorder",
    type: "internal",
  },
  {
    label: "카톡채널",
    href: KAKAO_CHANNEL_URL,
    type: "external",
    kakao: true,
  },
  {
    label: "루루동이밴드",
    href: BAND_URL,
    type: "external",
  },
  {
    label: "유튜브",
    href: YOUTUBE_URL,
    type: "external",
  },
];

function useMenuActive() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href.startsWith("/#")) return pathname === "/";
    return pathname?.startsWith(href);
  };

  return {
    pathname,
    isActive,
  };
}

function MenuButton({
  item,
  mode,
}: {
  item: {
    label: string;
    href: string;
    type: string;
    highlight?: boolean;
    kakao?: boolean;
  };
  mode: "home" | "top";
}) {
  const { isActive } = useMenuActive();

  const baseClass =
    mode === "home"
      ? "min-h-[74px] px-5 py-4 rounded-3xl text-sm md:text-base font-extrabold text-center transition shadow-sm flex items-center justify-center"
      : "px-4 py-2 rounded-full text-sm font-extrabold transition whitespace-nowrap";

  const colorClass = item.highlight
    ? "bg-black text-white hover:bg-gray-800"
    : item.kakao
    ? "bg-yellow-300 text-black hover:bg-yellow-400"
    : item.type === "internal" && isActive(item.href)
    ? "bg-black text-white"
    : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100";

  const className = `${baseClass} ${colorClass}`;

  if (item.type === "external") {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {item.label}
      </a>
    );
  }

  return (
    <Link href={item.href} className={className}>
      {item.label}
    </Link>
  );
}

// 첫화면 전용 가운데 메뉴
export function HomeCenterMenu() {
  return (
    <section className="w-full max-w-6xl mx-auto px-4 py-8">
      <div className="rounded-[2rem] border border-gray-200 bg-white/95 backdrop-blur p-5 md:p-7 shadow-sm">

        <div className="text-center mb-6">
          <div className="text-2xl md:text-4xl font-extrabold text-gray-950">
            루루동이 LIVE ORDER
          </div>

          <div className="text-sm md:text-base text-gray-500 font-bold mt-2">
            주문서 작성 · 주문조회 · 공지 확인
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {MENU_ITEMS.map((item) => (
            <MenuButton key={item.label} item={item} mode="home" />
          ))}
        </div>

      </div>
    </section>
  );
}

// 첫화면 밖 페이지 전용 상단바
export default function PublicTopNav() {
  const { pathname } = useMenuActive();

  // 관리자 페이지에서는 숨김
  if (pathname?.startsWith("/admin")) {
    return null;
  }

  // 첫화면에서는 상단바 숨김
  if (pathname === "/") {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 py-3">

        <div className="flex items-center justify-between gap-3">

          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center font-extrabold">
              R
            </div>

            <div className="leading-tight">
              <div className="font-extrabold text-lg text-gray-950">
                루루동이
              </div>
              <div className="text-xs text-gray-500 font-bold">
                LIVE ORDER
              </div>
            </div>
          </Link>

          <nav className="flex items-center gap-2 overflow-x-auto pb-1">
            {MENU_ITEMS.map((item) => (
              <MenuButton key={item.label} item={item} mode="top" />
            ))}
          </nav>

        </div>

      </div>
    </header>
  );
}
