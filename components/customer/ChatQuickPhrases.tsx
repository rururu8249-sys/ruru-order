"use client";
/**
 * [2026-11-13 사장님] 관리자 PC 사이트 채팅 «자주 쓰는 말».
 *   영상과 채팅 사이(영상 오른쪽 검은 여백) 판(11/13 08:41 사장님). 말마다 [유튜브][사이트] 버튼 — 누르면 바로 올라감.
 *   유튜브 = 복사(11:34 사장님 「API 는 한도 먹으니 복사로」). 유튜브 채팅칸은 남의 화면이라 글을 넣을 수도, 거기서 누른 키를 받을 수도 없음.
 *   「편집」 = 말 넣기·고치기·지우기·순서. 저장은 서버(관리자·채팅 관리자만) — 다른 PC 에서도 같은 목록.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { chatIdentityHeaders } from "@/lib/useLiveChatPrivate";
import { DEFAULT_QUICK_PHRASES, QUICK_PHRASES_MAX, QUICK_PHRASE_MAX_LEN, cleanQuickPhrases, quickPhraseIndexFromKey } from "@/lib/liveChatQuickPhrases";

const OPEN_KEY = "ruru_quick_phrases_open_v1"; // 이 PC 에서 접어 뒀는지만(편의값)
type SendResult = { ok: boolean; message?: string };
export default function ChatQuickPhrases({ onSendSite, onNotice, right }: { onSendSite: (phrase: string) => Promise<SendResult>; onNotice?: (message: string) => void; right?: string | number }) {
  const [open, setOpen] = useState(() => { try { return typeof window === "undefined" || localStorage.getItem(OPEN_KEY) !== "0"; } catch { return true; } });
  const toggle = (next: boolean) => { setOpen(next); try { localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch {} };
  const [phrases, setPhrases] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(""); // "yt:3" / "site:3" — 보내는 중인 버튼
  const [editing, setEditing] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const live = useRef({ phrases, send: (async () => {}) as (p: string, i: number, to: "yt" | "site") => Promise<void>, editing: false });

  useEffect(() => {
    let alive = true;
    fetch("/api/live-chat/quick-phrases", { cache: "no-store", headers: { ...chatIdentityHeaders() } })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setPhrases(j?.ok && Array.isArray(j.phrases) ? cleanQuickPhrases(j.phrases) : [...DEFAULT_QUICK_PHRASES]);
        setLoaded(true);
      })
      .catch(() => { if (alive) { setPhrases((cur) => cur.length ? cur : [...DEFAULT_QUICK_PHRASES]); setLoaded(true); } });
    return () => { alive = false; };
  }, []);
  // 유튜브 = 클립보드 복사(유튜브 채팅칸에 붙여넣기 — 유튜브 화면은 남의 사이트라 글을 직접 못 넣음, API 는 하루 한도를 써서 안 씀).
  //   사이트 = 사이트 채팅에 바로 올림(쓰던 입력칸 글은 그대로).
  const send = async (p: string, i: number, to: "yt" | "site") => {
    if (busy) return;
    if (to === "yt") {
      try { await navigator.clipboard.writeText(p); onNotice?.("복사했어요 · 유튜브 채팅칸에 붙여넣기(⌘V)"); }
      catch { onNotice?.("복사하지 못했어요. 다시 눌러 주세요"); }
      return;
    }
    setBusy(`${to}:${i}`);
    try {
      const r = await onSendSite(p).catch(() => ({ ok: false, message: "사이트 채팅에 못 보냈어요" }));
      onNotice?.(r.ok ? "사이트 채팅에 보냈어요" : r.message || "사이트 채팅에 못 보냈어요");
    } finally { setBusy(""); }
  };

  // Alt(맥 Option)+1~9 = 유튜브로, Alt+Shift+1~9 = 사이트로. (유튜브 채팅칸 안에 커서가 있으면 키가 유튜브로 가서 안 먹음)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = quickPhraseIndexFromKey(e);
      const cur = live.current;
      if (i < 0 || cur.editing || e.isComposing || !cur.phrases[i]) return;
      e.preventDefault();
      void cur.send(cur.phrases[i], i, e.shiftKey ? "site" : "yt");
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

  useEffect(() => { live.current = { phrases, send, editing: editing !== null }; });
  if (!loaded) return null;
  const rightCss = typeof right === "number" ? `${right}px` : right || "0px";
  const plain = { height: "32px", padding: "0 6px", border: "none", background: "transparent", color: "#AAAAAA", fontSize: "13px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", flexShrink: 0 } as const;
  const openEdit = () => { setNote(""); setEditing(phrases.length ? [...phrases] : [""]); };
  // 영상 오른쪽 검은 여백(영상과 채팅 사이) 아래쪽에 떠 있는 판. 접으면 작은 버튼만.
  const wrap = { position: "absolute", right: `calc(${rightCss} + 12px)`, bottom: "calc(96px + env(safe-area-inset-bottom))", zIndex: 3, pointerEvents: "auto" } as const;
  const btn = (primary: boolean, on: boolean) => ({ width: "100px", height: "32px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "0 6px", border: primary ? "none" : "1px solid #555555", borderRadius: "9999px", background: primary ? "#FFFFFF" : "transparent", color: primary ? "#0F0F0F" : "#FFFFFF", fontSize: "13px", fontWeight: 700, fontFamily: "inherit", cursor: on ? "default" : "pointer", opacity: on ? 0.6 : 1, whiteSpace: "nowrap" as const });
  return (
    <>
      {!open ? (
        <button type="button" data-live-quick-phrases="closed" onClick={() => toggle(true)} style={{ ...wrap, height: "40px", padding: "0 14px", border: "1px solid #555555", borderRadius: "9999px", background: "rgba(15,15,15,0.86)", color: "#FFFFFF", fontSize: "13px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>자주 쓰는 말 {phrases.length}</button>
      ) : (
        <section data-live-quick-phrases="open" aria-label="자주 쓰는 말" onClick={(e) => e.stopPropagation()}
          style={{ ...wrap, width: `min(400px, calc(100vw - ${rightCss} - 24px))`, maxHeight: "calc(100% - 200px)", display: "flex", flexDirection: "column", background: "rgba(15,15,15,0.92)", border: "1px solid #333333", borderRadius: "12px", color: "#FFFFFF", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "2px", padding: "8px 6px 4px 12px", flexShrink: 0 }}>
            <strong style={{ flex: 1, minWidth: 0, fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap" }}>자주 쓰는 말</strong>
            <button type="button" onClick={openEdit} style={plain} aria-label="자주 쓰는 말 편집">편집</button>
            <button type="button" onClick={() => toggle(false)} style={plain} aria-label="자주 쓰는 말 접기">접기</button>
          </div>
          <div data-live-scroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {phrases.length === 0 ? <div style={{ padding: "8px 4px", fontSize: "13px", color: "#AAAAAA", lineHeight: 1.5 }}>「편집」에서 자주 쓰는 말을 넣어 두세요.</div> : null}
            {phrases.map((p, i) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 8px 8px 10px", border: "1px solid #3A3A3A", borderRadius: "8px", background: "#222222" }}>
                {i < 9 ? <span aria-hidden style={{ flexShrink: 0, width: "18px", height: "18px", borderRadius: "9999px", background: "#FFFFFF", color: "#0F0F0F", fontSize: "12px", fontWeight: 700, lineHeight: "18px", textAlign: "center" }}>{i + 1}</span> : null}
                <span title={p} style={{ flex: 1, minWidth: 0, fontSize: "14px", fontWeight: 500, lineHeight: 1.4, wordBreak: "keep-all", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
                  <button type="button" onClick={() => void send(p, i, "yt")} disabled={!!busy} aria-label={`${i + 1}번 유튜브용 복사`} title={i < 9 ? `Alt+${i + 1}` : undefined} style={btn(true, busy === `yt:${i}`)}>
                    <svg aria-hidden width="14" height="10" viewBox="0 0 16 12"><rect width="16" height="12" rx="3" fill="#FF0000" /><path d="M6.5 3.5v5l4-2.5z" fill="#FFFFFF" /></svg>
                    유튜브 복사
                  </button>
                  <button type="button" onClick={() => void send(p, i, "site")} disabled={!!busy} aria-label={`${i + 1}번 사이트 채팅에 보내기`} title={i < 9 ? `Alt+Shift+${i + 1}` : undefined} style={btn(false, busy === `site:${i}`)}>
                    {busy === `site:${i}` ? "보내는 중" : "사이트"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "6px 12px 8px", borderTop: "1px solid #333333", fontSize: "12px", color: "#999999", lineHeight: 1.4, flexShrink: 0 }}>Alt+숫자 = 유튜브 복사 · Alt+Shift+숫자 = 사이트 보내기</div>
        </section>
      )}
      {editing ? createPortal(
        <div role="dialog" data-quick-phrase-edit aria-label="자주 쓰는 말 편집" onClick={(e) => { if (e.target === e.currentTarget && !saving) setEditing(null); }}
          onKeyDown={(e) => { if (e.key === "Escape" && !saving) { e.stopPropagation(); setEditing(null); } }}
          style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ width: "100%", maxWidth: "520px", maxHeight: "86vh", display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: "16px", color: "#111111", overflow: "hidden" }}>
            <div style={{ padding: "16px 16px 8px", flexShrink: 0 }}>
              <div style={{ fontSize: "17px", fontWeight: 700 }}>자주 쓰는 말</div>
              <div style={{ marginTop: "4px", fontSize: "13px", color: "#707072", lineHeight: 1.5 }}>「유튜브 복사」 = 복사돼요, 유튜브 채팅칸에 붙여넣기만 하세요. 「사이트」 = 사이트 채팅에 바로 올라가요.</div>
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
