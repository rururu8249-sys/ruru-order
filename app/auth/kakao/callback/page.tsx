"use client";

import { useEffect, useState } from "react";

const setIfValue = (key: string, value: unknown) => {
  const text = String(value || "").trim();

  if (!text) return;

  localStorage.setItem(key, text);
};

export default function KakaoCallbackPage() {
  const [message, setMessage] = useState("카카오 로그인 처리중...");

  useEffect(() => {
    const login = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (!code) {
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

      setMessage("카카오 로그인 완료! 주문서로 이동합니다.");

      setTimeout(() => {
        window.location.href = "/order?kakao=1";
      }, 800);
    };

    login();
  }, []);

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="bg-zinc-900 border border-yellow-400 rounded-3xl p-8 text-center">
        <div className="text-2xl font-bold mb-3">루루동이 로그인</div>
        <div className="text-gray-300">{message}</div>
      </div>
    </main>
  );
}
