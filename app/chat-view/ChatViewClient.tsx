"use client";
// [2026-11-10] 채팅만 보는 화면(태블릿 가로) — 왼쪽 유튜브 채팅 / 오른쪽 사이트 채팅. 세로로 들면 위·아래.
//   지금 켜진 방송을 저절로 찾음(1분마다 다시 확인 — 새 방송이 켜지면 그 방송으로).
//   사이트 채팅 = /api/live-chat (처음 한 번) + 소식(ruru-live chat)으로 새 글. 이모티콘 그림·왕관·AI 표시 그대로.
//   화면 꺼짐 방지(되는 브라우저만). 글자 크기 이 기기에만 기억.
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { subscribeLiveEvents } from "@/lib/liveEvents";
import { mergeChat, parseChatMessage, type LiveChatMessage } from "@/lib/liveChat";
import { youtubeVideoIdFromUrl } from "@/lib/liveWatch";
import type { ChatEmoji } from "@/lib/liveChatEmoji";
import { ChatBodyView, emojiMapOf } from "@/components/customer/ChatBodyView";

type Bc = { id: string; title: string; videoId: string; paused: boolean };
const SIZE_KEY = "ruru_chat_view_size";
const SIZES = [16, 18, 20, 23, 26];

const BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  crown: { label: "관리자", bg: "#FFF3BF", fg: "#8A6100" },
  crown_pink: { label: "관리자", bg: "#FFDEEB", fg: "#A61E4D" },
  mod: { label: "R", bg: "#F1F3F5", fg: "#111111" },
  bot: { label: "AI", bg: "#E7F5FF", fg: "#1864AB" },
};

export default function ChatViewClient() {
  const [bc, setBc] = useState<Bc | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [list, setList] = useState<LiveChatMessage[]>([]);
  const [emojis, setEmojis] = useState<ChatEmoji[]>([]);
  const [sizeIdx, setSizeIdx] = useState(1);
  const emojiMap = useMemo(() => emojiMapOf(emojis), [emojis]);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  // 글자 크기(이 기기에만)
  useEffect(() => {
    const t = window.setTimeout(() => {
      try { const n = Number(window.localStorage.getItem(SIZE_KEY)); if (Number.isInteger(n) && n >= 0 && n < SIZES.length) setSizeIdx(n); } catch { /* 무시 */ }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const changeSize = (d: number) => setSizeIdx((v) => { const n = Math.min(SIZES.length - 1, Math.max(0, v + d)); try { window.localStorage.setItem(SIZE_KEY, String(n)); } catch { /* 무시 */ } return n; });

  // 지금 켜진 방송 — 처음 + 1분마다
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from("broadcasts").select("*").eq("status", "ON").order("started_at", { ascending: false }).limit(5);
      if (!alive) return;
      const row = ((data ?? []) as Array<Record<string, unknown>>).find((r) => r.is_deleted !== true);
      setLoaded(true);
      if (!row) { setBc(null); return; }
      const next: Bc = {
        id: String(row.id),
        title: String(row.public_title || row.title || "").trim(),
        videoId: youtubeVideoIdFromUrl(row.youtube_live_url || row.youtube_url),
        paused: Boolean(row.paused_at) && Date.parse(String(row.paused_at)) >= Date.parse(String(row.started_at || 0)),
      };
      setBc((prev) => (prev && prev.id === next.id && prev.videoId === next.videoId && prev.title === next.title && prev.paused === next.paused ? prev : next));
    };
    void load();
    const t = window.setInterval(() => void load(), 60000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  // 사이트 채팅 — 방송이 정해지면 최근 글 + 소식
  const bcId = bc?.id ?? "";
  useEffect(() => {
    if (!bcId) return;
    let alive = true;
    const load = async () => {
      try {
        const j = await fetch(`/api/live-chat?bc=${encodeURIComponent(bcId)}`, { cache: "no-store" }).then((r) => r.json());
        if (!alive || !j?.ok) return;
        setList(mergeChat([], (j.messages || []).map(parseChatMessage).filter(Boolean) as LiveChatMessage[], 200));
      } catch { /* 다음에 */ }
    };
    const loadEmojis = () => fetch("/api/live-chat/emoji", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive && j?.ok) setEmojis(Array.isArray(j.items) ? j.items : []); }).catch(() => {});
    void load();
    loadEmojis();
    const off = subscribeLiveEvents(supabase, {
      onChat: (payload) => {
        const m = parseChatMessage(payload);
        if (!m || m.broadcastId !== bcId) return;
        setList((prev) => (m.hidden ? prev.filter((x) => x.id !== m.id) : mergeChat(prev, [m], 200)));
      },
    });
    // 소식이 끊겨도 1분마다 맞춤 · 이모티콘 5분마다
    const t1 = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000);
    const t2 = window.setInterval(loadEmojis, 300000);
    return () => { alive = false; off(); window.clearInterval(t1); window.clearInterval(t2); };
  }, [bcId]);

  // 맨 아래 보고 있으면 새 글 따라 내려감
  useEffect(() => {
    const el = boxRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [list, sizeIdx]);

  // 화면 꺼짐 방지(되는 브라우저만 — 크롬 OK)
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const req = async () => { try { if (nav.wakeLock && document.visibilityState === "visible") lock = await nav.wakeLock.request("screen"); } catch { /* 무시 */ } };
    void req();
    const onVis = () => { if (document.visibilityState === "visible") void req(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); void lock?.release().catch(() => {}); };
  }, []);

  const fontPx = SIZES[sizeIdx];
  const ytSrc = bc?.videoId && typeof window !== "undefined" ? `https://www.youtube.com/live_chat?v=${bc.videoId}&embed_domain=${window.location.hostname}` : "";

  return (
    <div className="ruru-chat-view" style={{ position: "fixed", inset: 0, background: "#F5F5F5", color: "#111111", display: "grid", gap: "8px", padding: "8px", boxSizing: "border-box", fontFamily: "inherit" }}>
      <style>{`.ruru-chat-view{grid-template-columns:1fr 1fr;grid-template-rows:100%}@media (orientation: portrait){.ruru-chat-view{grid-template-columns:100%;grid-template-rows:1fr 1fr}}`}</style>

      {/* 유튜브 채팅 */}
      <section style={{ minHeight: 0, display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: "12px", overflow: "hidden", border: "1px solid #E5E5E5" }}>
        <header style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderBottom: "1px solid #E5E5E5" }}>
          <span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "9999px", background: "#FF0000" }} />
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800 }}>유튜브 채팅</h2>
        </header>
        <div style={{ flex: 1, minHeight: 0 }}>
          {ytSrc ? (
            <iframe title="유튜브 채팅" src={ytSrc} style={{ width: "100%", height: "100%", border: 0, display: "block" }} />
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", textAlign: "center", fontSize: "18px", color: "#707072" }}>
              {!loaded ? "불러오는 중…" : bc ? "방송 관리 창에 유튜브 라이브 주소를 넣으면 여기 나와요." : "지금 켜진 방송이 없어요. 방송을 켜면 저절로 나와요."}
            </div>
          )}
        </div>
      </section>

      {/* 사이트 채팅 */}
      <section style={{ minHeight: 0, display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: "12px", overflow: "hidden", border: "1px solid #E5E5E5", position: "relative" }}>
        <header style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px 10px 16px", borderBottom: "1px solid #E5E5E5" }}>
          <span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "9999px", background: "#111111" }} />
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>사이트 채팅</h2>
          {bc?.paused ? <span style={{ fontSize: "14px", fontWeight: 700, color: "#707072" }}>쉬는 중</span> : null}
          <button type="button" onClick={() => changeSize(-1)} aria-label="글자 작게" style={{ width: "44px", height: "40px", border: "1px solid #E5E5E5", borderRadius: "8px", background: "#FFFFFF", fontSize: "15px", fontWeight: 700 }}>가-</button>
          <button type="button" onClick={() => changeSize(1)} aria-label="글자 크게" style={{ width: "44px", height: "40px", border: "1px solid #E5E5E5", borderRadius: "8px", background: "#FFFFFF", fontSize: "18px", fontWeight: 700 }}>가+</button>
        </header>
        <div
          ref={boxRef}
          role="log"
          aria-live="polite"
          aria-label="사이트 채팅"
          onScroll={(e) => { const el = e.currentTarget; const at = el.scrollHeight - el.scrollTop - el.clientHeight < 40; stick.current = at; setAtBottom(at); }}
          style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 12px", fontSize: `${fontPx}px`, lineHeight: 1.45 }}
        >
          {!bc ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#707072", fontSize: "18px" }}>{loaded ? "지금 켜진 방송이 없어요." : "불러오는 중…"}</div>
          ) : list.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#707072", fontSize: "18px" }}>아직 글이 없어요. 손님이 쓰면 바로 나와요.</div>
          ) : list.map((m) => {
            const b = m.badge ? BADGE[m.badge] : null;
            const avatar = m.badge === "bot" ? "/ruru-ai-avatar.png" : m.avatar;
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "6px 0" }}>
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" referrerPolicy="no-referrer" style={{ width: "1.6em", height: "1.6em", borderRadius: "9999px", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <span aria-hidden="true" style={{ width: "1.6em", height: "1.6em", borderRadius: "9999px", background: "#E5E5E5", color: "#4B4B4D", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.75em", fontWeight: 700, flexShrink: 0 }}>{Array.from(m.nickname)[0] || "?"}</span>
                )}
                <div style={{ minWidth: 0, flex: 1, wordBreak: "break-word" }}>
                  <span style={{ fontWeight: 800, color: "#4B4B4D", marginRight: "6px" }}>{m.nickname}</span>
                  {b ? <span style={{ display: "inline-flex", alignItems: "center", height: "1.25em", padding: "0 0.4em", marginRight: "6px", borderRadius: "6px", background: b.bg, color: b.fg, fontSize: "0.7em", fontWeight: 800, verticalAlign: "0.12em" }}>{b.label}</span> : null}
                  <ChatBodyView body={m.body} emojis={emojiMap} />
                </div>
              </div>
            );
          })}
        </div>
        {!atBottom ? (
          <button type="button" onClick={() => { const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight; stick.current = true; setAtBottom(true); }}
            style={{ position: "absolute", left: "50%", bottom: "12px", transform: "translateX(-50%)", height: "44px", padding: "0 18px", border: "none", borderRadius: "9999px", background: "#111111", color: "#FFFFFF", fontSize: "16px", fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>
            새 글 보기 ↓
          </button>
        ) : null}
      </section>
    </div>
  );
}
