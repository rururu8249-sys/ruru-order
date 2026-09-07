"use client";

import { useEffect, useMemo, useState } from "react";
import { ADMIN_CONFIRM_EVENT, type AdminConfirmRequest } from "@/lib/adminConfirm";

export default function AdminConfirmHost() {
  const [request, setRequest] = useState<AdminConfirmRequest | null>(null);

  useEffect(() => {
    const handleConfirmRequest = (event: Event) => {
      const customEvent = event as CustomEvent<AdminConfirmRequest>;
      const detail = customEvent.detail;

      if (!detail?.resolve || !detail.message) return;

      setRequest(detail);
    };

    window.addEventListener(ADMIN_CONFIRM_EVENT, handleConfirmRequest);

    return () => {
      window.removeEventListener(ADMIN_CONFIRM_EVENT, handleConfirmRequest);
    };
  }, []);

  const messageLines = useMemo(() => {
    return String(request?.message || "")
      .split("\n")
      .map((line) => line.trimEnd());
  }, [request?.message]);

  if (!request) return null;

  const tone = request.tone || "warning";
  const title = request.title || "확인 필요";
  const confirmText = request.confirmText || "확인";
  const cancelText = request.cancelText || "취소";

  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "info"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  const buttonClass =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : tone === "info"
        ? "bg-blue-600 hover:bg-blue-700"
        : "bg-slate-900 hover:bg-slate-700";

  const close = (ok: boolean) => {
    const resolve = request.resolve;
    setRequest(null);
    resolve(ok);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/35 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className={`mb-4 rounded-2xl border px-4 py-3 ${toneClass}`}>
          <div className="text-sm font-black">{title}</div>
          <div className="mt-1 text-xs font-bold opacity-80">
            작업을 진행하기 전에 한 번만 확인해주세요.
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold leading-6 text-slate-700">
          {messageLines.map((line, index) =>
            line ? (
              <p key={`${request.id}_${index}`}>{line}</p>
            ) : (
              <div key={`${request.id}_${index}`} className="h-3" />
            )
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-500 hover:bg-slate-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className={`rounded-2xl py-3 text-sm font-black text-white ${buttonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
