"use client";

// 텔레그램 알림 설정 카드 — 봇 토큰/chat id 붙여넣고 저장 + 테스트 발송.
//   비밀값은 서버전용 테이블에 보관(/api/admin-live/telegram). Vercel 환경변수 불필요.
import { useEffect, useState } from "react";

export default function TelegramNotifyCard() {
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [connected, setConnected] = useState(false);
  const [chatIdSet, setChatIdSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState("");

  const loadStatus = async () => {
    try {
      const r = await fetch("/api/admin-live/telegram", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) {
        setConnected(!!j.connected);
        setEnabled(j.enabled !== false);
        setChatIdSet(!!j.chatIdSet);
      }
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    loadStatus();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const body: Record<string, unknown> = { action: "save", enabled };
      if (botToken.trim()) body.botToken = botToken.trim();
      if (chatId.trim()) body.chatId = chatId.trim();
      const r = await fetch("/api/admin-live/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      setMsg(j.ok ? "저장됐어요." : `저장 실패: ${j.error || ""}`);
      if (j.ok) {
        setBotToken("");
        setChatId("");
        loadStatus();
      }
    } catch (e: any) {
      setMsg("저장 실패: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin-live/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const j = await r.json();
      setMsg(j.ok ? "✅ 테스트 알림을 보냈어요. 폰(텔레그램)에서 확인하세요!" : `❌ 실패: ${j.reason || j.error || "설정을 확인하세요"}`);
    } catch (e: any) {
      setMsg("실패: " + (e?.message || e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-black text-ink">📨 텔레그램 알림</div>
        <div className="mt-1 text-xs font-bold leading-5 text-ink-soft">
          미입금·출고밀림 같은 알림을 폰(텔레그램)으로 받습니다. 봇 토큰과 chat id를 붙여넣고 저장하세요. (Vercel 안 만져도 됨)
        </div>
      </div>

      <div className={`rounded-xl border border-line px-3 py-2 text-xs font-black ${connected ? "bg-ok-bg text-ok-tx" : "bg-warn-bg text-warn-tx"}`}>
        {connected ? "✅ 연결됨" : "⚠️ 아직 설정 안 됨 — 봇 토큰·chat id를 넣어주세요"}
      </div>

      <label className="block">
        <span className="text-xs font-black text-ink-soft">봇 토큰 (BotFather에서 받은 값)</span>
        <input
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          type="password"
          placeholder={connected ? "저장됨 — 바꿀 때만 입력" : "예: 7xxxxxx:AAH..."}
          className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-rose-deep"
        />
      </label>
      <label className="block">
        <span className="text-xs font-black text-ink-soft">chat id (@userinfobot에서 받은 숫자)</span>
        <input
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder={chatIdSet ? "저장됨 — 바꿀 때만 입력" : "예: 123456789"}
          className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-rose-deep"
        />
      </label>

      <label className="flex items-center gap-2 text-sm font-black text-ink">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-rose-deep" />
        알림 켜짐
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className="h-10 rounded-xl bg-rose-deep px-4 text-sm font-black text-white disabled:opacity-50">
          {saving ? "저장 중…" : "저장"}
        </button>
        <button type="button" onClick={sendTest} disabled={testing} className="h-10 rounded-xl border border-line bg-surface-2 px-4 text-sm font-black text-ink-soft transition hover:bg-surface-3 disabled:opacity-50">
          {testing ? "보내는 중…" : "🔔 테스트 보내기"}
        </button>
      </div>
      {msg ? <div className="text-xs font-bold text-ink-soft">{msg}</div> : null}

      <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-[11px] font-bold leading-5 text-ink-mute">
        준비물: ① 텔레그램 <b>@BotFather</b> → /newbot → 봇 토큰 ② <b>@userinfobot</b> → chat id.
        <br />그 봇과 먼저 <b>/start</b> 한 번 눌러야 메시지가 옵니다. (테스트가 실패하면 /start 눌렀는지 확인하세요)
      </div>
    </div>
  );
}
