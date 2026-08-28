"use client";

import { useEffect, useState } from "react";

type SiteAlert = { id: number; kind: string; title: string; message: string; created_at: string; expires_at: string };

function sessionKey() {
  try { return localStorage.getItem("ruru_cart_session_key") || ""; } catch { return ""; }
}

export default function CustomerSiteAlertPopup() {
  const [alert, setAlert] = useState<SiteAlert | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname.startsWith("/admin")) return;
    let stopped = false;
    const load = async () => {
      const key = sessionKey();
      if (!key) return;
      try {
        const res = await fetch(`/api/customer-site-alerts?sessionKey=${encodeURIComponent(key)}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!stopped && res.ok && json?.ok) setAlert(json.alert || null);
      } catch { /* 개인알림 실패는 주문 흐름에 영향 없음 */ }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);

  const dismiss = async (goOrder: boolean) => {
    const current = alert;
    setAlert(null);
    if (current) {
      const key = sessionKey();
      if (key) {
        void fetch("/api/customer-site-alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: current.id, sessionKey: key }),
        }).catch(() => undefined);
      }
    }
    if (goOrder && typeof window !== "undefined" && window.location.pathname !== "/order") window.location.href = "/order";
  };

  if (!alert) return null;
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/55 px-5" role="dialog" aria-modal="true" aria-label="주문 확인 알림">
      <div className="w-full max-w-[420px] overflow-hidden rounded-[26px] bg-white shadow-2xl">
        <div className="px-6 pb-3 pt-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-3xl">🛒</div>
          <h2 className="text-xl font-black tracking-tight text-slate-950">{alert.title}</h2>
          <p className="mt-3 whitespace-pre-line text-sm font-bold leading-6 text-slate-600">{alert.message}</p>
        </div>
        <div className="grid gap-2 px-5 pb-5 pt-2">
          <button type="button" onClick={() => void dismiss(true)} className="h-13 rounded-2xl bg-[#7B2D43] text-base font-black text-white shadow-sm">주문 확인하기</button>
          <button type="button" onClick={() => void dismiss(false)} className="h-10 rounded-xl text-xs font-black text-slate-400">확인했어요</button>
        </div>
      </div>
    </div>
  );
}
