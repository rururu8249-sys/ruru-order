// components/home/CustomerHomeMenu.tsx
// 목적: 고객 HOME 하단 메뉴
// 주의:
// - 주문조회는 상단바에 고정되어 있으므로 HOME 하단 메뉴에서는 제외
// - 공구상품은 상단바가 아니라 이 HOME 메뉴 영역에 배치한다.

import Link from "next/link";

type MenuItem = {
  href: string;
  title: string;
  desc: string;
  icon: string;
  external?: boolean;
};

const menuItems: MenuItem[] = [
  {
    href: "/notice",
    title: "공지사항",
    desc: "배송·입금·교환 안내",
    icon: "📢",
  },
  {
    href: "https://www.instagram.com/ruru8249_/",
    title: "인스타그램",
    desc: "루루동이 인스타 보기",
    icon: "📸",
    external: true,
  },
  {
    href: "https://band.us/@ruru8249",
    title: "루루동이 밴드",
    desc: "이벤트·공지·채팅",
    icon: "🟢",
    external: true,
  },
  {
    href: "https://www.youtube.com/@%EB%A3%A8%EB%A3%A8%EB%8F%99%EC%9D%B4/streams",
    title: "유튜브",
    desc: "라이브·다시보기",
    icon: "▶️",
    external: true,
  },
];

export default function CustomerHomeMenu() {
  return (
    <>
      <a
        href="https://pf.kakao.com/_RMxaqX"
        target="_blank"
        rel="noreferrer"
        className="mt-5 flex items-center gap-4 rounded-[28px] bg-[#ffe04b] px-5 py-5 shadow-[0_12px_26px_rgba(30,64,175,0.08)] ring-1 ring-yellow-200 active:scale-[0.99]"
      >
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/70 text-[23px] font-black tracking-[-0.08em] text-[#3b2517]">
          TALK
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[26px] font-black tracking-[-0.07em] text-[#241b17]">
            카톡채널 문의
          </p>
          <p className="mt-1 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-[#5f4a17]">
            입금·배송·주문 문의는 카톡채널로 남겨주세요.
          </p>
        </div>

        <div className="text-3xl font-black text-[#7d6415]">›</div>
      </a>

      <section className="mt-5 grid grid-cols-2 gap-4">
        {menuItems.map((item) => {
          const content = (
            <>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-[28px] ring-1 ring-blue-100">
                {item.icon}
              </div>

              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-[22px] font-black tracking-[-0.07em] text-[#151923]">
                    {item.title}
                  </p>
                  <p className="mt-1 break-keep text-[13px] font-semibold leading-snug tracking-[-0.04em] text-slate-500">
                    {item.desc}
                  </p>
                </div>

                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-xl font-black text-slate-400">
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
                className="rounded-[26px] bg-white p-5 shadow-[0_12px_26px_rgba(30,64,175,0.08)] ring-1 ring-blue-100 active:scale-[0.99]"
              >
                {content}
              </a>
            );
          }

          return (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-[26px] bg-white p-5 shadow-[0_12px_26px_rgba(30,64,175,0.08)] ring-1 ring-blue-100 active:scale-[0.99]"
            >
              {content}
            </Link>
          );
        })}
      </section>
    </>
  );
}
