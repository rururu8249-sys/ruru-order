"use client";

// 텔레그램 알림 설정 카드 — 봇 토큰/chat id 붙여넣고 저장 + 테스트 발송.
//   비밀값은 서버전용 테이블에 보관(/api/admin-live/telegram). Vercel 환경변수 불필요.
import { useEffect, useState } from "react";

export default function TelegramNotifyCard() {
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [reportOnEnd, setReportOnEnd] = useState(true);
  const [connected, setConnected] = useState(false);
  const [chatIdSet, setChatIdSet] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);
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
        setRecipientCount(Number(j.recipientCount || 0));
        setReportOnEnd(j.reportOnEnd !== false);
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
      const body: Record<string, unknown> = { action: "save", enabled, reportOnEnd };
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

  const [detecting, setDetecting] = useState(false);
  const detectChat = async () => {
    setDetecting(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin-live/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detect-chat" }),
      });
      const j = await r.json();
      if (j.ok) {
        setMsg(`✅ 연결됐어요${j.name ? ` — ${j.name}` : ""} (번호 ${j.chatId}). 이제 🔔 테스트 보내기를 눌러보세요.`);
        loadStatus();
      } else {
        setMsg(`❌ 아직 못 찾았어요 — ② 봇에게 말을 한 번 보냈는지 확인한 뒤 다시 눌러주세요. (${j.reason || j.error || "응답 없음"})`);
      }
    } catch (e: any) {
      setMsg("실패: " + (e?.message || e));
    } finally {
      setDetecting(false);
    }
  };

  const [reporting, setReporting] = useState(false);
  const sendReport = async () => {
    setReporting(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin-live/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-report" }),
      });
      const j = await r.json();
      setMsg(j.ok ? "✅ 오늘 결산을 폰으로 보냈어요!" : `❌ 실패: ${j.reason || j.error || "설정을 확인하세요"}`);
    } catch (e: any) {
      setMsg("실패: " + (e?.message || e));
    } finally {
      setReporting(false);
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
          미입금·출고밀림 같은 알림과 방송 결산을 폰(텔레그램)으로 받습니다. 아래 세 단계면 끝나요.
        </div>
      </div>

      <div className={`rounded-xl border border-line px-3 py-2 text-xs font-black ${connected ? "bg-ok-bg text-ok-tx" : "bg-warn-bg text-warn-tx"}`}>
        {connected ? `✅ 연결됨 · 받는 사람 ${recipientCount}명` : "아직 연결 안 됨 — 아래 ①②③ 순서대로"}
      </div>

      {/* ① 봇 토큰 */}
      <div className="rounded-2xl border border-line bg-surface-2 p-3">
        <div className="text-xs font-black text-ink">① 봇 토큰 붙여넣고 저장</div>
        <div className="mt-1 text-[11px] font-bold leading-5 text-ink-mute">
          텔레그램 앱에서 <b>@BotFather</b>를 찾아 <b>/newbot</b> 을 보내면 봇이 만들어지고 토큰(긴 영문·숫자)이 나옵니다. 그걸 여기 붙여넣으세요.
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            type="password"
            placeholder={connected ? "저장됨 — 바꿀 때만 입력" : "예: 7xxxxxx:AAH..."}
            className="h-10 min-w-[240px] flex-1 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-rose-deep"
          />
          <button type="button" onClick={save} disabled={saving} className="h-10 rounded-xl bg-rose-deep px-4 text-sm font-black text-white disabled:opacity-50">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      {/* ② 봇에게 말 걸기 */}
      <div className="rounded-2xl border border-line bg-surface-2 p-3">
        <div className="text-xs font-black text-ink">② 텔레그램에서 그 봇에게 아무 말이나 한 번 보내기</div>
        <div className="mt-1 text-[11px] font-bold leading-5 text-ink-mute">
          알림을 받을 사람마다 한 번씩. (같이 운영하는 사람도 그 봇에게 말을 걸면 ③에서 같이 잡힙니다)
        </div>
      </div>

      {/* ③ 연결 찾기 */}
      <div className="rounded-2xl border border-line bg-surface-2 p-3">
        <div className="text-xs font-black text-ink">③ 연결 찾기</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={detectChat} disabled={detecting} className="h-10 rounded-xl bg-rose-deep px-4 text-sm font-black text-white disabled:opacity-50">
            {detecting ? "찾는 중…" : "🔍 연결 찾기"}
          </button>
          <button type="button" onClick={sendTest} disabled={testing} className="h-10 rounded-xl border border-line bg-surface px-4 text-sm font-black text-ink-soft transition hover:bg-surface-3 disabled:opacity-50">
            {testing ? "보내는 중…" : "🔔 테스트 보내기"}
          </button>
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-bold text-ink-mute">받는 사람 번호(chat id)를 직접 넣기</summary>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder={chatIdSet ? `저장됨(${recipientCount}명) — 바꿀 때만 입력` : "예: 123456789 (여러 명이면 쉼표로)"}
            className="mt-2 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-rose-deep"
          />
          <span className="mt-1 block text-[11px] font-bold text-ink-mute">직접 넣은 뒤에는 위 「저장」을 누르세요.</span>
        </details>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-black text-ink">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-rose-deep" />
          알림 켜짐
        </label>
        <label className="flex items-center gap-2 text-sm font-black text-ink">
          <input type="checkbox" checked={reportOnEnd} onChange={(e) => setReportOnEnd(e.target.checked)} className="h-4 w-4 accent-rose-deep" />
          방송 종료하면 결산 자동 발송
        </label>
        <span className="text-[11px] font-bold text-ink-mute">(바꾼 뒤 위 「저장」)</span>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={sendReport} disabled={reporting} className="h-10 rounded-xl bg-ok-tx px-4 text-sm font-black text-white disabled:opacity-50">
          {reporting ? "보내는 중…" : "📊 지금 결산 보내기"}
        </button>
        <span className="text-[11px] font-bold text-ink-mute">오늘 매출·미입금·큰손을 폰으로 한 통</span>
      </div>
      {msg ? <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-bold text-ink-soft">{msg}</div> : null}
    </div>
  );
}
