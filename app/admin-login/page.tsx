// app/admin-login/page.tsx
// 새 파일 생성
// 위치: /Users/ruru/Desktop/ruru-order-app/app/admin-login/page.tsx
// 목적: 관리자 보안 로그인 화면
// 주의: 관리자 본체 / 주문 / 정산 / 송장 로직 없음

"use client";

import { FormEvent, useState } from "react";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const getNextPath = () => {
    if (typeof window === "undefined") return "/admin-v2";

    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");

    if (next && next.startsWith("/admin-v2")) {
      return next;
    }

    return "/admin-v2";
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!password.trim()) {
      setMessage("관리자 비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(result?.message || "비밀번호가 올바르지 않습니다.");
        setLoading(false);
        return;
      }

      window.location.href = getNextPath();
    } catch {
      setMessage("로그인 처리 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0b0d12] px-4 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-md items-center">
        <div className="w-full overflow-hidden rounded-[34px] border border-white/10 bg-[#11141d] shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
          <div className="border-b border-white/10 bg-gradient-to-br from-[#1b2130] to-[#0f1117] px-6 py-7">
            <div className="inline-flex rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1 text-xs font-black tracking-[0.18em] text-red-300">
              WARNING
            </div>

            <h1 className="mt-4 text-[34px] font-black leading-tight tracking-[-0.06em]">
              RURUDONG2
              <br />
              SECURITY
            </h1>

            <p className="mt-3 text-sm font-bold leading-relaxed text-white/60">
              관리자 전용 보안 페이지입니다.
              <br />
              허가된 사용자만 접근할 수 있습니다.
            </p>
          </div>

          <form onSubmit={submitLogin} className="px-6 py-6">
            <label className="text-sm font-black text-white/80">
              관리자 비밀번호
            </label>

            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호 입력"
              className="mt-3 w-full rounded-2xl border border-white/10 bg-white px-4 py-4 text-base font-black text-[#111827] outline-none ring-0 placeholder:text-gray-400 focus:border-red-400"
            />

            {message && (
              <div className="mt-3 rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-black leading-relaxed text-red-300">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-2xl bg-red-500 px-4 py-4 text-base font-black text-white shadow-[0_16px_34px_rgba(239,68,68,0.28)] transition active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? "확인 중..." : "관리자 로그인"}
            </button>

            <div className="mt-4 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 px-4 py-3 text-xs font-bold leading-relaxed text-yellow-100/80">
              ⚠️ 관리자 페이지는 주문/입금/배송 정보가 포함되어 있습니다.
              공용 PC에서는 사용 후 반드시 브라우저를 종료해주세요.
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
