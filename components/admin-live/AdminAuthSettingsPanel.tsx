"use client";

import { FormEvent, useEffect, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";

export default function AdminAuthSettingsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currentUsername, setCurrentUsername] = useState("ruru");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextUsername, setNextUsername] = useState("ruru");
  const [nextPassword, setNextPassword] = useState("");
  const [nextPasswordConfirm, setNextPasswordConfirm] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [showNextPasswordConfirm, setShowNextPasswordConfirm] = useState(false);
  const [usingCustomCredentials, setUsingCustomCredentials] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");

  const loadSettings = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/admin-live/admin-auth-settings", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "관리자 보안 설정 조회 실패");
      }

      const username = String(result.username || "ruru");

      setCurrentUsername(username);
      setNextUsername(username);
      setUsingCustomCredentials(Boolean(result.usingCustomCredentials));
      setUpdatedAt(String(result.updatedAt || ""));
    } catch (error) {
      const message = error instanceof Error ? error.message : "관리자 보안 설정 조회 중 오류";
      showAdminToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadSettings();
  }, [isOpen]);

  const submitSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (nextPassword !== nextPasswordConfirm) {
      showAdminToast("새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.", "warning");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/admin-live/admin-auth-settings", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentUsername: currentUsername.trim(),
          currentPassword,
          nextUsername: nextUsername.trim(),
          nextPassword,
          nextPasswordConfirm,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "관리자 보안 설정 저장 실패");
      }

      setCurrentUsername(String(result.username || nextUsername));
      setCurrentPassword("");
      setNextPassword("");
      setNextPasswordConfirm("");
      setUsingCustomCredentials(true);
      setUpdatedAt(new Date().toISOString());

      showAdminToast("관리자 아이디/비밀번호를 변경했습니다.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "관리자 보안 설정 저장 중 오류";
      showAdminToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-black text-slate-950">
              관리자 보안 설정
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
              아이디 · 비밀번호
            </span>
            <span
              className={[
                "rounded-full px-2.5 py-1 text-[11px] font-black",
                usingCustomCredentials
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700",
              ].join(" ")}
            >
              {usingCustomCredentials ? "설정 완료" : "초기 비밀번호 사용중"}
            </span>
          </div>
          <p className="mt-1 text-[12px] font-bold text-slate-500">
            현재 아이디/비밀번호 확인 후 새 아이디/새 비밀번호로 변경합니다.
          </p>
        </div>

        <span className="rounded-full border border-slate-200 px-3 py-1.5 text-[12px] font-black text-blue-700">
          {isOpen ? "접기 ▲" : "열기 ▼"}
        </span>
      </button>

      {isOpen ? (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          <form onSubmit={submitSettings} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 rounded-2xl bg-white px-4 py-3 text-[12px] font-bold leading-relaxed text-slate-600 ring-1 ring-slate-200">
              {loading ? (
                "관리자 보안 설정을 불러오는 중입니다."
              ) : (
                <>
                  현재 아이디: <b className="text-slate-950">{currentUsername || "ruru"}</b>
                  {updatedAt ? (
                    <span className="ml-2 text-slate-400">
                      마지막 변경: {new Date(updatedAt).toLocaleString("ko-KR")}
                    </span>
                  ) : null}
                </>
              )}
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-black text-slate-700">
                  현재 아이디
                </span>
                <input
                  value={currentUsername}
                  onChange={(event) => setCurrentUsername(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold outline-none focus:border-blue-400"
                  placeholder="ruru"
                  autoComplete="username"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[12px] font-black text-slate-700">
                  현재 비밀번호
                </span>
                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-400">
                  <input
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    type={showCurrentPassword ? "text" : "password"}
                    className="min-w-0 flex-1 text-[13px] font-bold outline-none"
                    placeholder="기존 관리자 비밀번호"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((value) => !value)}
                    className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600"
                  >
                    {showCurrentPassword ? "숨김" : "보기"}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-[12px] font-black text-slate-700">
                  새 아이디
                </span>
                <input
                  value={nextUsername}
                  onChange={(event) => setNextUsername(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold outline-none focus:border-blue-400"
                  placeholder="새 관리자 아이디"
                  autoComplete="username"
                />
                <p className="mt-1 text-[10px] font-bold text-slate-400">
                  영문, 숫자, 점, 밑줄, 하이픈 사용 가능
                </p>
              </label>

              <label className="block">
                <span className="mb-1 block text-[12px] font-black text-slate-700">
                  새 비밀번호
                </span>
                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-400">
                  <input
                    value={nextPassword}
                    onChange={(event) => setNextPassword(event.target.value)}
                    type={showNextPassword ? "text" : "password"}
                    className="min-w-0 flex-1 text-[13px] font-bold outline-none"
                    placeholder="8자 이상"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNextPassword((value) => !value)}
                    className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600"
                  >
                    {showNextPassword ? "숨김" : "보기"}
                  </button>
                </div>
              </label>

              <label className="block lg:col-span-2">
                <span className="mb-1 block text-[12px] font-black text-slate-700">
                  새 비밀번호 확인
                </span>
                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-400">
                  <input
                    value={nextPasswordConfirm}
                    onChange={(event) => setNextPasswordConfirm(event.target.value)}
                    type={showNextPasswordConfirm ? "text" : "password"}
                    className="min-w-0 flex-1 text-[13px] font-bold outline-none"
                    placeholder="새 비밀번호를 한 번 더 입력"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNextPasswordConfirm((value) => !value)}
                    className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600"
                  >
                    {showNextPasswordConfirm ? "숨김" : "보기"}
                  </button>
                </div>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] font-bold leading-relaxed text-slate-500">
                변경 후에는 다음 로그인부터 새 아이디/비밀번호를 사용합니다.
              </p>

              <button
                type="submit"
                disabled={saving || loading}
                className="rounded-xl bg-slate-950 px-5 py-3 text-[12px] font-black text-white disabled:cursor-wait disabled:opacity-50"
              >
                {saving ? "변경중..." : "아이디/비밀번호 변경"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
