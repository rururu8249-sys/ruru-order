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
  const [messageTemplate, setMessageTemplate] = useState("🛒 {{nickname}}님 주문 감사합니다! ({{items}} · {{amount}})");
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
        setMessageTemplate(String(json.messageTemplate || "🛒 {{nickname}}님 주문 감사합니다! ({{items}} · {{amount}})"));
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
      // 지금 입력칸 문구를 그대로 미리보기로 보냄(저장 안 해도 바뀐 이모지/문구가 바로 보임).
      const preview =
        messageTemplate
          .replace(/\{\{\s*nickname\s*\}\}/g, "테스트")
          .replace(/\{\{\s*items\s*\}\}/g, "샘플상품 외 1건")
          .replace(/\{\{\s*amount\s*\}\}/g, "50,000원")
          .replace(/\(\s*[·\-/]?\s*\)/g, "")
          .replace(/\s{2,}/g, " ")
          .trim() || "🛒 루루동이 알림 테스트입니다";
      const res = await fetch("/api/youtube/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", message: preview }),
      });
      const json = await res.json();
      if (json?.ok) showAdminToast("테스트 메시지를 라이브 채팅에 올렸습니다 ✅", "success");
      else showAdminToast("테스트 발송 실패\n\n" + (json?.reason || json?.error || "알 수 없는 오류"), "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-[30px] border border-line bg-surface p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-ink">유튜브 라이브 알림</h2>
          <p className="mt-1 text-xs font-bold text-ink-mute">주문 제출 시 유튜브 라이브 채팅에 자동으로 알림을 올립니다. (봇 계정 기준)</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${connected ? "bg-ok-bg text-ok-tx" : "bg-surface-2 text-ink-soft"}`}>
          {loading ? "확인 중..." : connected ? "● 연결됨" : "○ 미연결"}
        </span>
      </div>

      {/* 연결 */}
      <div className="flex items-start justify-between gap-3 rounded-[24px] border border-line bg-surface-2 p-4">
        <div>
          <div className="text-sm font-black text-ink">봇 계정 연결</div>
          <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
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

      {/* 라이브 주소 — 메인 컨트롤타워에서 입력한 주소를 자동 사용 */}
      <div className="mt-3 rounded-[24px] border border-line bg-surface-2 p-4">
        <div className="text-sm font-black text-ink">현재 라이브 주소 (자동)</div>
        <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
          메인 화면(방송 컨트롤타워)에서 입력·저장한 유튜브 라이브 주소를 그대로 사용합니다. 여기서 따로 넣을 필요 없어요.
        </div>
        <div className="mt-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-bold text-ink">
          {liveUrl ? liveUrl : "아직 메인 화면에 라이브 주소가 저장되지 않았습니다."}
        </div>
      </div>

      {/* ON/OFF + 문구 */}
      <div className="mt-3 rounded-[24px] border border-line bg-surface-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-black text-ink">자동 알림</div>
            <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">ON이면 손님이 주문서를 제출할 때마다 채팅에 알림을 올립니다.</div>
          </div>
          <button
            type="button"
            onClick={() => setNotifyEnabled((v) => !v)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${notifyEnabled ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}
          >
            {notifyEnabled ? "알림 ON" : "알림 OFF"}
          </button>
        </div>

        <div className="mt-3 text-sm font-black text-ink">알림 문구</div>
        <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
          넣을 수 있는 자동값: <code>{"{{nickname}}"}</code> 닉네임 · <code>{"{{items}}"}</code> 주문요약(예: “뉴발2000 외 2건”) · <code>{"{{amount}}"}</code> 총 결제금액(택배비 포함). 개인정보 보호를 위해 닉네임만 표시됩니다.
        </div>
        <textarea
          value={messageTemplate}
          onChange={(e) => setMessageTemplate(e.target.value)}
          rows={2}
          className="mt-2 w-full resize-none rounded-2xl border border-line bg-surface p-4 text-sm font-bold leading-relaxed outline-none transition focus:border-rose-deep focus:ring-4 focus:ring-rose-soft"
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
            className="rounded-2xl border border-line bg-surface px-5 py-3 text-sm font-black text-ink transition hover:border-rose-deep disabled:opacity-50"
          >
            {testing ? "발송중..." : "테스트 발송"}
          </button>
        </div>
        <div className="mt-2 text-[11px] font-bold leading-5 text-ink-mute">※ 테스트 발송은 ON/OFF와 상관없이 1건 보냅니다. 연결 + 라이브 주소 저장 + 실제 방송 중일 때 채팅에 떠요.</div>
      </div>
    </div>
  );
}
