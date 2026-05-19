// components/home/CustomerHomePage.tsx
// 새 파일 생성 또는 전체 교체
// 위치: /Users/ruru/Desktop/ruru-order-app/components/home/CustomerHomePage.tsx
// 목적: 고객 첫 화면 UI
// 주의: 주문 저장, 금액, 카드수수료, 관리자 로직은 건드리지 않습니다.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  clearSavedCustomerInfo,
  getCustomerGreetingName,
  hasSavedCustomerInfo,
  readSavedCustomerInfo,
  type SavedCustomerInfo,
} from "@/lib/customer/customerSession";

const initialInfo: SavedCustomerInfo = {
  youtubeNickname: "",
  customerName: "",
  customerPhone: "",
  zipcode: "",
  address: "",
  detailAddress: "",
};

type MenuCard = {
  href: string;
  title: string;
  desc: string;
  icon: string;
  external?: boolean;
};

const menuCards: MenuCard[] = [
  {
    href: "/notice",
    title: "공지",
    desc: "루루동이의 새로운 소식",
    icon: "📢",
  },
  {
    href: "/myorder",
    title: "주문조회",
    desc: "주문내역을 확인해보세요",
    icon: "🔎",
  },
  {
    href: "https://band.us/@ruru8249",
    title: "루루동이밴드",
    desc: "배송공지와 혜택 확인",
    icon: "🟢",
    external: true,
  },
  {
    href: "https://www.youtube.com/@%EB%A3%A8%EB%A3%A8%EB%8F%99%EC%9D%B4/streams",
    title: "유튜브",
    desc: "루루동이 LIVE 다시보기",
    icon: "▶️",
    external: true,
  },
];

export default function CustomerHomePage() {
  const [customerInfo, setCustomerInfo] = useState<SavedCustomerInfo>(initialInfo);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setCustomerInfo(readSavedCustomerInfo());
    setIsReady(true);
  }, []);

  const isLoggedIn = isReady && hasSavedCustomerInfo(customerInfo);
  const greetingName = getCustomerGreetingName(customerInfo);

  const handleLogout = () => {
    clearSavedCustomerInfo();
    setCustomerInfo(initialInfo);
  };

  return (
    <main className="min-h-screen bg-[#f8f1e8] text-[#241b17]">
      <section className="mx-auto min-h-screen w-full max-w-[520px] px-5 pb-8 pt-5">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="min-h-[48px] pt-1">
            {isLoggedIn ? (
              <div className="leading-tight">
                <p className="text-[21px] font-extrabold tracking-[-0.04em] text-[#1f1713]">
                  안녕하세요
                </p>
                <p className="mt-1 text-[21px] font-extrabold tracking-[-0.04em] text-[#1f1713]">
                  {greetingName || "고객"}님
                </p>
              </div>
            ) : (
              <div className="leading-tight">
                <p className="text-[21px] font-extrabold tracking-[-0.04em] text-[#1f1713]">
                  안녕하세요
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Link
              href="/"
              className="rounded-2xl bg-white/95 px-3.5 py-2 text-sm font-extrabold text-[#241b17] shadow-[0_8px_20px_rgba(60,38,20,0.12)] ring-1 ring-black/5 active:scale-[0.98]"
            >
              🏠 HOME
            </Link>

            {isLoggedIn && (
              <>
                <Link
                  href="/order"
                  className="rounded-2xl bg-white/95 px-3.5 py-2 text-sm font-extrabold text-[#241b17] shadow-[0_8px_20px_rgba(60,38,20,0.12)] ring-1 ring-black/5 active:scale-[0.98]"
                >
                  정보수정
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-2xl bg-white/95 px-3.5 py-2 text-sm font-extrabold text-[#241b17] shadow-[0_8px_20px_rgba(60,38,20,0.12)] ring-1 ring-black/5 active:scale-[0.98]"
                >
                  로그아웃
                </button>
              </>
            )}
          </div>
        </header>

        <section className="relative overflow-hidden rounded-[34px] bg-[#fffaf3] px-5 pb-5 pt-7 shadow-[0_18px_40px_rgba(70,45,25,0.10)] ring-1 ring-white/70">
          <div className="pointer-events-none absolute -left-8 top-8 h-28 w-28 rounded-full bg-[#d7e3c2]/60 blur-2xl" />
          <div className="pointer-events-none absolute -right-10 top-10 h-28 w-28 rounded-full bg-[#f5d7c8]/70 blur-2xl" />

          <div className="relative text-center">
            <h1 className="text-[38px] font-black leading-tight tracking-[-0.08em] text-[#2b211c]">
              루루동이 집구석
              <span className="ml-2 inline-flex translate-y-[-4px] items-center rounded-2xl bg-[#f05a45] px-3 py-1 text-[22px] font-black tracking-[-0.02em] text-white shadow-[0_8px_18px_rgba(240,90,69,0.26)]">
                LIVE
              </span>
            </h1>
            <p className="mt-3 text-[19px] font-bold tracking-[-0.04em] text-[#7b6554]">
              오늘도 집에서 즐거운 쇼핑~ <span className="text-[#f05a45]">♥</span>
            </p>
          </div>

          <Link
            href="/order"
            className="relative mt-7 flex min-h-[188px] items-center gap-5 rounded-[34px] bg-gradient-to-br from-[#ff7664] to-[#ee3f31] p-6 text-white shadow-[0_18px_35px_rgba(236,69,49,0.25)] ring-2 ring-white/70 active:scale-[0.99]"
          >
            <div className="flex h-[104px] w-[104px] shrink-0 items-center justify-center rounded-full bg-white/18 text-[54px] shadow-inner">
              📝
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[39px] font-black leading-none tracking-[-0.08em]">
                주문서 작성
              </p>
              <p className="mt-4 text-[17px] font-bold leading-relaxed tracking-[-0.04em] text-white/95">
                방송에서 루루언니에게 접수하신 후,
                <br />
                주문서 작성은 꼭 완료해주세요!
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[30px] font-black text-[#ee4a37] shadow-lg">
              ›
            </div>
          </Link>
        </section>

        <Link
          href="https://pf.kakao.com/_RMxaqX"
          target="_blank"
          rel="noreferrer"
          className="mt-5 flex items-center gap-4 rounded-[28px] bg-white px-6 py-5 shadow-[0_12px_26px_rgba(70,45,25,0.10)] ring-1 ring-black/5 active:scale-[0.99]"
        >
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#ffe04b] text-[28px] font-black text-[#3b2517]">
            TALK
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[28px] font-black tracking-[-0.07em] text-[#241b17]">
              카톡채널 문의
            </p>
            <p className="mt-1 text-[15px] font-semibold tracking-[-0.04em] text-[#766c65]">
              궁금한 점은 카톡으로 빠르게 문의하세요!
            </p>
          </div>
          <div className="text-3xl font-black text-[#b8b1aa]">›</div>
        </Link>

        <section className="mt-5 grid grid-cols-2 gap-4">
          {menuCards.map((item) => {
            const content = (
              <>
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#f8e9df] text-[28px]">
                  {item.icon}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[22px] font-black tracking-[-0.07em] text-[#241b17]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-[14px] font-semibold leading-snug tracking-[-0.04em] text-[#756b64]">
                      {item.desc}
                    </p>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f0eee9] text-xl font-black text-[#9d958d]">
                    ›
                  </span>
                </div>
              </>
            );

            if (item.external) {
              return (
                <a
                  key={item.title}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[26px] bg-white p-5 shadow-[0_12px_26px_rgba(70,45,25,0.10)] ring-1 ring-black/5 active:scale-[0.99]"
                >
                  {content}
                </a>
              );
            }

            return (
              <Link
                key={item.title}
                href={item.href}
                className="rounded-[26px] bg-white p-5 shadow-[0_12px_26px_rgba(70,45,25,0.10)] ring-1 ring-black/5 active:scale-[0.99]"
              >
                {content}
              </Link>
            );
          })}
        </section>

        <section className="mt-5 grid grid-cols-2 overflow-hidden rounded-[28px] bg-[#fff7ec] shadow-[0_10px_22px_rgba(70,45,25,0.08)] ring-1 ring-white/80">
          <div className="flex items-center gap-3 border-r border-[#e8d8c8] px-4 py-5">
            <div className="text-[32px]">🚚</div>
            <div>
              <p className="text-[18px] font-black tracking-[-0.06em] text-[#241b17]">
                루팡배송
              </p>
              <p className="mt-1 text-[13px] font-semibold tracking-[-0.04em] text-[#7b7067]">
                신속하고 안전하게
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-5">
            <div className="text-[32px]">🎧</div>
            <div>
              <p className="text-[18px] font-black tracking-[-0.06em] text-[#241b17]">
                친절한 상담
              </p>
              <p className="mt-1 text-[13px] font-semibold tracking-[-0.04em] text-[#7b7067]">
                언제나 함께 해요
              </p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
