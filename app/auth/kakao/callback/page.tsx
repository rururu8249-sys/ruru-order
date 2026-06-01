"use client";

import { useEffect, useState } from "react";
import { CUSTOMER_SESSION_VERSION_KEY, REQUIRED_CUSTOMER_SESSION_VERSION } from "@/lib/customer/customerSession";

const setIfValue = (key: string, value: unknown) => {
  const text = String(value || "").trim();

  if (!text) return;

  localStorage.setItem(key, text);
};

export default function KakaoCallbackPage() {
  const [message, setMessage] = useState("카카오 정보를 확인하고 있습니다.");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const login = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (!code) {
        setStatus("error");
        setMessage("카카오 로그인 코드가 없습니다.");
        return;
      }

      const res = await fetch(`/api/auth/kakao?code=${code}`);
      const data = await res.json();

      if (!res.ok) {
        const detail = data?.detail;
        const detailMessage =
          detail?.error_description ||
          detail?.error ||
          data?.error ||
          "알 수 없는 오류";

        setStatus("error");
        setMessage(`카카오 로그인 실패: ${detailMessage}`);
        return;
      }

      setIfValue("ruru_kakao_id", data.kakao_id);
      setIfValue("ruru_kakao_nickname", data.kakao_nickname);

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
        }
      } catch (syncError) {
        console.warn("카카오 고객 자동등록 요청 실패:", syncError);
      }

      setStatus("success");
      setMessage("확인 완료. 주문서로 이동합니다.");

      setTimeout(() => {
        window.location.href = "/order?kakao=1";
      }, 800);
    };

    login();
  }, []);

  const statusIcon = status === "success" ? "✅" : status === "error" ? "⚠️" : "⏳";
  const statusTitle =
    status === "success" ? "카카오 확인 완료" : status === "error" ? "카카오 확인 실패" : "카카오 확인중";

  return (
    <main className="min-h-screen bg-[#f5f8ff] px-2 py-4 text-[#151923] sm:px-4">
      <section className="mx-auto flex min-h-[calc(100svh-32px)] w-full max-w-[560px] items-center">
        <section className="w-full -translate-y-[4vh] overflow-hidden rounded-[34px] border border-slate-200 bg-white p-5 text-center shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-blue-50 text-[32px] ring-1 ring-blue-100">
            {statusIcon}
          </div>

          <p className="mt-5 text-[13px] font-black tracking-[-0.04em] text-blue-700">
            루루동이 LIVE
          </p>

          <h1 className="mt-2 break-keep text-[30px] font-black leading-tight tracking-[-0.08em] text-slate-950">
            {statusTitle}
          </h1>

          <p className="mt-3 break-keep text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
            {message}
          </p>

          {status === "loading" && (
            <div className="mt-5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-2 w-2/3 animate-pulse rounded-full bg-blue-600" />
            </div>
          )}

          {status === "error" && (
            <a
              href="/"
              className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-[18px] bg-blue-700 px-4 py-3 text-[16px] font-black tracking-[-0.05em] text-white"
            >
              처음 화면으로 돌아가기
            </a>
          )}
        </section>
      </section>
    </main>
  );
}
