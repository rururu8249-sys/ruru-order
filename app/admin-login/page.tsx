"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const getSafeNextPath = () => {
    if (typeof window === "undefined") return "/admin-live?panel=broadcast";

    const next = new URLSearchParams(window.location.search).get("next") || "";
    const allowed =
      next === "/admin" ||
      next.startsWith("/admin/") ||
      next === "/admin-live" ||
      next.startsWith("/admin-live") ||
      next === "/admin-v2" ||
      next.startsWith("/admin-v2");

    return allowed ? next : "/admin-live?panel=broadcast";
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submitting) return;

    setMessage("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password, remember }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.message || "관리자 로그인에 실패했습니다.");
      }

      router.replace(getSafeNextPath());
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "관리자 로그인 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <section className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-[520px] items-center justify-center">
        <form onSubmit={handleSubmit} className="w-full rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
              🔐
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">루루동이 관리자 로그인</h1>
            <p className="mt-3 text-sm font-bold leading-6 text-slate-500">
              관리자 전용 페이지입니다.
              <br />
              발급된 관리자 계정으로 로그인해주세요.
            </p>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-black text-slate-700">관리자 아이디</span>
              <input
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                autoComplete="username"
                className="h-13 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-bold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                placeholder="관리자 아이디"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-black text-slate-700">비밀번호</span>
              <div className="flex h-13 overflow-hidden rounded-2xl border border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="min-w-0 flex-1 px-4 text-base font-bold text-slate-950 outline-none"
                  placeholder="비밀번호"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="shrink-0 px-4 text-sm font-black text-slate-500 hover:text-slate-950"
                >
                  {showPassword ? "숨김" : "보기"}
                </button>
              </div>
            </label>

            <label className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span className="text-sm font-black text-slate-700">로그인 유지</span>
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="h-5 w-5 accent-blue-600"
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="h-13 w-full rounded-2xl bg-blue-600 text-base font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300"
            >
              {submitting ? "로그인 확인 중..." : "관리자 로그인"}
            </button>

            {message ? (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-black leading-6 text-red-700">
                {message}
              </div>
            ) : null}
          </div>

          <div className="mt-6 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-800">
            로그인 정보는 관리자 설정에서 관리하세요. 아이디나 비밀번호 힌트는 화면에 표시하지 않습니다.
          </div>
        </form>
      </section>
    </main>
  );
}
