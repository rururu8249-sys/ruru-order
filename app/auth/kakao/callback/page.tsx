"use client";

import { useEffect, useState } from "react";

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
        setMessage("카카오 로그인 실패");
        console.error(data);
        return;
      }

      localStorage.setItem("ruru_kakao_id", data.kakao_id);
      localStorage.setItem("ruru_kakao_nickname", data.kakao_nickname);

      setMessage("카카오 로그인 완료! 주문서로 이동합니다.");

      setTimeout(() => {
        window.location.href = "/";
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