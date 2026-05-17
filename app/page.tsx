"use client";

// app/page.tsx
// 전체 교체용
// 첫화면 상단바 MASTER 기준

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_RMxaqX";
const BAND_URL = "https://band.us/@ruru8249";
const YOUTUBE_URL = "https://www.youtube.com/@%EB%A3%A8%EB%A3%A8%EB%8F%99%EC%9D%B4/streams";

const blockCustomerCopyEvents = () => {
  const block = (event: Event) => event.preventDefault();

  const blockKey = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const isMac = event.metaKey;
    const isWin = event.ctrlKey;

    if (
      event.key === "F12" ||
      ((isWin || isMac) && ["c", "x", "u"].includes(key)) ||
      (isWin && event.shiftKey && ["i", "j"].includes(key)) ||
      (isMac && event.altKey && ["i", "j"].includes(key))
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  document.addEventListener("contextmenu", block);
  document.addEventListener("copy", block);
  document.addEventListener("cut", block);
  document.addEventListener("dragstart", block);
  document.addEventListener("selectstart", block);
  document.addEventListener("keydown", blockKey);

  return () => {
    document.removeEventListener("contextmenu", block);
    document.removeEventListener("copy", block);
    document.removeEventListener("cut", block);
    document.removeEventListener("dragstart", block);
    document.removeEventListener("selectstart", block);
    document.removeEventListener("keydown", blockKey);
  };
};

function PressCard({
  href,
  external = false,
  className = "",
  children,
}: {
  href: string;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const commonClass =
    "group block transition-all duration-200 active:scale-[0.985] active:shadow-sm";

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${commonClass} ${className}`}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={`${commonClass} ${className}`}>
      {children}
    </Link>
  );
}

function CustomerTopNav({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="sticky top-3 z-40 mx-auto mb-4 flex w-full max-w-[456px] items-center justify-between rounded-full border border-[#f3e5e7] bg-white/95 px-4 py-3 shadow-[0_10px_24px_rgba(30,20,20,0.07)] backdrop-blur">
      <Link
        href="/"
        className="shrink-0 text-[14px] font-black tracking-[-0.04em] text-[#ff4b60] transition active:scale-[0.97]"
      >
        🏠 HOME
      </Link>

      <div className="flex items-center gap-2 text-[13px] font-black tracking-[-0.04em] text-[#5f5555]">
        <Link href="/myorder" className="whitespace-nowrap px-1 py-1 transition active:scale-[0.97]">
          주문조회
        </Link>
        <span className="text-[#e1d4d5]">/</span>
        <button
          type="button"
          onClick={() => { window.location.href = "/order"; }}
          className="whitespace-nowrap px-1 py-1 transition active:scale-[0.97]"
        >
          정보수정
        </button>
        <span className="text-[#e1d4d5]">/</span>
        <button
          type="button"
          onClick={onLogout}
          className="whitespace-nowrap px-1 py-1 transition active:scale-[0.97]"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}

function MenuCard({
  href,
  external = false,
  icon,
  title,
  desc,
  iconBg,
  wide = false,
}: {
  href: string;
  external?: boolean;
  icon: string;
  title: string;
  desc: string;
  iconBg: string;
  wide?: boolean;
}) {
  return (
    <PressCard
      href={href}
      external={external}
      className={`rounded-[28px] border border-[#eee8e8] bg-white shadow-[0_8px_22px_rgba(20,15,15,0.045)] ${
        wide ? "col-span-2" : ""
      }`}
    >
      <div className={`flex ${wide ? "min-h-[104px] items-center gap-4" : "min-h-[126px] flex-col justify-between"} p-5`}>
        <div className="flex items-start justify-between gap-3">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[29px] ${iconBg}`}
          >
            {icon}
          </div>

          {!wide && (
            <div className="mt-4 text-[24px] leading-none text-[#b8b0b0] transition-transform duration-200 group-hover:translate-x-0.5">
              ›
            </div>
          )}
        </div>

        <div className={wide ? "min-w-0 flex-1" : ""}>
          <h3 className="text-[22px] font-black tracking-[-0.055em] text-[#171717]">
            {title}
          </h3>
          <p className="mt-1 text-[13px] font-bold tracking-[-0.035em] text-[#777]">
            {desc}
          </p>
        </div>

        {wide && (
          <div className="ml-auto text-[24px] leading-none text-[#b8b0b0]">
            ›
          </div>
        )}
      </div>
    </PressCard>
  );
}

export default function HomePage() {
  const [hasCustomer, setHasCustomer] = useState(false);

  useEffect(() => {
    const cleanup = blockCustomerCopyEvents();

    const checkCustomer = () => {
      const name = localStorage.getItem("ruru_customer_name") || "";
      const phone = localStorage.getItem("ruru_customer_phone") || "";
      const session = localStorage.getItem("ruru_customer_session") || "";
      setHasCustomer(Boolean((name && phone) || session));
    };

    checkCustomer();
    window.addEventListener("storage", checkCustomer);

    return () => {
      cleanup();
      window.removeEventListener("storage", checkCustomer);
    };
  }, []);

  const logout = () => {
    localStorage.removeItem("ruru_customer_name");
    localStorage.removeItem("ruru_customer_phone");
    localStorage.removeItem("ruru_youtube_nickname");
    localStorage.removeItem("ruru_customer_zipcode");
    localStorage.removeItem("ruru_customer_address");
    localStorage.removeItem("ruru_customer_detail_address");
    localStorage.removeItem("ruru_customer_session");
    setHasCustomer(false);
    alert("로그아웃되었습니다. 오늘도 좋은 하루 보내세요 :)");
  };

  return (
    <main
      className="min-h-screen select-none bg-[#fffafa] text-[#171717]"
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <section className="mx-auto w-full max-w-[480px] bg-white shadow-[0_0_50px_rgba(30,20,20,0.08)]">
        <div className="pt-3">
          <CustomerTopNav onLogout={logout} />
        </div>

        <div className="relative overflow-hidden bg-[#fff7f5]">
          <Image
            src="/images/home-hero.png"
            alt="루루동이 집구석 LIVE"
            width={900}
            height={620}
            priority
            draggable={false}
            className="h-auto w-full object-contain"
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
        </div>

        <div className="-mt-3 rounded-t-[34px] bg-white px-5 pb-8 pt-6 relative z-10">
          <div className="mb-4">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#fff1a8] px-3 py-1 text-[13px] font-black text-[#2b2416] shadow-sm">
              ✨ 가장 빠른 주문!
            </div>
            <p className="mt-2 text-[14px] font-bold tracking-[-0.035em] text-[#7b6d6d]">
              방송 중 주문은 아래 버튼에서 바로 작성해주세요
            </p>
          </div>

          <PressCard
            href="/order"
            className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-[#ff6574] via-[#ff4f65] to-[#ff405a] shadow-[0_6px_12px_rgba(255,76,98,0.12)]"
          >
            <div className="absolute -left-14 -top-14 h-36 w-36 rounded-full bg-white/10" />
            <div className="absolute -right-20 -bottom-20 h-44 w-44 rounded-full bg-white/7" />

            <div className="relative flex min-h-[148px] items-center gap-5 px-6 py-6">
              <div className="flex h-[82px] w-[82px] shrink-0 items-center justify-center rounded-full bg-white/95 text-[42px] shadow-[0_6px_14px_rgba(120,20,40,0.08)]">
                📝
              </div>

              <div className="min-w-0 flex-1 text-white">
                <h1 className="text-[33px] font-black leading-tight tracking-[-0.065em]">
                  주문서 작성
                </h1>
                <p className="mt-1 text-[17px] font-bold tracking-[-0.045em] text-white/92">
                  방송 주문은 여기서!
                </p>
              </div>

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[34px] leading-none text-[#ff4b60] shadow-sm">
                ›
              </div>
            </div>
          </PressCard>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <MenuCard
              href={KAKAO_CHANNEL_URL}
              external
              icon="💬"
              title="카톡채널"
              desc="카드결제 · 상담"
              iconBg="bg-[#fff4b5]"
              wide
            />

            <MenuCard
              href="/group-buy"
              icon="🛍"
              title="공구상품"
              desc="상시상품 주문"
              iconBg="bg-[#fff1f4]"
            />

            <MenuCard
              href="/notice"
              icon="📢"
              title="공지사항"
              desc="필독 안내"
              iconBg="bg-[#f6f3f3]"
            />

            <MenuCard
              href={BAND_URL}
              external
              icon="👥"
              title="밴드"
              desc="송장 · 일정"
              iconBg="bg-[#edf8f4]"
            />

            <MenuCard
              href={YOUTUBE_URL}
              external
              icon="▶️"
              title="유튜브"
              desc="라이브 보기"
              iconBg="bg-[#fff1f3]"
            />
          </div>

          <div className="mt-9 text-center">
            <p className="text-[16px] font-medium tracking-[-0.04em] text-[#5f5555]">
              오늘도 루루동이와 함께 행복한 쇼핑 되세요!♡
            </p>
            <div className="mx-auto mt-6 h-px w-full bg-[#eee5e5]" />
            <p className="mt-4 text-[13px] text-[#aaa]">
              copyright © since 2024 루루동이. All rights reserved.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
