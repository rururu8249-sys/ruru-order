"use client";

import { showAdminToast } from "@/lib/adminToast";

import {
  clearLegacyCustomerSessionIfNeeded,
  isCustomerSessionVersionCurrent,
  isYoutubeNicknameConfirmVersionCurrent,
} from "@/lib/customer/customerSession";
import { useEffect, useState } from "react";

// components/home/KakaoStartPage.tsx
// 목적: 고객 첫 접속 카카오 로그인 시작 화면
// 주의:
// - UI/카카오 로그인 시작 전용입니다.
// - 주문 저장, 입금, 정산, 배송비, Supabase 로직을 건드리지 않습니다.

export default function KakaoStartPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    clearLegacyCustomerSessionIfNeeded();

    const kakaoSessionReady = isCustomerSessionVersionCurrent();
    const youtubeNicknameConfirmed = isYoutubeNicknameConfirmVersionCurrent();
    const savedYoutubeNickname = window.localStorage.getItem("ruru_youtube_nickname") || "";
    const savedName = window.localStorage.getItem("ruru_customer_name") || "";
    const savedPhone = window.localStorage.getItem("ruru_customer_phone") || "";
    const savedAddress = window.localStorage.getItem("ruru_customer_address") || "";
    const savedDetailAddress = window.localStorage.getItem("ruru_customer_detail_address") || "";

    if (
      kakaoSessionReady &&
      youtubeNicknameConfirmed &&
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
      showAdminToast("카카오 로그인 설정값이 없습니다. 관리자에게 문의해주세요.");
      return;
    }

    const redirectUri = `${window.location.origin}/auth/kakao/callback`;
    const params = new URLSearchParams({
      client_id: restApiKey,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "profile_nickname,profile_image,phone_number,shipping_address",
    });

    window.location.href = `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  };

  if (!ready) {
    return <main className="min-h-screen bg-[#f5f8ff] px-2 py-4 text-[#151923]" />;
  }

  return (
    <main
      className="min-h-screen bg-[#f5f8ff] px-2 py-4 text-[#151923] select-none sm:px-4"
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <section className="mx-auto flex min-h-[calc(100svh-32px)] w-full max-w-[560px] items-center">
        <section className="w-full overflow-hidden rounded-[34px] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-black tracking-[-0.04em] text-blue-700">
                루루동이 LIVE
              </p>
              <h1 className="mt-2 break-keep text-[34px] font-black leading-tight tracking-[-0.08em] text-slate-950">
                주문은 카카오로 시작해주세요
              </h1>
              <p className="mt-3 break-keep text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
                카카오 로그인 후 유튜브 닉네임과 배송정보를 확인하고 주문서를 작성합니다.
              </p>
            </div>

            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-blue-50 text-[28px] ring-1 ring-blue-100">
              🛍️
            </div>
          </div>

          <div className="mt-5 rounded-[24px] bg-blue-50 p-4 ring-1 ring-blue-100">
            <div className="grid gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[14px] font-black text-blue-700 ring-1 ring-blue-100">
                  1
                </span>
                <p className="break-keep text-[14px] font-black leading-relaxed tracking-[-0.04em] text-slate-800">
                  카카오 로그인으로 이름, 전화번호, 배송정보를 불러옵니다.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[14px] font-black text-blue-700 ring-1 ring-blue-100">
                  2
                </span>
                <p className="break-keep text-[14px] font-black leading-relaxed tracking-[-0.04em] text-slate-800">
                  방송에서 사용하는 유튜브 닉네임을 한 번 확인합니다.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[14px] font-black text-blue-700 ring-1 ring-blue-100">
                  3
                </span>
                <p className="break-keep text-[14px] font-black leading-relaxed tracking-[-0.04em] text-slate-800">
                  주문서에서 상품과 결제금액을 확인하고 제출합니다.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={startKakaoLogin}
            className="mt-5 flex min-h-[58px] w-full items-center justify-center rounded-[22px] bg-[#fee500] px-4 py-4 text-[18px] font-black tracking-[-0.05em] text-[#241b17] shadow-[0_14px_30px_rgba(234,179,8,0.25)] ring-1 ring-yellow-200 transition active:scale-[0.98]"
          >
            <span className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#241b17] text-[11px] font-black text-[#fee500]">
              TALK
            </span>
            카카오로 주문 시작하기
          </button>

          <p className="mt-4 break-keep text-center text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-slate-400">
            카카오에서 불러온 정보는 주문서 작성과 주문조회에만 사용됩니다.
          </p>
        </section>
      </section>
    </main>
  );
}
