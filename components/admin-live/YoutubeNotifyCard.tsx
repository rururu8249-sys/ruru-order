"use client";

// 설정 패널의 "유튜브 라이브 알림" 카드.
//   - 유튜브 연결(봇 계정 OAuth) / 연결 상태 표시
//   - 라이브 URL 저장 (방송마다 한 번 붙여넣기 — 봇 계정이라 자동탐지 불가)
//   - ON/OFF 토글 + 알림 문구({{nickname}} 치환) 저장
//   - 테스트 발송 (ON/OFF 무시하고 1건 보내 동작 확인)
//   모든 비밀값(refresh token)은 서버에서만 다루고, 이 카드는 /api/youtube/admin 만 호출.

import { useEffect, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";

export default function YoutubeNotifyCard() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [liveUrl, setLiveUrl] = useState("");
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState("🛒 {{nickname}}님 주문 감사합니다!");
  const [savingUrl, setSavingUrl] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testing, setTesting] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/youtube/admin", { cache: "no-store" });
      const json = await res.json();
      if (json?.ok) {
        setConnected(!!json.connected);
        setLiveUrl(String(json.liveUrl || ""));
        setNotifyEnabled(!!json.notifyEnabled);
        setMessageTemplate(String(json.messageTemplate || "🛒 {{nickname}}님 주문 감사합니다!"));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
    // 연결 콜백에서 돌아온 경우 결과 표시
    try {
      const params = new URLSearchParams(window.location.search);
      const yt = params.get("yt");
      const msg = params.get("msg") || "";
      if (yt === "connected") showAdminToast("유튜브 연결 완료 ✅", "success");
      else if (yt === "error") showAdminToast("유튜브 연결 실패\n\n" + msg, "error");
      if (yt) {
        params.delete("yt");
        params.delete("msg");
        const q = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : ""));
      }
    } catch {
      // ignore
    }
  }, []);

  const connect = () => {
    window.location.href = "/api/youtube/oauth-start";
  };

  const saveUrl = async () => {
    setSavingUrl(true);
    try {
      const res = await fetch("/api/youtube/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-url", liveUrl }),
      });
      const json = await res.json();
      if (json?.ok) showAdminToast("라이브 URL을 저장했습니다.", "success");
      else showAdminToast("저장 실패\n\n" + (json?.error || ""), "error");
    } finally {
      setSavingUrl(false);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/youtube/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-settings", notifyEnabled, messageTemplate }),
      });
      const json = await res.json();
      if (json?.ok) showAdminToast("알림 설정을 저장했습니다.", "success");
      else showAdminToast("저장 실패\n\n" + (json?.error || ""), "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/youtube/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const json = await res.json();
      if (json?.ok) showAdminToast("테스트 메시지를 라이브 채팅에 올렸습니다 ✅", "success");
      else showAdminToast("테스트 발송 실패\n\n" + (json?.reason || json?.error || "알 수 없는 오류"), "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">유튜브 라이브 알림</h2>
          <p className="mt-1 text-xs font-bold text-slate-400">주문 제출 시 유튜브 라이브 채팅에 자동으로 알림을 올립니다. (봇 계정 기준)</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {loading ? "확인 중..." : connected ? "● 연결됨" : "○ 미연결"}
        </span>
      </div>

      {/* 연결 */}
      <div className="flex items-start justify-between gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <div>
          <div className="text-sm font-black text-slate-900">봇 계정 연결</div>
          <div className="mt-1 text-xs font-bold leading-5 text-slate-400">
            알림을 올릴 유튜브(봇) 계정으로 한 번 로그인합니다. 한 번 연결하면 계속 유지됩니다.
          </div>
        </div>
        <button
          type="button"
          onClick={connect}
          className="shrink-0 rounded-full bg-rose-deep px-4 py-2 text-xs font-black text-white transition hover:bg-rose-deep"
        >
          {connected ? "다시 연결" : "유튜브 연결"}
        </button>
      </div>

      {/* 라이브 URL */}
      <div className="mt-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-black text-slate-900">현재 라이브 주소</div>
        <div className="mt-1 text-xs font-bold leading-5 text-slate-400">방송 시작할 때마다 그날 유튜브 라이브 주소를 붙여넣고 저장하세요. (예: https://www.youtube.com/watch?v=… 또는 https://youtu.be/…)</div>
        <div className="mt-3 flex gap-2">
          <input
            value={liveUrl}
            onChange={(e) => setLiveUrl(e.target.value)}
            placeholder="유튜브 라이브 주소 붙여넣기"
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-rose-deep focus:ring-4 focus:ring-rose-soft"
          />
          <button
            type="button"
            onClick={saveUrl}
            disabled={savingUrl}
            className="shrink-0 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-rose-deep disabled:opacity-50"
          >
            {savingUrl ? "저장중" : "저장"}
          </button>
        </div>
      </div>

      {/* ON/OFF + 문구 */}
      <div className="mt-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-black text-slate-900">자동 알림</div>
            <div className="mt-1 text-xs font-bold leading-5 text-slate-400">ON이면 손님이 주문서를 제출할 때마다 채팅에 알림을 올립니다.</div>
          </div>
          <button
            type="button"
            onClick={() => setNotifyEnabled((v) => !v)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${notifyEnabled ? "bg-rose-deep text-white" : "border border-slate-200 bg-white text-slate-500"}`}
          >
            {notifyEnabled ? "알림 ON" : "알림 OFF"}
          </button>
        </div>

        <div className="mt-3 text-sm font-black text-slate-900">알림 문구</div>
        <div className="mt-1 text-xs font-bold leading-5 text-slate-400"><code>{"{{nickname}}"}</code> 자리에 주문한 닉네임이 들어갑니다. (개인정보 보호를 위해 닉네임만 사용)</div>
        <textarea
          value={messageTemplate}
          onChange={(e) => setMessageTemplate(e.target.value)}
          rows={2}
          className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold leading-relaxed outline-none transition focus:border-rose-deep focus:ring-4 focus:ring-rose-soft"
        />

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={saveSettings}
            disabled={savingSettings}
            className="rounded-2xl bg-rose-deep px-5 py-3 text-sm font-black text-white transition hover:bg-rose-deep disabled:opacity-50"
          >
            {savingSettings ? "저장중" : "설정 저장"}
          </button>
          <button
            type="button"
            onClick={sendTest}
            disabled={testing}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:border-rose-deep disabled:opacity-50"
          >
            {testing ? "발송중..." : "테스트 발송"}
          </button>
        </div>
        <div className="mt-2 text-[11px] font-bold leading-5 text-slate-400">※ 테스트 발송은 ON/OFF와 상관없이 1건 보냅니다. 연결 + 라이브 주소 저장 + 실제 방송 중일 때 채팅에 떠요.</div>
      </div>
    </div>
  );
}
