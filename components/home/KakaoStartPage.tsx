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
    return <main className="min-h-screen bg-white" />;
  }

  // [2026-10-22 손님화면 리뉴얼 — 진입 화면] DESIGN.md 기준(흰 바탕·검정 글자·로즈 없음·그림자 없음)으로 모양만 변경.
  //   문구·카카오톡 로그인 동작(startKakaoLogin)·자동 통과 조건 무변경. 카카오 버튼은 카카오 공식 노란색 유지.
  const steps = [
    "카카오톡 간편 로그인으로 이름, 전화번호, 배송정보를 불러옵니다.",
    "방송 채팅에서 주문한 상품과 옵션을 주문서에 담습니다.",
    "상품·수량·배송지·결제금액을 확인하고 주문서를 제출합니다.",
    "주문 접수 완료 화면의 안내에 따라 입금하거나 결제합니다.",
  ];
  return (
    <main className="min-h-screen bg-white px-4 py-6" style={{ color: "#111111", WebkitUserSelect: "none", WebkitTouchCallout: "none", userSelect: "none" }}>
      <section className="mx-auto flex min-h-[calc(100svh-48px)] w-full max-w-[430px] flex-col justify-center">
        <p className="text-[15px] font-bold" style={{ wordBreak: "keep-all" }}>🏠 루루동이 집구석 LIVE</p>
        <h1 className="mt-4 text-[28px] font-bold leading-[1.3]" style={{ wordBreak: "keep-all", letterSpacing: "-0.02em" }}>
          카카오톡으로
          <br />
          간편 로그인해 주세요
        </h1>
        <p className="mt-3 text-[16px] leading-[1.5]" style={{ color: "#39393B", wordBreak: "keep-all" }}>
          로그인 후 방송에서 주문한 상품과 배송정보를 확인하고 주문서를 작성합니다.
        </p>

        <ol className="mt-6 grid gap-3 rounded-[24px] p-4" style={{ background: "#F5F5F5" }}>
          {steps.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white" style={{ background: "#111111" }}>
                {index + 1}
              </span>
              <p className="pt-0.5 text-[15px] leading-[1.5]" style={{ color: "#111111", wordBreak: "keep-all" }}>{step}</p>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={startKakaoLogin}
          className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-4 text-[16px] font-semibold transition active:scale-[0.97]"
          style={{ background: "#FEE500", color: "#191919" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#191919" d="M12 3C6.48 3 2 6.58 2 11c0 2.86 1.88 5.37 4.7 6.78l-1 3.66a.4.4 0 0 0 .6.44l4.3-2.85c.46.05.93.07 1.4.07 5.52 0 10-3.58 10-8S17.52 3 12 3Z" /></svg>
          카카오톡 간편 로그인
        </button>

        <p className="mt-4 text-center text-[13px] leading-[1.5]" style={{ color: "#707072", wordBreak: "keep-all" }}>
          카카오톡에서 불러온 정보는 주문서 작성과 주문조회에만 사용됩니다.
        </p>
        {/* [2026-09-27] 로그인 전에도 약관 전문을 볼 수 있게 — 카카오 동의화면 약관 링크(아임웹 옛 주소) 불량 대비. 표시만, 로그인 로직 무변경 */}
        <p className="mt-2 text-center text-[13px]" style={{ color: "#707072" }}>
          <a href="/terms" className="underline underline-offset-2">이용약관</a>
          <span aria-hidden="true"> · </span>
          <a href="/privacy" className="underline underline-offset-2">개인정보처리방침</a>
        </p>
      </section>
    </main>
  );
}
