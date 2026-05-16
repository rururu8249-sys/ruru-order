// app/components/PublicTopNav.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/components/PublicTopNav.tsx
//
// 홈(/)에서는 상단바 숨김.
// 내부페이지(/order, /myorder, /notice 등)에서만 상단바 표시.

"use client";

import { usePathname } from "next/navigation";

const KAKAO_URL = "https://pf.kakao.com/_RMxaqX";
const BAND_URL = "https://band.us/@ruru8249";
const YOUTUBE_URL = "https://www.youtube.com/@%EB%A3%A8%EB%A3%A8%EB%8F%99%EC%9D%B4/streams";

const menus = [
  { label: "홈", href: "/", external: false },
  { label: "공지", href: "/notice", external: false },
  { label: "주문서작성", href: "/order", external: false },
  { label: "주문조회", href: "/myorder", external: false },
  { label: "카톡채널", href: KAKAO_URL, external: true, yellow: true },
  { label: "루루동이밴드", href: BAND_URL, external: true },
  { label: "유튜브", href: YOUTUBE_URL, external: true },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function HomeCenterMenu() {
  return null;
}

export default function PublicTopNav() {
  const pathname = usePathname() || "";

  if (pathname === "/" || pathname.startsWith("/admin")) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-4 py-3">
        <a href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-sm font-black text-white">
            R
          </div>
          <div className="leading-tight">
            <div className="text-lg font-black text-gray-950">루루동이</div>
            <div className="text-[11px] font-black tracking-wide text-gray-500">
              집구석LIVE
            </div>
          </div>
        </a>

        <nav className="flex w-full gap-2 overflow-x-auto pb-1 md:justify-center">
          {menus.map((menu) => {
            const active = !menu.external && isActive(pathname, menu.href);

            return (
              <a
                key={menu.label}
                href={menu.href}
                target={menu.external ? "_blank" : undefined}
                rel={menu.external ? "noreferrer" : undefined}
                className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-black transition ${
                  active
                    ? "bg-black text-white"
                    : menu.yellow
                    ? "bg-yellow-300 text-black"
                    : "border border-gray-200 bg-white text-gray-950"
                }`}
              >
                {menu.label}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
