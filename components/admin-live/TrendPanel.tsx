"use client";

// 📈 오늘의 트렌드 추천 패널 — AI가 뽑은 셀럽/인스타 트렌드 + 블루오션템을 어드민에서 보고, 텔레그램으로도 발송.
//   내용은 settings(trend_recommendation)에 저장. 비밀 아님(공개 패션 정보).
import { useEffect, useState } from "react";

export default function TrendPanel() {
  const [text, setText] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const r = await fetch("/api/admin-live/trend", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) {
        setText(j.text || "");
        setUpdatedAt(j.updatedAt || "");
      }
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin-live/trend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", text: draft }),
      });
      const j = await r.json();
      if (j.ok) {
        setText(draft);
        setEditing(false);
        setMsg("저장됐어요.");
        load();
      } else {
        setMsg("저장 실패: " + (j.error || ""));
      }
    } catch (e: any) {
      setMsg("저장 실패: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const sendTg = async () => {
    setMsg("");
    try {
      const r = await fetch("/api/admin-live/trend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-telegram" }),
      });
      const j = await r.json();
      setMsg(j.ok ? "✅ 텔레그램으로 보냈어요!" : "❌ " + (j.reason || j.error || "실패"));
    } catch (e: any) {
      setMsg("실패: " + (e?.message || e));
    }
  };

  const whenText = updatedAt
    ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(updatedAt))
    : "";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-base font-black text-ink">📈 오늘의 트렌드 추천</div>
          <div className="mt-1 text-xs font-bold text-ink-soft">셀럽·인스타 트렌드 + 블루오션템{whenText ? ` · 업데이트 ${whenText}` : ""}</div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button type="button" onClick={sendTg} className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-xs font-black text-ink-soft transition hover:bg-surface-3">📨 텔레그램</button>
          <button type="button" onClick={() => { setDraft(text); setEditing((v) => !v); }} className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-xs font-black text-ink-soft transition hover:bg-surface-3">{editing ? "취소" : "수정"}</button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            placeholder="여기에 트렌드 추천 내용을 붙여넣으세요"
            className="w-full rounded-xl border border-line bg-surface p-3 text-sm font-bold leading-6 text-ink outline-none focus:border-rose-deep"
          />
          <button type="button" onClick={save} disabled={saving} className="h-10 rounded-xl bg-rose-deep px-4 text-sm font-black text-white disabled:opacity-50">{saving ? "저장 중…" : "저장"}</button>
        </div>
      ) : (
        <div className="min-h-[120px] whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 p-4 text-sm font-bold leading-6 text-ink">
          {text || '아직 트렌드 추천이 없어요. [수정]을 눌러 내용을 붙여넣거나, AI한테 "오늘 트렌드 뽑아줘" 하세요.'}
        </div>
      )}
      {msg ? <div className="text-xs font-bold text-ink-soft">{msg}</div> : null}
    </div>
  );
}
