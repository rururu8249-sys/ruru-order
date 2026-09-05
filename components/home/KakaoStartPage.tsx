"use client";

import { showAdminToast } from "@/lib/adminToast";

import {
  clearLegacyCustomerSessionIfNeeded,
  isCustomerSessionVersionCurrent,
  isYoutubeNicknameConfirmVersionCurrent,
} from "@/lib/customer/customerSession";
import { useEffect, useState } from "react";

// components/home/KakaoStartPage.tsx
// 목적: 고객 첫 접속 카카오톡 로그인 시작 화면
// 주의:
// - UI/카카오톡 로그인 시작 전용입니다.
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
    // [2026-09-05 카카오 필수] 주문서(/order)는 카카오ID 없으면 여기로 돌려보낸다 → 여기서 카카오ID 없이 /order 로
    //   자동 통과시키면 두 화면이 서로 튕기는 무한 반복이 된다. 카카오ID가 있을 때만 자동 통과(없으면 카톡 로그인 버튼).
    const savedKakaoId = (() => {
      try { return String(window.localStorage.getItem("ruru_kakao_id") || "").trim(); } catch { return ""; }
    })();

    if (
      savedKakaoId &&
      kakaoSessionReady &&
      youtubeNicknameConfirmed &&
      savedYoutubeNickname.trim() &&
      savedName.trim() &&
      savedPhone.trim() &&
      savedAddress.trim()
      // [2026-08-31 전수조사 수정] 상세주소는 조건에서 뺀다.
      //   주문서는 상세주소 없이도 제출을 허용하는데(단독주택 등) 이 관문만 필수로 봐서,
      //   상세주소 없는 손님은 로그인돼 있어도 접속할 때마다 로그인 화면부터 다시 만났다.
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
      showAdminToast("카카오톡 로그인 설정값이 없습니다. 관리자에게 문의해 주세요.");
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
    return <main className="min-h-screen bg-[#FBF8F9] px-2 py-4 text-[#151923]" />;
  }

  // [2026-08-14 사장님 지시] 파란색 임시 테마 → 루루동이 브랜드 시안(버건디 #7B2D43 + 핑크,
  //   OrderEntryGateV2 진입 시안과 동일 계열)으로 표시만 변경. 카카오톡 로그인 로직·문구·버튼 동작 무변경.
  return (
    <main
      className="min-h-screen bg-[#FBF8F9] px-2 py-4 text-[#151923] select-none sm:px-4"
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <section className="mx-auto flex min-h-[calc(100svh-32px)] w-full max-w-[560px] items-center">
        <section
          className="w-full overflow-hidden rounded-[34px] p-5"
          style={{ background: "linear-gradient(to bottom, #ffffff, #F5E6EB)", border: "1px solid #D9C5CC", boxShadow: "0 22px 55px rgba(123,45,67,0.13)" }}
        >
          {/* R × TALK 로고 칩 — 진입 시안과 동일한 브랜드 표기 */}
          <div className="mx-auto flex w-fit items-center justify-center gap-3 rounded-full px-4 py-2" style={{ background: "rgba(255,255,255,0.9)", border: "1px solid #D9C5CC" }}>
            <div className="flex h-9 w-9 items-center justify-center rounded-[13px] text-[17px] font-black text-white" style={{ background: "#7B2D43" }}>R</div>
            <div className="text-[20px] font-black text-[#bbb]">×</div>
            <div className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-[#fee500] text-[13px] font-black text-[#241b17]">TALK</div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-[13px] font-black tracking-[-0.04em]" style={{ color: "#7B2D43" }}>루루동이 LIVE</p>
            <h1 className="mt-2 break-keep text-[32px] font-black leading-tight tracking-[-0.08em]">
              <span style={{ color: "#7B2D43" }}>카카오톡으로</span>
              <br />
              <span className="text-slate-950">간편 로그인해 주세요</span>
            </h1>
            <p className="mt-3 break-keep text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
              로그인 후 방송에서 주문한 상품과 배송정보를 확인하고 주문서를 작성합니다.
            </p>
          </div>

          <div className="mt-5 rounded-[24px] p-4" style={{ background: "rgba(255,255,255,0.85)", border: "1px solid #D9C5CC" }}>
            <div className="grid gap-3">
              {[
                "카카오톡 간편 로그인으로 이름, 전화번호, 배송정보를 불러옵니다.",
                "방송 채팅에서 주문한 상품과 옵션을 주문서에 담습니다.",
                "상품·수량·배송지·결제금액을 확인하고 주문서를 제출합니다.",
                "주문 접수 완료 화면의 안내에 따라 입금하거나 결제합니다.",
              ].map((step, index) => (
                <div key={step} className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-black text-white" style={{ background: "#7B2D43" }}>
                    {index + 1}
                  </span>
                  <p className="break-keep text-[14px] font-black leading-relaxed tracking-[-0.04em] text-slate-800">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={startKakaoLogin}
            className="mt-5 flex min-h-[58px] w-full items-center justify-center rounded-[22px] bg-[#fee500] px-4 py-4 text-[18px] font-black tracking-[-0.05em] text-[#241b17] shadow-[0_14px_30px_rgba(234,179,8,0.25)] ring-1 ring-yellow-200 transition active:scale-[0.98]"
          >
            <span className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#241b17] text-[11px] font-black text-[#fee500]">TALK</span>
            카카오톡 간편 로그인
          </button>

          <p className="mt-4 break-keep text-center text-[12px] font-bold leading-relaxed tracking-[-0.04em]" style={{ color: "#A08A92" }}>
            카카오톡에서 불러온 정보는 주문서 작성과 주문조회에만 사용됩니다.
          </p>
        </section>
      </section>
    </main>
  );
}
