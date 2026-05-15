// app/components/PublicTopNav.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/components/PublicTopNav.tsx
//
// 수정 내용:
// - /?screen=order 주문서작성 화면에서 홈 버튼 검정 활성화 제거
// - 홈 버튼 클릭 반응 없던 문제 해결: 홈도 일반 a 태그로 강제 이동
// - 주문서작성 버튼은 항상 흰색 + 빨간 손그림 별표
// - 현재 메뉴 활성화 검정색은 공지/주문조회 등 실제 페이지에만 적용
// - 카톡채널 노랑색 유지
// - 모바일 메뉴 2줄 표시 유지

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
  { label: "홈", href: "/", type: "internal", forceReload: true },
  { label: "공지", href: "/notice", type: "internal" },
  {
    label: "주문서작성",
    href: ORDER_FORM_URL,
    type: "internal",
    important: true,
    forceReload: true,
  },
  { label: "주문조회", href: ORDER_LOOKUP_URL, type: "internal" },
  { label: "카톡채널", href: KAKAO_CHANNEL_URL, type: "external", kakao: true },
  { label: "루루동이밴드", href: BAND_URL, type: "external" },
  { label: "유튜브", href: YOUTUBE_URL, type: "external" },
];

const HOME_MENU_ITEMS = TOP_MENU_ITEMS.filter((item) => item.label !== "홈");

function RedHandStar() {
  return (
    <svg
      className="absolute -top-4 -right-3 h-8 w-8 md:h-9 md:w-9 pointer-events-none drop-shadow-sm"
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <path
        d="M52 8 L63 38 L94 39 L69 57 L78 88 L51 70 L25 88 L34 57 L9 39 L40 38 Z"
        fill="none"
        stroke="#ef1f1f"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 42 C35 35 58 28 88 40"
        fill="none"
        stroke="#ef1f1f"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

function MenuButton({
  item,
  mode,
  screen,
}: {
  item: {
    label: string;
    href: string;
    type: string;
    important?: boolean;
    kakao?: boolean;
    forceReload?: boolean;
  };
  mode: "home" | "top";
  screen: string;
}) {
  const pathname = usePathname();

  const isActive = (() => {
    // 주문서작성은 검정 활성화 금지
    if (item.important) return false;

    // /?screen=order 같은 상태에서는 홈 활성화 금지
    if (item.href === "/") {
      return pathname === "/" && !screen;
    }

    if (item.href.startsWith("/?")) return false;

    return pathname?.startsWith(item.href);
  })();

  const baseClass =
    mode === "home"
      ? "relative min-h-[72px] px-3 py-4 rounded-3xl text-sm md:text-base font-extrabold text-center transition shadow-sm flex items-center justify-center"
      : "relative px-2 py-2 rounded-full text-[11px] md:text-sm font-extrabold transition whitespace-nowrap flex items-center justify-center min-h-[38px]";

  const colorClass = item.kakao
    ? "bg-yellow-300 text-black hover:bg-yellow-400"
    : isActive
    ? "bg-black text-white"
    : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100";

  const importantClass = item.important
    ? "border-red-100 hover:border-red-200"
    : "";

  const className = `${baseClass} ${colorClass} ${importantClass}`;

  const content = (
    <>
      {item.important && <RedHandStar />}
      {item.label}
    </>
  );

  if (item.type === "external") {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {content}
      </a>
    );
  }

  // 홈(/)과 주문서작성(/?screen=order)은 같은 페이지 내부 상태가 꼬이지 않게
  // 일반 a 태그로 강제 이동 처리합니다.
  if (item.forceReload || item.href.startsWith("/?")) {
    return (
      <a href={item.href} className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={item.href} className={className}>
      {content}
    </Link>
  );
}

export function HomeCenterMenu() {
  const [screen, setScreen] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setScreen(params.get("screen") || "");
  }, []);

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
            <MenuButton
              key={item.label}
              item={item}
              mode="home"
              screen={screen}
            />
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
  // /?screen=order, /?screen=lookup 등은 상단바 표시
  if (pathname === "/" && !screen) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-3 py-3">
        <div className="flex flex-col gap-3">
          <a
            href="/"
            className="flex items-center justify-center gap-2 shrink-0"
          >
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
          </a>

          <nav className="grid grid-cols-4 sm:grid-cols-7 gap-2 w-full">
            {TOP_MENU_ITEMS.map((item) => (
              <MenuButton
                key={item.label}
                item={item}
                mode="top"
                screen={screen}
              />
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
