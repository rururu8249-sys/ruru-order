"use client";
// [2026-11-10 16:11] 어두운 화면 · 두 칸 각각 글자 크기 · 칸 켜고 끄기(하나는 늘 켜짐).
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
  crown: { label: "관리자", bg: "rgba(255,212,59,0.18)", fg: "#FFD43B" },
  crown_pink: { label: "관리자", bg: "rgba(247,131,172,0.2)", fg: "#F783AC" },
  mod: { label: "R", bg: "#3A3A3A", fg: "#F1F1F1" },
  bot: { label: "AI", bg: "rgba(62,166,255,0.2)", fg: "#74C0FC" },
};
// [16:11 사장님] 어두운 화면(눈 덜 피곤) — 유튜브 어두운 채팅과 같은 색
const C = { page: "#000000", panel: "#0F0F0F", line: "#2A2A2A", btn: "#1F1F1F", ink: "#F1F1F1", soft: "#AAAAAA", mute: "#8A8A8A" };
// 유튜브 채팅 확대 배율(기본 1.3) · 켜고 끄기 — 이 기기에만 기억
const YT_SCALES = [1, 1.15, 1.3, 1.5, 1.75, 2];
const YT_SIZE_KEY = "ruru_chat_view_yt_size";
const SHOW_KEY = "ruru_chat_view_show";

export default function ChatViewClient() {
  const [bc, setBc] = useState<Bc | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [list, setList] = useState<LiveChatMessage[]>([]);
  const [emojis, setEmojis] = useState<ChatEmoji[]>([]);
  const [sizeIdx, setSizeIdx] = useState(1);
  const [ytSizeIdx, setYtSizeIdx] = useState(2);
  const [show, setShow] = useState<{ yt: boolean; site: boolean }>({ yt: true, site: true });
  // [07:18 사장님] 유튜브 시청자 수·사이트 접속 수 — 각 칸 제목 옆(30초마다)
  const [counts, setCounts] = useState<{ yt: number | null; site: number | null }>({ yt: null, site: null });
  const emojiMap = useMemo(() => emojiMapOf(emojis), [emojis]);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  // 글자 크기(이 기기에만)
  useEffect(() => {
    const t = window.setTimeout(() => {
      try { const raw = window.localStorage.getItem(SIZE_KEY); const n = Number(raw); if (raw != null && Number.isInteger(n) && n >= 0 && n < SIZES.length) setSizeIdx(n); } catch { /* 무시 */ }
      try { const raw = window.localStorage.getItem(YT_SIZE_KEY); const n = Number(raw); if (raw != null && Number.isInteger(n) && n >= 0 && n < YT_SCALES.length) setYtSizeIdx(n); } catch { /* 무시 */ }
      try { const v = JSON.parse(window.localStorage.getItem(SHOW_KEY) || "null"); if (v && typeof v === "object" && (v.yt === true || v.site === true)) setShow({ yt: v.yt !== false, site: v.site !== false }); } catch { /* 무시 */ }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const changeYtSize = (d: number) => setYtSizeIdx((v) => { const n = Math.min(YT_SCALES.length - 1, Math.max(0, v + d)); try { window.localStorage.setItem(YT_SIZE_KEY, String(n)); } catch { /* 무시 */ } return n; });
  const setShowSaved = (next: { yt: boolean; site: boolean }) => { if (!next.yt && !next.site) return; if (next.site && !show.site) { stick.current = true; setAtBottom(true); } setShow(next); try { window.localStorage.setItem(SHOW_KEY, JSON.stringify(next)); } catch { /* 무시 */ } };
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

  useEffect(() => {
    if (!bcId) return;
    let alive = true;
    const load = () => fetch(`/api/live-viewers?bc=${encodeURIComponent(bcId)}`).then((r) => r.json()).then((j) => {
      if (!alive || !j?.ok) return;
      const n = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
      setCounts({ yt: n(j.viewers), site: n(j.site) });
    }).catch(() => {});
    load();
    const t = window.setInterval(load, 30000);
    return () => { alive = false; window.clearInterval(t); };
  }, [bcId]);

  // 맨 아래 보고 있으면 새 글 따라 내려감
  useEffect(() => {
    const el = boxRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [list, sizeIdx, show.site, show.yt]);

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
  // [16:11 사장님] 유튜브 채팅도 글자 크기 — 남의 화면(iframe)이라 글자를 못 바꿔 «화면째 확대»(scale). 유튜브 기본 글자 약 13px 기준.
  const ytScale = YT_SCALES[ytSizeIdx];
  const ytSrc = bc?.videoId && typeof window !== "undefined" ? `https://www.youtube.com/live_chat?v=${bc.videoId}&embed_domain=${window.location.hostname}&dark_theme=1` : "";
  const both = show.yt && show.site;

  const sizeBtn = (label: string, aria: string, onClick: () => void, disabled: boolean, fs: string) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={aria}
      style={{ width: "44px", height: "40px", border: `1px solid ${C.line}`, borderRadius: "8px", background: C.btn, color: disabled ? C.mute : C.ink, fontSize: fs, fontWeight: 700, opacity: disabled ? 0.45 : 1, flexShrink: 0 }}>{label}</button>
  );
  const toggle = (key: "yt" | "site", label: string, dot: string) => {
    const on = show[key];
    const last = on && !(key === "yt" ? show.site : show.yt); // 하나만 켜져 있으면 못 끔
    return (
      <button type="button" role="switch" aria-checked={on} disabled={last} onClick={() => setShowSaved({ ...show, [key]: !on })}
        title={last ? "둘 다 끌 수는 없어요" : undefined}
        style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 14px 0 10px", borderRadius: "9999px", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${on ? "#5A5A5A" : C.line}`, background: on ? "#2A2A2A" : "transparent", color: on ? C.ink : C.mute, fontSize: "16px", fontWeight: 700, cursor: last ? "default" : "pointer" }}>
        <span aria-hidden="true" style={{ position: "relative", width: "34px", height: "20px", borderRadius: "9999px", background: on ? dot : "#3A3A3A", transition: "background .15s", flexShrink: 0 }}>
          <span style={{ position: "absolute", top: "2px", left: on ? "16px" : "2px", width: "16px", height: "16px", borderRadius: "9999px", background: "#FFFFFF", transition: "left .15s" }} />
        </span>
        {label}
        <span style={{ fontSize: "14px", fontWeight: 700, color: on ? C.ink : C.mute, marginLeft: "2px" }}>{on ? "켬" : "끔"}</span>
      </button>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: C.page, color: C.ink, display: "flex", flexDirection: "column", fontFamily: "inherit", colorScheme: "dark" }}>
      <style>{`.ruru-chat-grid{grid-template-columns:1fr 1fr;grid-template-rows:100%}.ruru-chat-grid.one{grid-template-columns:100%;grid-template-rows:100%}@media (orientation: portrait){.ruru-chat-grid{grid-template-columns:100%;grid-template-rows:1fr 1fr}}`}</style>

      {/* 위 줄 — 채팅 켜고 끄기(하나는 늘 켜짐) */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 8px 0", flexWrap: "nowrap", minWidth: 0 }}>
        {toggle("yt", "유튜브 채팅", "#FF0000")}
        {toggle("site", "사이트 채팅", "#3EA6FF")}
        {bc?.paused ? <span style={{ marginLeft: "auto", fontSize: "15px", fontWeight: 700, color: C.mute, whiteSpace: "nowrap" }}>방송 쉬는 중</span> : null}
      </div>

      <div className={`ruru-chat-grid${both ? "" : " one"}`} style={{ flex: 1, minHeight: 0, display: "grid", gap: "8px", padding: "8px", boxSizing: "border-box" }}>
      {/* 유튜브 채팅 */}
      {show.yt ? (
      <section style={{ minHeight: 0, display: "flex", flexDirection: "column", background: C.panel, borderRadius: "12px", overflow: "hidden", border: `1px solid ${C.line}` }}>
        <header style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px 8px 16px", borderBottom: `1px solid ${C.line}` }}>
          <span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "9999px", background: "#FF0000", flexShrink: 0 }} />
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>유튜브 채팅</h2>
          {bc ? <span style={{ fontSize: "18px", fontWeight: 700, color: C.soft, whiteSpace: "nowrap" }}>시청자 {counts.yt != null ? `${counts.yt.toLocaleString("ko-KR")}명` : "-"}</span> : null}
          {sizeBtn("가-", "유튜브 채팅 글자 작게", () => changeYtSize(-1), ytSizeIdx === 0, "15px")}
          {sizeBtn("가+", "유튜브 채팅 글자 크게", () => changeYtSize(1), ytSizeIdx === YT_SCALES.length - 1, "18px")}
        </header>
        <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: "#0F0F0F" }}>
          {ytSrc ? (
            <iframe title="유튜브 채팅" src={ytSrc}
              style={{ position: "absolute", top: 0, left: 0, width: `${100 / ytScale}%`, height: `${100 / ytScale}%`, transform: `scale(${ytScale})`, transformOrigin: "0 0", border: 0, display: "block" }} />
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", textAlign: "center", fontSize: "18px", color: C.mute, lineHeight: 1.5 }}>
              {!loaded ? "불러오는 중…" : bc ? "방송 관리 창에 유튜브 라이브 주소를 넣으면 여기 나와요." : "지금 켜진 방송이 없어요. 방송을 켜면 저절로 나와요."}
            </div>
          )}
        </div>
      </section>
      ) : null}

      {/* 사이트 채팅 */}
      {show.site ? (
      <section style={{ minHeight: 0, display: "flex", flexDirection: "column", background: C.panel, borderRadius: "12px", overflow: "hidden", border: `1px solid ${C.line}`, position: "relative" }}>
        <header style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px 8px 16px", borderBottom: `1px solid ${C.line}` }}>
          <span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "9999px", background: "#3EA6FF", flexShrink: 0 }} />
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>사이트 채팅</h2>
          {bc ? <span style={{ fontSize: "18px", fontWeight: 700, color: C.soft, whiteSpace: "nowrap" }}>접속 {counts.site != null ? `${counts.site.toLocaleString("ko-KR")}명` : "-"}</span> : null}
          {sizeBtn("가-", "사이트 채팅 글자 작게", () => changeSize(-1), sizeIdx === 0, "15px")}
          {sizeBtn("가+", "사이트 채팅 글자 크게", () => changeSize(1), sizeIdx === SIZES.length - 1, "18px")}
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
            <div style={{ padding: "24px", textAlign: "center", color: C.mute, fontSize: "18px" }}>{loaded ? "지금 켜진 방송이 없어요." : "불러오는 중…"}</div>
          ) : list.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: C.mute, fontSize: "18px" }}>아직 글이 없어요. 손님이 쓰면 바로 나와요.</div>
          ) : list.map((m) => {
            const b = m.badge ? BADGE[m.badge] : null;
            const avatar = m.badge === "bot" ? "/ruru-ai-avatar.png" : m.avatar;
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "6px 0" }}>
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" referrerPolicy="no-referrer" style={{ width: "1.6em", height: "1.6em", borderRadius: "9999px", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <span aria-hidden="true" style={{ width: "1.6em", height: "1.6em", borderRadius: "9999px", background: "#3A3A3A", color: C.soft, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.75em", fontWeight: 700, flexShrink: 0 }}>{Array.from(m.nickname)[0] || "?"}</span>
                )}
                <div style={{ minWidth: 0, flex: 1, wordBreak: "break-word", color: C.ink }}>
                  <span style={{ fontWeight: 700, color: C.soft, marginRight: "6px" }}>{m.nickname}</span>
                  {b ? <span style={{ display: "inline-flex", alignItems: "center", height: "1.25em", padding: "0 0.4em", marginRight: "6px", borderRadius: "6px", background: b.bg, color: b.fg, fontSize: "0.7em", fontWeight: 800, verticalAlign: "0.12em" }}>{b.label}</span> : null}
                  <ChatBodyView body={m.body} emojis={emojiMap} />
                </div>
              </div>
            );
          })}
        </div>
        {!atBottom ? (
          <button type="button" onClick={() => { const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight; stick.current = true; setAtBottom(true); }}
            style={{ position: "absolute", left: "50%", bottom: "12px", transform: "translateX(-50%)", height: "44px", padding: "0 18px", border: "none", borderRadius: "9999px", background: "#F1F1F1", color: "#0F0F0F", fontSize: "16px", fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
            새 글 보기 ↓
          </button>
        ) : null}
      </section>
      ) : null}
      </div>
    </div>
  );
}
