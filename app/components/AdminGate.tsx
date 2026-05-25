"use client";

import { showAdminToast } from "@/lib/adminToast";

import { useEffect, useState } from "react";

export default function AdminGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ok, setOk] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("ruru_admin_login");

    if (saved === "ok") {
      setOk(true);
    }
  }, []);

  const handleLogin = () => {
    if (password === "ruddru8286!@()") {
      localStorage.setItem("ruru_admin_login", "ok");
      setOk(true);
    } else {
      showAdminToast("비밀번호가 틀렸습니다.");
    }
  };

  if (!ok) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
          <h1 className="text-3xl font-bold text-white mb-3">
            관리자 로그인
          </h1>

          <p className="text-gray-400 mb-6">
            관리자 비밀번호를 입력해주세요.
          </p>

          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-4 rounded-2xl bg-black border border-zinc-700 text-white mb-4"
          />

          <button
            onClick={handleLogin}
            className="w-full bg-yellow-400 text-black font-bold p-4 rounded-2xl"
          >
            로그인
          </button>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
