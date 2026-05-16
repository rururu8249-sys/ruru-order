import Link from "next/link";
import Image from "next/image";

const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_RMxaqX";
const BAND_URL = "https://band.us/@ruru8249";
const YOUTUBE_URL = "https://www.youtube.com/@%EB%A3%A8%EB%A3%A8%EB%8F%99%EC%9D%B4/streams";

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
    "group block rounded-[28px] transition-all duration-200 active:scale-[0.985] active:shadow-sm";

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

function MiniMenuCard({
  href,
  external = false,
  icon,
  title,
  desc,
  iconBg,
}: {
  href: string;
  external?: boolean;
  icon: string;
  title: string;
  desc: string;
  iconBg: string;
}) {
  return (
    <PressCard
      href={href}
      external={external}
      className="bg-white border border-[#f1ecec] shadow-[0_14px_35px_rgba(30,20,20,0.07)]"
    >
      <div className="min-h-[132px] p-5 flex flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div
            className={`h-14 w-14 rounded-full flex items-center justify-center text-[30px] ${iconBg}`}
          >
            {icon}
          </div>
          <div className="mt-4 text-[30px] leading-none text-[#1f1f1f] transition-transform duration-200 group-hover:translate-x-1">
            ›
          </div>
        </div>

        <div>
          <h3 className="text-[21px] font-extrabold tracking-[-0.04em] text-[#171717]">
            {title}
          </h3>
          <p className="mt-1 text-[13px] font-medium text-[#666] tracking-[-0.03em]">
            {desc}
          </p>
        </div>
      </div>
    </PressCard>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#fffafa] text-[#171717]">
      <section className="mx-auto w-full max-w-[480px] bg-white shadow-[0_0_50px_rgba(30,20,20,0.08)]">
        <div className="relative overflow-hidden bg-[#fff7f5]">
          <Image
            src="/images/home-hero.png"
            alt="루루동이 집구석 LIVE"
            width={900}
            height={620}
            priority
            className="h-auto w-full object-contain"
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
        </div>

        <div className="-mt-3 rounded-t-[34px] bg-white px-5 pb-8 pt-6 relative z-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#fff1a8] px-3 py-1 text-[13px] font-extrabold text-[#2b2416] shadow-sm">
                ✨ 가장 빠른 주문!
              </div>
              <p className="mt-2 text-[14px] font-semibold text-[#7b6d6d] tracking-[-0.03em]">
                방송 중 주문은 아래 버튼에서 바로 작성해주세요
              </p>
            </div>
          </div>

          <PressCard
            href="/order"
            className="relative overflow-hidden bg-gradient-to-br from-[#ff5d6d] via-[#ff4c62] to-[#ff405a] shadow-[0_22px_45px_rgba(255,76,98,0.32)]"
          >
            <div className="absolute -left-14 -top-14 h-40 w-40 rounded-full bg-white/18" />
            <div className="absolute -right-16 -bottom-16 h-44 w-44 rounded-full bg-white/10" />

            <div className="relative flex min-h-[160px] items-center gap-5 px-6 py-6">
              <div className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-full bg-white/92 text-[48px] shadow-[0_12px_26px_rgba(120,20,40,0.12)]">
                📝
              </div>

              <div className="min-w-0 flex-1 text-white">
                <h1 className="text-[34px] font-black leading-tight tracking-[-0.06em]">
                  주문서 작성
                </h1>
                <p className="mt-1 text-[17px] font-semibold tracking-[-0.04em] text-white/92">
                  방송 중 주문은 여기서!
                </p>
              </div>

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[38px] leading-none text-[#ff4b60] shadow-sm">
                ›
              </div>
            </div>
          </PressCard>

          <div className="mt-5 grid grid-cols-1 gap-4">
            <PressCard
              href={KAKAO_CHANNEL_URL}
              external
              className="bg-white border border-[#f1ecec] shadow-[0_14px_35px_rgba(30,20,20,0.07)]"
            >
              <div className="flex min-h-[112px] items-center gap-5 px-5 py-5">
                <div className="flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-full bg-[#ffe13f] text-[42px]">
                  💬
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="text-[26px] font-black tracking-[-0.05em] text-[#151515]">
                    카톡채널 문의
                  </h2>
                  <p className="mt-1 text-[15px] font-medium tracking-[-0.03em] text-[#5d5555]">
                    상품문의 / 카드결제 / 상담
                  </p>
                </div>

                <div className="text-[38px] leading-none text-[#151515] transition-transform duration-200 group-hover:translate-x-1">
                  ›
                </div>
              </div>
            </PressCard>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <MiniMenuCard
              href="/notice"
              icon="📢"
              title="공지사항"
              desc="필독! 공지 확인"
              iconBg="bg-gradient-to-br from-[#ffb0b8] to-[#ff6b7a]"
            />

            <MiniMenuCard
              href="/myorder"
              icon="🔎"
              title="주문조회"
              desc="내 주문상태 확인"
              iconBg="bg-[#e9f0f7]"
            />

            <MiniMenuCard
              href={BAND_URL}
              external
              icon="👥"
              title="밴드 바로가기"
              desc="송장 · 일정 안내"
              iconBg="bg-gradient-to-br from-[#8edfc7] to-[#62c9aa]"
            />

            <MiniMenuCard
              href={YOUTUBE_URL}
              external
              icon="▶️"
              title="유튜브 바로가기"
              desc="루루동이 LIVE"
              iconBg="bg-gradient-to-br from-[#ff9aa3] to-[#ff405a]"
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
