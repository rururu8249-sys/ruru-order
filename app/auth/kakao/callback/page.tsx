"use client";

import { useEffect, useState } from "react";
import { CUSTOMER_SESSION_VERSION_KEY, REQUIRED_CUSTOMER_SESSION_VERSION } from "@/lib/customer/customerSession";

const setIfValue = (key: string, value: unknown) => {
  const text = String(value || "").trim();

  if (!text) return;

  localStorage.setItem(key, text);
};

export default function KakaoCallbackPage() {
  const [message, setMessage] = useState("카카오톡에서 정보를 받아오고 있어요. 잠시만요!");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const login = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (!code) {
        setStatus("error");
        setMessage("카카오톡 로그인 코드가 없습니다.");
        return;
      }

      // [2026-08-31 전수조사 수정] 서버가 JSON 아닌 응답(502 등)을 주거나 네트워크가 끊기면
      //   res.json() 예외를 아무도 안 잡아 "잠시만요!" 로딩 화면에 영원히 갇혔다.
      //   (로딩 상태에서는 「처음 화면으로 돌아가기」 버튼도 안 보인다)
      let res: Response;
      let data: any;
      try {
        res = await fetch(`/api/auth/kakao?code=${code}`);
        data = await res.json();
      } catch {
        setStatus("error");
        setMessage("연결이 잠시 불안정했어요. 아래 버튼으로 돌아가서 다시 로그인해 주세요.");
        return;
      }

      if (!res.ok) {
        const detail = data?.detail;
        const detailMessage =
          detail?.error_description ||
          detail?.error ||
          data?.error ||
          "알 수 없는 오류";

        setStatus("error");
        setMessage(`카카오톡 로그인 실패: ${detailMessage}`);
        return;
      }

      setIfValue("ruru_kakao_id", data.kakao_id);
      setIfValue("ruru_kakao_nickname", data.kakao_nickname);
      setIfValue("ruru_kakao_profile_image", data.kakao_profile_image);

      setIfValue("ruru_customer_name", data.customer_name);
      setIfValue("ruru_customer_phone", data.customer_phone);
      setIfValue("ruru_customer_zipcode", data.customer_zipcode);
      setIfValue("ruru_customer_address", data.customer_address);
      setIfValue("ruru_customer_detail_address", data.customer_detail_address);
      localStorage.setItem(CUSTOMER_SESSION_VERSION_KEY, REQUIRED_CUSTOMER_SESSION_VERSION);

      try {
        const syncResponse = await fetch("/api/customer-login-sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kakao_id: data.kakao_id,
            kakao_nickname: data.kakao_nickname,
            kakao_profile_image: data.kakao_profile_image,
            // [2026-09-05 카카오 원본 보존] 서버가 그대로 보관(관리자 회원상세 "카카오 원본")
            kakao_account_name: data.kakao_account_name,
            kakao_account_phone: data.kakao_phone,
            kakao_shipping_name: data.kakao_shipping_name,
            kakao_shipping_phone: data.kakao_shipping_phone,
            customer_name: data.customer_name,
            customer_phone: data.customer_phone,
            customer_zipcode: data.customer_zipcode,
            customer_address: data.customer_address,
            customer_detail_address: data.customer_detail_address,
          }),
        });

        if (!syncResponse.ok) {
          const syncDetail = await syncResponse.json().catch(() => null);
          console.warn("카카오 고객 자동등록 실패:", syncDetail?.message || syncResponse.statusText);
        } else {
          // [2026-08-31 사장님 지시] 남남 닉네임 재확인 깃발 — 주문서에서 닉네임을 직접 확인시킨다
          const syncData = await syncResponse.json().catch(() => null);
          try {
            // 깃발이 없는 계정이 같은 브라우저로 로그인하면 이전 깃발을 지운다(남의 깃발 상속 방지)
            if (syncData?.needs_nickname_confirm) localStorage.setItem("ruru_nickname_reconfirm", "1");
            else localStorage.removeItem("ruru_nickname_reconfirm");
            // [2026-08-31] 서버가 기억하는 닉네임이 정답 — 관리자가 바꾼 이름을 폰에도 반영
            const serverNick = String(syncData?.server_youtube_nickname || "").trim();
            if (serverNick) localStorage.setItem("ruru_youtube_nickname", serverNick);
          } catch { /* 무시 */ }
        }
      } catch (syncError) {
        console.warn("카카오 고객 자동등록 요청 실패:", syncError);
      }

      setStatus("success");
      setMessage("확인 완료! 주문서로 이동합니다.");

      // Phase1-2로 중복/타이밍 원인 제거됨 → 1800ms 대기 땜질을 원래값 800ms로 환원.
      setTimeout(() => {
        window.location.href = "/order?kakao=1";
      }, 800);
    };

    login();
  }, []);

  const statusIcon = status === "success" ? "✅" : status === "error" ? "⚠️" : "⏳";
  const statusTitle =
    status === "success" ? "카카오톡 확인 완료" : status === "error" ? "카카오톡 확인 실패" : "카카오톡 확인중";

  // [2026-08-21 사장님 지시] 파란 임시 테마 → 루루동이 브랜드 시안(KakaoStartPage 0597a61과 동일 계열:
  //   버건디 #7B2D43 + 흰→연핑크 그라데이션 카드 + R×TALK 로고 칩)으로 표시만 변경.
  //   문구도 "카카오" → "카카오톡"으로 통일. 로그인 로직·저장·이동 흐름은 무변경.
  return (
    <main className="min-h-screen bg-[#FBF8F9] px-2 py-4 text-[#151923] sm:px-4">
      <section className="mx-auto flex min-h-[calc(100svh-32px)] w-full max-w-[560px] items-center">
        <section
          className="w-full -translate-y-[4vh] overflow-hidden rounded-[34px] p-5 text-center"
          style={{ background: "linear-gradient(to bottom, #ffffff, #F5E6EB)", border: "1px solid #D9C5CC", boxShadow: "0 22px 55px rgba(123,45,67,0.13)" }}
        >
          {/* R × TALK 로고 칩 — 시작화면과 동일한 브랜드 표기 */}
          <div className="mx-auto flex w-fit items-center justify-center gap-3 rounded-full px-4 py-2" style={{ background: "rgba(255,255,255,0.9)", border: "1px solid #D9C5CC" }}>
            <div className="flex h-9 w-9 items-center justify-center rounded-[13px] text-[17px] font-black text-white" style={{ background: "#7B2D43" }}>R</div>
            <div className="text-[20px] font-black text-[#bbb]">×</div>
            <div className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-[#fee500] text-[13px] font-black text-[#241b17]">TALK</div>
          </div>

          <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-[24px] text-[32px]" style={{ background: "#F9EDF1", border: "1px solid #E8D5DD" }}>
            {statusIcon}
          </div>

          <p className="mt-5 text-[13px] font-black tracking-[-0.04em]" style={{ color: "#7B2D43" }}>
            루루동이 LIVE
          </p>

          <h1 className="mt-2 break-keep text-[30px] font-black leading-tight tracking-[-0.08em] text-slate-950">
            {statusTitle}
          </h1>

          <p className="mt-3 break-keep text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
            {message}
          </p>

          {status === "loading" && (
            <div className="mt-5 overflow-hidden rounded-full" style={{ background: "#F0E4E9" }}>
              <div className="h-2 w-2/3 animate-pulse rounded-full" style={{ background: "#7B2D43" }} />
            </div>
          )}

          {status === "error" && (
            <a
              href="/"
              className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-[18px] px-4 py-3 text-[16px] font-black tracking-[-0.05em] text-white"
              style={{ background: "#7B2D43" }}
            >
              처음 화면으로 돌아가기
            </a>
          )}
        </section>
      </section>
    </main>
  );
}
