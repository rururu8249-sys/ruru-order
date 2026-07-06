"use client";
import { useEffect, useState } from "react";

export default function PWAInstallBanner() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    if (standalone) return; // 이미 설치/앱으로 열림
    const ua = navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    setIsIOS(ios);
    // [개선] 닫기 쿨다운을 안드로이드에도 적용 — 기존엔 iOS만 7일 쿨다운이라 안드로이드는 매 방문 배너 노출(배너 무시 학습됨)
    const dismissedAt = Math.max(
      Number(localStorage.getItem("ruru_pwa_ios_dismissed") || 0),
      Number(localStorage.getItem("ruru_pwa_dismissed") || 0),
    );
    const coolingDown = Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
    if (ios) {
      if (coolingDown) return;
      setShow(true);
    } else {
      const onBIP = (e: any) => {
        e.preventDefault();
        setDeferred(e);
        (window as any).__ruruPwaPrompt = e; // 주문완료 화면 등 다른 곳에서도 설치 트리거 가능하게 공유
        if (!coolingDown) setShow(true);
      };
      const onInstalled = () => { setShow(false); setDeferred(null); (window as any).__ruruPwaPrompt = null; };
      window.addEventListener("beforeinstallprompt", onBIP);
      window.addEventListener("appinstalled", onInstalled);
      return () => { window.removeEventListener("beforeinstallprompt", onBIP); window.removeEventListener("appinstalled", onInstalled); };
    }
  }, []);
  if (!show) return null;
  const onInstall = async () => { if (!deferred) return; deferred.prompt(); const r = await deferred.userChoice; if (r.outcome === "accepted") setShow(false); setDeferred(null); };
  const onClose = () => {
    setShow(false);
    localStorage.setItem(isIOS ? "ruru_pwa_ios_dismissed" : "ruru_pwa_dismissed", String(Date.now()));
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", background: "#F9EEF3", borderBottom: "1px solid #EAD9E0" }}>
      <span style={{ fontSize: "18px" }}>📲</span>
      <div style={{ flex: 1, fontSize: "12px", color: "#7A1E47", lineHeight: 1.4 }}>
        {isIOS ? <>루루동이 앱 설치: 공유 → <b>홈 화면에 추가</b></> : <>루루동이 앱 설치하고 더 빠르게!</>}
      </div>
      {!isIOS && <button onClick={onInstall} style={{ fontSize: "12px", fontWeight: 700, color: "#fff", background: "#7B2D43", border: "none", borderRadius: "99px", padding: "6px 14px", cursor: "pointer" }}>설치</button>}
      <button onClick={onClose} aria-label="닫기" style={{ border: "none", background: "none", fontSize: "16px", color: "#a98792", cursor: "pointer" }}>✕</button>
    </div>
  );
}
