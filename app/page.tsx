// app/page.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/page.tsx
// 홈 첫 화면 + 실제 링크 적용

"use client";

const KAKAO_URL = "https://pf.kakao.com/_RMxaqX";
const BAND_URL = "https://band.us/@ruru8249";
const YOUTUBE_URL = "https://www.youtube.com/@%EB%A3%A8%EB%A3%A8%EB%8F%99%EC%9D%B4/streams";
const FOOTER_TEXT = "© since 2024 루루동이 | All Rights Reserved.";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#fbf7f8] px-4 py-7 text-gray-950">
      <section className="mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-md flex-col">
        <header className="mb-7 pt-4 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-white shadow-[0_14px_35px_rgba(255,120,160,0.18)]">
            <span className="text-2xl">🤍</span>
          </div>

          <h1 className="text-[30px] font-black tracking-tight text-gray-950">
            루루동이 집구석LIVE
          </h1>

          <p className="mt-2 text-sm font-bold text-gray-500">
            오늘도 좋은 상품만 🤍
          </p>
        </header>

        <section className="grid gap-4">
          <a
            href="/order"
            className="group relative overflow-hidden rounded-[2rem] border border-pink-100 bg-white p-6 shadow-[0_18px_45px_rgba(255,120,160,0.18)] transition active:scale-[0.99]"
          >
            <div className="absolute right-5 top-5 rotate-12 text-xl text-red-500">
              ✦
            </div>

            <div className="flex items-center justify-between gap-5">
              <div>
                <div className="text-4xl">📝</div>
                <div className="mt-4 text-3xl font-black text-gray-950">
                  주문서 작성
                </div>
                <div className="mt-2 text-sm font-bold text-gray-500">
                  방송 보면서 주문서 작성
                </div>
              </div>

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-950 text-xl font-black text-white">
                →
              </div>
            </div>
          </a>

          <a
            href={KAKAO_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-[1.8rem] border border-yellow-100 bg-[#fff7d7] p-5 shadow-[0_12px_30px_rgba(0,0,0,0.05)] transition active:scale-[0.99]"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-3xl">💬</div>
                <div className="mt-3 text-2xl font-black text-gray-950">
                  카톡채널 문의
                </div>
                <div className="mt-1 text-sm font-bold text-gray-600">
                  주문/결제 문의는 카톡채널로 남겨주세요
                </div>
              </div>
              <div className="text-2xl font-black">→</div>
            </div>
          </a>

          <div className="grid grid-cols-2 gap-3">
            <a
              href="/myorder"
              className="rounded-[1.6rem] border border-gray-100 bg-white p-5 text-center shadow-sm active:scale-[0.99]"
            >
              <div className="text-2xl">📦</div>
              <div className="mt-2 text-lg font-black">주문조회</div>
            </a>

            <a
              href="/notice"
              className="rounded-[1.6rem] border border-gray-100 bg-white p-5 text-center shadow-sm active:scale-[0.99]"
            >
              <div className="text-2xl">📢</div>
              <div className="mt-2 text-lg font-black">공지</div>
            </a>

            <a
              href={BAND_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-[1.6rem] border border-gray-100 bg-white p-5 text-center shadow-sm active:scale-[0.99]"
            >
              <div className="text-2xl">👥</div>
              <div className="mt-2 text-lg font-black">밴드</div>
            </a>

            <a
              href={YOUTUBE_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-[1.6rem] border border-gray-100 bg-white p-5 text-center shadow-sm active:scale-[0.99]"
            >
              <div className="text-2xl">▶️</div>
              <div className="mt-2 text-lg font-black">유튜브</div>
            </a>
          </div>
        </section>

        <footer className="mt-auto pt-8 pb-2 text-center text-[11px] font-bold text-gray-400">
          {FOOTER_TEXT}
        </footer>
      </section>
    </main>
  );
}
