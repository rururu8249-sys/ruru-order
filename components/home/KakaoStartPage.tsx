"use client";

import { useEffect, useState } from "react";

// components/home/KakaoStartPage.tsx
// 목적: 고객이 처음 접속했을 때 보이는 카카오 간편주문 시작 페이지
// 주의:
// - UI/카카오 로그인 시작 전용입니다.
// - 주문 저장, 입금, 정산, 배송비, Supabase 로직을 건드리지 않습니다.

export default function KakaoStartPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedYoutubeNickname = window.localStorage.getItem("ruru_youtube_nickname") || "";
    const savedName = window.localStorage.getItem("ruru_customer_name") || "";
    const savedPhone = window.localStorage.getItem("ruru_customer_phone") || "";
    const savedAddress = window.localStorage.getItem("ruru_customer_address") || "";
    const savedDetailAddress = window.localStorage.getItem("ruru_customer_detail_address") || "";

    if (
      savedYoutubeNickname.trim() &&
      savedName.trim() &&
      savedPhone.trim() &&
      savedAddress.trim() &&
      savedDetailAddress.trim()
    ) {
      window.location.replace("/order");
      return;
    }

    setReady(true);
  }, []);

  const startKakaoLogin = () => {
    if (typeof window === "undefined") return;

    const restApiKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY || "";

    if (!restApiKey) {
      alert("카카오 로그인 설정값이 없습니다. 관리자에게 문의해주세요.");
      return;
    }

    const redirectUri = `${window.location.origin}/auth/kakao/callback`;
    const params = new URLSearchParams({
      client_id: restApiKey,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "profile_nickname,phone_number,shipping_address",
    });

    window.location.href = `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  };

  if (!ready) {
    return (
      <main
        className="min-h-screen bg-[#f5f8ff] px-4 py-6 text-[#151923]"
      />
    );
  }

  return (
    <main
      className="min-h-screen bg-[#f5f8ff] px-4 py-6 text-[#151923] select-none"
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md items-center">
        <section className="w-full overflow-hidden rounded-[38px] bg-gradient-to-b from-white via-[#f7fbff] to-[#e7f1ff] px-5 pb-8 pt-8 shadow-[0_24px_60px_rgba(37,99,235,0.14)] ring-1 ring-blue-100">
          <div className="mx-auto flex w-fit items-center justify-center gap-3 rounded-full bg-white/90 px-4 py-2 shadow-[0_10px_24px_rgba(37,99,235,0.10)] ring-1 ring-blue-100">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-blue-600 text-[18px] font-black text-white shadow-[0_10px_20px_rgba(37,99,235,0.20)]">
              R
            </div>

            <div className="text-[21px] font-black text-slate-400">×</div>

            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#fee500] text-[13px] font-black text-[#241b17] shadow-[0_10px_20px_rgba(234,179,8,0.22)]">
              TALK
            </div>
          </div>

          <div className="mt-8 text-center">
            <h1 className="break-keep text-[37px] font-black leading-[1.06] tracking-[-0.09em] text-[#151923]">
              <span className="text-blue-600">루루동이</span>
              <span className="text-slate-950"> X 카카오톡</span>
            </h1>

            <p className="mt-5 break-keep text-[21px] font-black leading-relaxed tracking-[-0.06em] text-slate-600">
              복잡한 배송지 정보 입력 없이
            </p>
          </div>

          <div className="relative mt-8 overflow-hidden rounded-[34px] bg-gradient-to-br from-blue-50 via-white to-blue-100 px-4 pb-8 pt-8 shadow-inner ring-1 ring-blue-100">
            <div className="pointer-events-none absolute -left-10 top-8 h-36 w-36 rounded-full bg-white/70 blur-2xl" />
            <div className="pointer-events-none absolute -right-10 bottom-5 h-40 w-40 rounded-full bg-blue-300/35 blur-2xl" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fee500]/20 blur-3xl" />

            <button
              type="button"
              onClick={startKakaoLogin}
              className="relative z-10 mx-auto flex w-full max-w-[365px] items-center justify-center rounded-[28px] bg-[#fee500] px-5 py-5 text-[#241b17] shadow-[0_18px_36px_rgba(234,179,8,0.30)] ring-1 ring-yellow-200 transition active:scale-[0.98]"
            >
              <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#241b17] text-[12px] font-black text-[#fee500]">
                TALK
              </span>

              <span className="min-w-0 flex-1 text-center text-[20px] font-black tracking-[-0.055em]">
                카카오로 간편 주문 시작
              </span>

              <span className="ml-3 text-[29px] font-black leading-none">›</span>
            </button>
          </div>

          <div className="mt-6 grid grid-cols-3 overflow-hidden rounded-[26px] bg-white/82 shadow-[0_12px_26px_rgba(37,99,235,0.08)] ring-1 ring-blue-100">
            <div className="border-r border-blue-100 px-2 py-4 text-center">
              <div className="text-[22px]">📍</div>
              <div className="mt-1 break-keep text-[12px] font-black tracking-[-0.04em] text-slate-700">
                배송정보
              </div>
            </div>

            <div className="border-r border-blue-100 px-2 py-4 text-center">
              <div className="text-[22px]">📝</div>
              <div className="mt-1 break-keep text-[12px] font-black tracking-[-0.04em] text-slate-700">
                주문간편
              </div>
            </div>

            <div className="px-2 py-4 text-center">
              <div className="text-[22px]">🔒</div>
              <div className="mt-1 break-keep text-[12px] font-black tracking-[-0.04em] text-slate-700">
                정보보호
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
