// app/components/PublicTopNav.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/components/PublicTopNav.tsx
//
// Vercel 빌드 오류 수정 버전
// 핵심:
// useSearchParams 사용 금지
// window.location.search 로 주문서작성 화면 감지
//
// 적용:
// 1) 첫화면(/)만 상단바 숨김
// 2) 주문서작성 화면(/?screen=order)에서는 상단바 표시
// 3) 모바일에서 메뉴가 가로 드래그 없이 2줄로 전부 보이게 처리
// 4) 첫화면 가운데 메뉴에는 홈 버튼 제외
//
// 메뉴 순서:
// 홈 → 공지 → 주문서작성 → 주문조회 → 카톡채널 → 루루동이밴드 → 유튜브

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const YOUTUBE_URL =
  process.env.NEXT_PUBLIC_YOUTUBE_URL || "https://www.youtube.com/@루루동이";

const BAND_URL =
  process.env.NEXT_PUBLIC_BAND_URL || "https://band.us/@ruru8249";

const KAKAO_CHANNEL_URL =
  process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || "https://pf.kakao.com/_RMxaqX";

const ORDER_FORM_URL = "/?screen=order";
const ORDER_LOOKUP_URL = "/myorder";

const TOP_MENU_ITEMS = [
  { label: "홈", href: "/", type: "internal" },
  { label: "공지", href: "/notice", type: "internal" },
  { label: "주문서작성", href: ORDER_FORM_URL, type: "internal", highlight: true },
  { label: "주문조회", href: ORDER_LOOKUP_URL, type: "internal" },
  { label: "카톡채널", href: KAKAO_CHANNEL_URL, type: "external", kakao: true },
  { label: "루루동이밴드", href: BAND_URL, type: "external" },
  { label: "유튜브", href: YOUTUBE_URL, type: "external" },
];

const HOME_MENU_ITEMS = TOP_MENU_ITEMS.filter((item) => item.label !== "홈");

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
  const pathname = usePathname();

  const isActive = (() => {
    if (item.href === "/") return pathname === "/";
    if (item.href.startsWith("/?")) return false;
    return pathname?.startsWith(item.href);
  })();

  const baseClass =
    mode === "home"
      ? "min-h-[72px] px-3 py-4 rounded-3xl text-sm md:text-base font-extrabold text-center transition shadow-sm flex items-center justify-center"
      : "px-3 py-2 rounded-full text-xs md:text-sm font-extrabold transition whitespace-nowrap flex items-center justify-center";

  const colorClass = item.highlight
    ? "bg-black text-white hover:bg-gray-800"
    : item.kakao
    ? "bg-yellow-300 text-black hover:bg-yellow-400"
    : isActive
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

export function HomeCenterMenu() {
  return (
    <section className="w-full max-w-6xl mx-auto px-0 py-4 md:py-8">
      <div className="rounded-[2rem] border border-gray-200 bg-white/95 backdrop-blur p-5 md:p-7 shadow-sm">
        <div className="text-center mb-6">
          <div className="text-2xl md:text-4xl font-extrabold text-gray-950">
            루루동이 LIVE ORDER
          </div>

          <div className="text-sm md:text-base text-gray-500 font-bold mt-2">
            주문서 작성 · 주문조회 · 공지 확인
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {HOME_MENU_ITEMS.map((item) => (
            <MenuButton key={item.label} item={item} mode="home" />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function PublicTopNav() {
  const pathname = usePathname();
  const [screen, setScreen] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setScreen(params.get("screen") || "");
  }, []);

  if (pathname?.startsWith("/admin")) {
    return null;
  }

  // 완전 첫화면만 상단바 숨김
  // /?screen=order 같은 주문서작성 화면에서는 상단바 표시
  if (pathname === "/" && !screen) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-3 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <Link
            href="/"
            className="flex items-center justify-center md:justify-start gap-2 shrink-0"
          >
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-black text-white flex items-center justify-center font-extrabold">
              R
            </div>

            <div className="leading-tight">
              <div className="font-extrabold text-base md:text-lg text-gray-950">
                루루동이
              </div>
              <div className="text-[10px] md:text-xs text-gray-500 font-bold">
                LIVE ORDER
              </div>
            </div>
          </Link>

          <nav className="grid grid-cols-4 sm:grid-cols-7 md:flex md:items-center gap-2 w-full md:w-auto">
            {TOP_MENU_ITEMS.map((item) => (
              <MenuButton key={item.label} item={item} mode="top" />
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
