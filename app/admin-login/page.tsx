"use client";

import { FormEvent, useMemo, useState } from "react";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("ruru");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const nextPath = useMemo(() => {
    if (typeof window === "undefined") return "/admin-live";

    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || "/admin-live";

    return next.startsWith("/") ? next : "/admin-live";
  }, []);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
          remember,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "로그인에 실패했습니다.");
      }

      window.location.href = nextPath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "로그인 중 오류가 발생했습니다.";
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center justify-center">
        <section className="w-full rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
              🔐
            </div>
            <h1 className="text-xl font-black text-slate-950">
              루루동이 관리자 로그인
            </h1>
            <p className="mt-2 text-sm font-bold leading-relaxed text-slate-500">
              초기 아이디는 ruru, 초기 비밀번호는 기존 관리자 비밀번호입니다.
            </p>
          </div>

          <form onSubmit={submitLogin} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-black text-slate-700">
                관리자 아이디
              </span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
                placeholder="ruru"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-black text-slate-700">
                비밀번호
              </span>
              <div className="flex h-12 items-center rounded-2xl border border-slate-200 px-4 focus-within:border-blue-500">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="min-w-0 flex-1 text-sm font-bold text-slate-900 outline-none"
                  placeholder="기존 관리자 비밀번호"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="ml-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600"
                >
                  {showPassword ? "숨김" : "보기"}
                </button>
              </div>
            </label>

            <label className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <span className="text-sm font-black text-slate-700">
                자동로그인 유지
              </span>
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="h-4 w-4"
              />
            </label>

            {message ? (
              <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold leading-relaxed text-rose-700">
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-2xl bg-blue-600 text-sm font-black text-white shadow-sm disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? "확인 중..." : "관리자 로그인"}
            </button>
          </form>

          <div className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-800">
            로그인 후 관리자 화면의 보안 설정에서 원하는 아이디/비밀번호로 변경하세요.
          </div>
        </section>
      </div>
    </main>
  );
}
