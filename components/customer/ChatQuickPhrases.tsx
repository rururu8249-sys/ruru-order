"use client";
/**
 * [2026-11-13 사장님] 관리자 PC 사이트 채팅 «자주 쓰는 말».
 *   채팅 입력칸 위 한 줄(번호 칩) — 누르거나 Alt(맥 Option)+숫자 → 입력칸에 들어감(보내기는 Enter, 저절로 안 보냄).
 *   「편집」 = 말 넣기·고치기·지우기·순서. 저장은 서버(관리자·채팅 관리자만) — 다른 PC 에서도 같은 목록.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { chatIdentityHeaders } from "@/lib/useLiveChatPrivate";
import { DEFAULT_QUICK_PHRASES, QUICK_PHRASES_MAX, QUICK_PHRASE_MAX_LEN, cleanQuickPhrases, quickPhraseIndexFromKey } from "@/lib/liveChatQuickPhrases";

export default function ChatQuickPhrases({ onPick, disabled }: { onPick: (phrase: string) => void; disabled?: boolean }) {
  const [phrases, setPhrases] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const live = useRef({ phrases, onPick, disabled, editing: false });
  useEffect(() => { live.current = { phrases, onPick, disabled, editing: editing !== null }; });

  useEffect(() => {
    let alive = true;
    fetch("/api/live-chat/quick-phrases", { cache: "no-store", headers: { ...chatIdentityHeaders() } })
      .then((r) => r.json())
      .then((j) => { if (!alive) return; setPhrases(j?.ok && Array.isArray(j.phrases) ? cleanQuickPhrases(j.phrases) : [...DEFAULT_QUICK_PHRASES]); setLoaded(true); })
      .catch(() => { if (alive) { setPhrases([...DEFAULT_QUICK_PHRASES]); setLoaded(true); } });
    return () => { alive = false; };
  }, []);

  // Alt(Option)+1~9 → 그 번호 말을 입력칸에. 편집 창이 열려 있으면 안 함.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = quickPhraseIndexFromKey(e);
      const cur = live.current;
      if (i < 0 || cur.editing || cur.disabled || e.isComposing || !cur.phrases[i]) return;
      e.preventDefault();
      cur.onPick(cur.phrases[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const save = async () => {
    if (!editing || saving) return;
    const next = cleanQuickPhrases(editing);
    setSaving(true); setNote("");
    try {
      const r = await fetch("/api/live-chat/quick-phrases", { method: "POST", headers: { "Content-Type": "application/json", ...chatIdentityHeaders() }, body: JSON.stringify({ phrases: next }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { setNote(j?.message || "저장하지 못했어요. 다시 눌러 주세요."); return; }
      setPhrases(Array.isArray(j.phrases) ? j.phrases : next); setEditing(null);
    } catch { setNote("저장하지 못했어요. 다시 눌러 주세요."); }
    finally { setSaving(false); }
  };
  const move = (i: number, d: -1 | 1) => setEditing((list) => {
    if (!list) return list;
    const j = i + d; if (j < 0 || j >= list.length) return list;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  if (!loaded) return null;
  const small = { height: "28px", padding: "0 10px", border: "1px solid #555555", borderRadius: "9999px", background: "transparent", color: "#DDDDDD", fontSize: "13px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", flexShrink: 0 } as const;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "0 0 8px", minWidth: 0 }}>
        <div data-live-scroll style={{ flex: 1, minWidth: 0, display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none" }}>
          {phrases.length === 0 ? <span style={{ fontSize: "13px", color: "#AAAAAA", lineHeight: "28px", whiteSpace: "nowrap" }}>자주 쓰는 말을 넣어 두면 한 번에 써요</span> : null}
          {phrases.map((p, i) => (
            <button key={p} type="button" disabled={disabled} title={i < 9 ? `${p}\n(Alt+${i + 1})` : p} onClick={() => onPick(p)}
              style={{ ...small, maxWidth: "180px", display: "flex", alignItems: "center", gap: "6px", background: "#272727", color: "#FFFFFF", fontWeight: 500 }}>
              {i < 9 ? <span aria-hidden style={{ flexShrink: 0, color: "#AAAAAA", fontSize: "13px", fontWeight: 700 }}>{i + 1}</span> : null}
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => { setNote(""); setEditing(phrases.length ? [...phrases] : [""]); }} style={small} aria-label="자주 쓰는 말 편집">편집</button>
      </div>
      {editing ? createPortal(
        <div role="dialog" aria-label="자주 쓰는 말 편집" onClick={(e) => { if (e.target === e.currentTarget && !saving) setEditing(null); }}
          onKeyDown={(e) => { if (e.key === "Escape" && !saving) { e.stopPropagation(); setEditing(null); } }}
          style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ width: "100%", maxWidth: "520px", maxHeight: "86vh", display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: "16px", color: "#111111", overflow: "hidden" }}>
            <div style={{ padding: "16px 16px 8px", flexShrink: 0 }}>
              <div style={{ fontSize: "17px", fontWeight: 700 }}>자주 쓰는 말</div>
              <div style={{ marginTop: "4px", fontSize: "13px", color: "#707072", lineHeight: 1.5 }}>누르거나 Alt(맥은 Option)+숫자를 누르면 채팅 입력칸에 들어가요. 보내기는 Enter 예요.</div>
            </div>
            <div data-live-scroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {editing.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "20px", flexShrink: 0, textAlign: "center", fontSize: "13px", fontWeight: 700, color: "#707072" }}>{i + 1}</span>
                  <input data-live-chat-input value={p} maxLength={QUICK_PHRASE_MAX_LEN} autoFocus={i === editing.length - 1 && !p} placeholder="예: 루루스펙 159cm/48kg" aria-label={`${i + 1}번 말`}
                    onChange={(e) => setEditing((list) => list ? list.map((v, k) => k === i ? e.target.value : v) : list)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void save(); } }}
                    style={{ flex: 1, minWidth: 0, height: "44px", padding: "0 12px", border: "1px solid #E5E5E5", borderRadius: "8px", fontSize: "16px", fontFamily: "inherit", color: "#111111", background: "#FFFFFF", outline: "none", boxSizing: "border-box" }} />
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${i + 1}번 위로`} style={{ width: "32px", height: "44px", border: "1px solid #E5E5E5", borderRadius: "8px", background: "#FFFFFF", color: i === 0 ? "#CCCCCC" : "#111111", fontSize: "14px", cursor: i === 0 ? "default" : "pointer", flexShrink: 0 }}>↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === editing.length - 1} aria-label={`${i + 1}번 아래로`} style={{ width: "32px", height: "44px", border: "1px solid #E5E5E5", borderRadius: "8px", background: "#FFFFFF", color: i === editing.length - 1 ? "#CCCCCC" : "#111111", fontSize: "14px", cursor: i === editing.length - 1 ? "default" : "pointer", flexShrink: 0 }}>↓</button>
                  <button type="button" onClick={() => setEditing((list) => list ? list.filter((_, k) => k !== i) : list)} aria-label={`${i + 1}번 지우기`} style={{ height: "44px", padding: "0 10px", border: "none", background: "transparent", color: "#D30005", fontSize: "14px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", flexShrink: 0 }}>지우기</button>
                </div>
              ))}
              {editing.length < QUICK_PHRASES_MAX ? (
                <button type="button" onClick={() => setEditing((list) => list ? [...list, ""] : list)} style={{ height: "44px", border: "1px dashed #CCCCCC", borderRadius: "8px", background: "#FFFFFF", color: "#111111", fontSize: "14px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>+ 말 추가 ({editing.length}/{QUICK_PHRASES_MAX})</button>
              ) : <div style={{ fontSize: "13px", color: "#707072" }}>{QUICK_PHRASES_MAX}개까지 넣을 수 있어요.</div>}
            </div>
            {note ? <div role="alert" style={{ padding: "0 16px 8px", fontSize: "13px", color: "#D30005", flexShrink: 0 }}>{note}</div> : null}
            <div style={{ display: "flex", gap: "8px", padding: "8px 16px 16px", flexShrink: 0 }}>
              <button type="button" onClick={() => setEditing(null)} disabled={saving} style={{ flex: 1, height: "48px", border: "1px solid #E5E5E5", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "15px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>닫기</button>
              <button type="button" onClick={() => void save()} disabled={saving} style={{ flex: 2, height: "48px", border: "none", borderRadius: "9999px", background: "#111111", color: "#FFFFFF", fontSize: "15px", fontWeight: 700, fontFamily: "inherit", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "저장 중…" : "저장"}</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
