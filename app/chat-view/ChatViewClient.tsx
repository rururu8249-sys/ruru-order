"use client";
// 유튜브 기본 탭 · 사이트 새 글 두 개 미리보기 · 확인하면 알림 해제.
// 탭을 숨겨도 유튜브 iframe을 유지해 재연결 없이 전환한다.
//   지금 켜진 방송을 저절로 찾음(1분마다 다시 확인 — 새 방송이 켜지면 그 방송으로).
//   사이트 채팅 = /api/live-chat (처음 한 번) + 소식(ruru-live chat)으로 새 글. 이모티콘 그림·왕관·AI 표시 그대로.
//   화면 꺼짐 방지(되는 브라우저만). 글자 크기 이 기기에만 기억.
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useChatAutoScroll } from "@/lib/useChatAutoScroll";
import { useLiveChatPrivate } from "@/lib/useLiveChatPrivate";
import { supabase } from "@/lib/supabase";
import { subscribeLiveEvents } from "@/lib/liveEvents";
import { mergeChat, parseChatMessage, type LiveChatMessage } from "@/lib/liveChat";
import { youtubeVideoIdFromUrl } from "@/lib/liveWatch";
import type { ChatEmoji } from "@/lib/liveChatEmoji";
import { ChatBodyView, emojiMapOf } from "@/components/customer/ChatBodyView";
import { CHAT_FONT_SIZES as SIZES, CHAT_YT_SCALES as YT_SCALES, CHAT_FONT_KEY as SIZE_KEY, CHAT_YT_SCALE_KEY as YT_SIZE_KEY, readChatViewSizeIndex } from "@/lib/chatViewSize";

import {createChatViewUnread, reduceChatViewUnread} from "@/lib/chatViewUnread";
import {ChatViewNotice} from "./ChatViewNotice";
import "./chat-view.css";
import {includeChatViewMessage} from "@/lib/chatViewFilter";
import { AUTO_TEST_AVATAR } from "@/lib/autoTestOrder";

type Bc = { id: string; title: string; videoId: string; paused: boolean };

const BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  crown: { label: "관리자", bg: "rgba(255,212,59,0.18)", fg: "#FFD43B" },
  crown_pink: { label: "관리자", bg: "rgba(247,131,172,0.2)", fg: "#F783AC" },
  mod: { label: "R", bg: "#3A3A3A", fg: "#F1F1F1" },
  bot: { label: "AI", bg: "rgba(62,166,255,0.2)", fg: "#74C0FC" },
};
// [16:11 사장님] 어두운 화면(눈 덜 피곤) — 유튜브 어두운 채팅과 같은 색
const C = { page: "#000000", panel: "#0F0F0F", line: "#2A2A2A", btn: "#1F1F1F", ink: "#F1F1F1", soft: "#AAAAAA", mute: "#8A8A8A" };
// 유튜브 확대 배율과 사이트 글자 크기는 각각 이 기기에만 기억.

export default function ChatViewClient() {
  const [bc, setBc] = useState<Bc | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [list, setList] = useState<LiveChatMessage[]>([]);
  const visibleList = useMemo(()=>list.filter(includeChatViewMessage),[list]);
  const privateChat = useLiveChatPrivate(bc?.id || "", Boolean(bc), visibleList);
  const displayMessages = useMemo(()=>privateChat.displayMessages.filter(includeChatViewMessage),[privateChat.displayMessages]);
  const [emojis, setEmojis] = useState<ChatEmoji[]>([]);
  const [sizeIdx, setSizeIdx] = useState(SIZES.indexOf(20));
  const [ytSizeIdx, setYtSizeIdx] = useState(YT_SCALES.indexOf(1.5));
  const [tab, setTab] = useState<"yt" | "site">("yt");
  const tabRef = useRef<"yt" | "site">("yt");
  const [unread, dispatchUnread] = useReducer(reduceChatViewUnread, "", createChatViewUnread);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [screenError, setScreenError] = useState("");
  // [07:18 사장님] 유튜브 시청자 수·사이트 접속 수 — 각 칸 제목 옆(30초마다)
  const [counts, setCounts] = useState<{ yt: number | null; site: number | null; test: number | null }>({ yt: null, site: null, test: null });
  const emojiMap = useMemo(() => emojiMapOf(emojis), [emojis]);
  const { boxRef, contentRef, atBottom, followLatest } = useChatAutoScroll(displayMessages, `${sizeIdx}:${tab}`, tab === "site");
  const [recent, setRecent] = useState<Array<{ id: number; at: number }>>([]);
  const seen = useRef<{ bc: string; maxId: number } | null>(null);

  // 글자 크기(이 기기에만)
  useEffect(() => {
    const screen = window.matchMedia("(max-height: 650px) and (orientation: landscape)");
    const applySizes = () => {
      const compact = screen.matches;
      try {
        setSizeIdx(readChatViewSizeIndex(window.localStorage, "site", compact));
        setYtSizeIdx(readChatViewSizeIndex(window.localStorage, "yt", compact));
      } catch { setSizeIdx(SIZES.indexOf(compact ? 16 : 20)); setYtSizeIdx(YT_SCALES.indexOf(compact ? 1 : 1.5)); }
    };
    screen.addEventListener("change", applySizes);
    const t = window.setTimeout(() => {
      applySizes();
    }, 0);
    return () => { window.clearTimeout(t); screen.removeEventListener("change", applySizes); };
  }, []);
  const changeYtSize = (d: number) => setYtSizeIdx((v) => { const n = Math.min(YT_SCALES.length - 1, Math.max(0, v + d)); try { window.localStorage.setItem(YT_SIZE_KEY, String(YT_SCALES[n])); } catch { /* 무시 */ } return n; });
  const changeSize = (d: number) => setSizeIdx((v) => { const n = Math.min(SIZES.length - 1, Math.max(0, v + d)); try { window.localStorage.setItem(SIZE_KEY, String(SIZES[n])); } catch { /* 무시 */ } return n; });

  useEffect(() => {
    setFullscreenAvailable(Boolean(document.fullscreenEnabled));
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  const toggleFullscreen = async () => {
    setScreenError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setScreenError("전체화면을 열 수 없어요. 브라우저의 전체화면 기능을 이용해 주세요."); }
  };

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
  // [2026-11-13 사장님] 유튜브 새 글 확인(20초마다 유튜브 API 5점) 폐지 — 사이트 새 글 알림만 남김.
  useEffect(() => {
    setList([]);
    dispatchUnread({type:"reset",bc:bcId});
    followLatest();
    if (!bcId) return;
    let alive = true;
    let loading = false;
    const changedDuringLoad = new Map<number, LiveChatMessage>();
    const load = async () => {
      if (loading) return;
      loading = true; changedDuringLoad.clear();
      try {
        const j = await fetch(`/api/live-chat?bc=${encodeURIComponent(bcId)}`, { cache: "no-store" }).then((r) => r.json());
        if (!alive || !j?.ok) return;
        const snapshot = (j.messages || []).map(parseChatMessage).filter((m:LiveChatMessage|null) => m?.broadcastId === bcId) as LiveChatMessage[];
        const reconciled = mergeChat(snapshot, [...changedDuringLoad.values()], 200);
        setList(reconciled);
        dispatchUnread({type:"snapshot",bc:bcId,messages:reconciled.map(m=>includeChatViewMessage(m)?m:{...m,hidden:true}),read:tabRef.current === "site" && document.visibilityState === "visible"});
      } catch { /* 다음에 */ } finally { loading = false; }
    };
    const loadEmojis = () => fetch("/api/live-chat/emoji", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive && j?.ok) setEmojis(Array.isArray(j.items) ? j.items : []); }).catch(() => {});
    void load();
    loadEmojis();
    const off = subscribeLiveEvents(supabase, {
      onChat: (payload) => {
        const m = parseChatMessage(payload);
        if (!alive || !m || m.broadcastId !== bcId) return;
        if (loading) changedDuringLoad.set(m.id,m);
        dispatchUnread({type:"event",bc:bcId,messages:[includeChatViewMessage(m)?m:{...m,hidden:true}],read:tabRef.current === "site" && document.visibilityState === "visible"});
        privateChat.onPublicMessage(m);
        setList((prev) => (m.hidden ? prev.filter((x) => x.id !== m.id) : mergeChat(prev, [m], 200)));
      },
    });
    // 소식이 끊겨도 1분마다 맞춤 · 이모티콘 5분마다
    const t1 = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000);
    const t2 = window.setInterval(loadEmojis, 300000);
    return () => { alive = false; off(); window.clearInterval(t1); window.clearInterval(t2); };
  }, [bcId]);

  useEffect(() => {
    setCounts({ yt: null, site: null, test: null });
    if (!bcId) return;
    let alive = true;
    const load = () => fetch(`/api/live-viewers?bc=${encodeURIComponent(bcId)}`).then((r) => r.json()).then((j) => {
      if (!alive || !j?.ok) return;
      const n = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
      setCounts({ yt: n(j.viewers), site: n(j.site), test: n(j.test?.site) });
    }).catch(() => {});
    load();
    const t = window.setInterval(load, 30000);
    return () => { alive = false; window.clearInterval(t); };
  }, [bcId]);

  // 최근에 도착한 글 중 최대 3개만 15초 강조. 재조회·수정으로 같은 글을 다시 깜박이지 않는다.
  useEffect(() => {
    if (!bcId || list.length === 0) { seen.current = null; setRecent([]); return; }
    const now = Date.now();
    const previous = seen.current?.bc === bcId ? seen.current.maxId : null;
    const fresh = list.filter((m) => previous == null
      ? now - Date.parse(m.createdAt) >= 0 && now - Date.parse(m.createdAt) < 15000
      : m.id > previous);
    seen.current = { bc: bcId, maxId: Math.max(previous ?? 0, ...list.map((m) => m.id)) };
    setRecent((prev) => [...(previous == null ? [] : prev).filter((r) => now - r.at < 15000 && list.some((m) => m.id === r.id)),
      ...fresh.map((m) => ({ id: m.id, at: now }))].slice(-3));
  }, [list, bcId]);
  useEffect(() => {
    if (!recent.length) return;
    const t = window.setTimeout(() => setRecent((prev) => prev.filter((r) => Date.now() - r.at < 15000)),
      Math.max(1, Math.min(...recent.map((r) => r.at + 15000)) - Date.now()));
    return () => window.clearTimeout(t);
  }, [recent]);

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
  const unreadMessages = unread.bc === bcId ? [...unread.unread.values()] : [];
  const openTab = (next: "yt" | "site") => {
    tabRef.current = next; setTab(next);
    if (next === "site") { dispatchUnread({type:"read",bc:bcId}); followLatest(); }
  };
  useEffect(() => {
    const readVisible = () => { if(document.visibilityState === "visible" && tabRef.current === "site") dispatchUnread({type:"read",bc:bcId}); };
    document.addEventListener("visibilitychange",readVisible);
    return () => document.removeEventListener("visibilitychange",readVisible);
  },[bcId]);

  const sizeBtn = (label: string, aria: string, onClick: () => void, disabled: boolean, fs: string) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={aria}
      style={{ width: "44px", height: "44px", border: `1px solid ${C.line}`, borderRadius: "8px", background: C.btn, color: disabled ? C.mute : C.ink, fontSize: fs, fontWeight: 700, opacity: disabled ? 0.45 : 1, flexShrink: 0 }}>{label}</button>
  );
  const sizeInput = (label: string, percent: number, min: number, max: number, change: (delta: number) => void, title: string) => (
    <label className="ruru-chat-percent" title={title}>
      <input key={`${label}:${percent}`} type="number" inputMode="numeric" min={min} max={max} step={1}
        aria-label={label} defaultValue={percent}
        onBlur={(e) => {
          const value = e.currentTarget.valueAsNumber;
          const next = Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : percent;
          e.currentTarget.value = String(next);
          if (next !== percent) change(next - percent);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.currentTarget.value = String(percent); e.currentTarget.blur(); }
          else if (e.key === "Enter") e.currentTarget.blur();
        }} />
      <span aria-hidden="true">%</span>
    </label>
  );

  return (
    <div className="ruru-chat-view" style={{ position: "fixed", inset: 0, background: C.page, color: C.ink, display: "flex", flexDirection: "column", fontFamily: 'Arial, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif', colorScheme: "dark" }}>


      <div className="ruru-chat-toolbar">
        <div className="ruru-chat-brand">
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 750 }}>방송 채팅</h1>
          <span style={{ fontSize: 12, color: bc && !bc.paused ? "#A5D8FF" : C.soft }}>{!loaded ? "연결 중" : !bc ? "방송 대기" : bc.paused ? "방송 쉬는 중" : "방송 중"}</span>
        </div>
        {fullscreenAvailable ? <button type="button" className="ruru-chat-control" onClick={() => void toggleFullscreen()}>{fullscreen ? "전체화면 해제" : "전체화면"}</button> : null}
        <button type="button" className="ruru-chat-control" onClick={() => window.location.reload()} aria-label="채팅 화면 새로고침">새로고침</button>
      </div>
      {screenError ? <div role="status" style={{ padding: "8px 12px", fontSize: 14 }}>{screenError}</div> : null}

      <div role="tablist" aria-label="채팅 선택" className="ruru-chat-tabs">
        {([["yt","유튜브 채팅"],["site","사이트 채팅"]] as const).map(([key,label])=><button key={key} type="button" role="tab" id={`chat-tab-${key}`} aria-controls={`chat-panel-${key}`} aria-selected={tab===key} onClick={()=>openTab(key)}>{label}{key==="site"&&unreadMessages.length>0&&<span className="ruru-chat-unread-badge" aria-label={`새 글 ${unreadMessages.length}개`}>{Math.min(99,unreadMessages.length)}{unreadMessages.length>99?"+":""}</span>}</button>)}
      </div>
      <div className="ruru-chat-grid one" style={{ flex: 1, minHeight: 0, display: "grid", padding: "8px", boxSizing: "border-box" }}>
      {/* 유튜브 채팅 */}
      {/* [2026-11-12 사장님 「사이트 채팅 보다 유튜브로 오면 글이 안 뜨거나 늦게 뜸」] 예전엔 display:none 으로 숨겨
          브라우저가 유튜브 채팅 갱신·자동 스크롤을 멈췄다 → 늘 켜 둔 채 아래 깔고, 사이트 채팅 창이 위를 덮는다. */}
      <section id="chat-panel-yt" role="tabpanel" aria-labelledby="chat-tab-yt" className="ruru-chat-panel" aria-hidden={tab!=="yt"} inert={tab!=="yt"} style={{ display:"flex", gridArea:"1 / 1", borderTop: "3px solid #FF5555" }}>
        <header className="ruru-chat-panel-head">
          <div className="ruru-chat-panel-title">
            <h2>유튜브 채팅</h2>
            <div className="ruru-chat-panel-meta">시청자 {bc && counts.yt != null ? `${counts.yt.toLocaleString("ko-KR")}명` : "—"}</div>
          </div>
          <div className="ruru-chat-size">
            {sizeBtn("가−", "유튜브 채팅 글자 작게", () => changeYtSize(-1), ytSizeIdx === 0, "15px")}
            {sizeInput("유튜브 확대 배율", Math.round(ytScale * 100), 80, 200, changeYtSize, "1%씩 조절 · 숫자 입력 후 Enter 또는 바깥 누르기")}
            {sizeBtn("가+", "유튜브 채팅 글자 크게", () => changeYtSize(1), ytSizeIdx === YT_SCALES.length - 1, "18px")}
          </div>
        </header>
        <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: "#0F0F0F" }}>
      {tab === "yt" && <ChatViewNotice messages={unreadMessages} emojis={emojiMap} onOpen={()=>openTab("site")}/>}
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

      {/* 사이트 채팅 */}
      <section id="chat-panel-site" role="tabpanel" aria-labelledby="chat-tab-site" className="ruru-chat-panel" hidden={tab!=="site"} style={{ display:tab==="site"?"flex":"none", gridArea:"1 / 1", zIndex:1, borderTop: "3px solid #74C0FC" }}>
        <header className="ruru-chat-panel-head">
          <div className="ruru-chat-panel-title">
            <h2>사이트 채팅</h2>
            {!privateChat.canReviewDeleted ? <button type="button" onClick={privateChat.verify} style={{ border: 0, background: "transparent", color: C.soft, fontSize: 12 }}>관리자 본인 확인</button> : <span style={{ color: C.soft, fontSize: 12 }}>삭제글 확인 중</span>}
            <div className="ruru-chat-panel-meta">접속 {bc && counts.site != null ? `${counts.site.toLocaleString("ko-KR")}명` : "—"}</div>
          </div>
          <div className="ruru-chat-size">
            {sizeBtn("가−", "사이트 채팅 글자 작게", () => changeSize(-1), sizeIdx === 0, "15px")}
            {sizeInput("사이트 글자 크기", Math.round(fontPx * 5), 60, 170, changeSize, `100% = 20px · 현재 ${fontPx}px · 1%씩 조절`)}
            {sizeBtn("가+", "사이트 채팅 글자 크게", () => changeSize(1), sizeIdx === SIZES.length - 1, "18px")}
          </div>
        </header>
        <div style={{flex:1,minHeight:0,position:"relative",display:"flex",flexDirection:"column"}}>
        <div
          ref={boxRef}
          role="log"
          className="ruru-chat-log"
          aria-live="polite"
          aria-label="사이트 채팅"
          tabIndex={0}
          style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowAnchor: "none", padding: "8px 12px", fontSize: `${fontPx}px`, lineHeight: "var(--chat-line-height, 1.6)" }}
        >
          <div ref={contentRef}>
          {!bc ? (
            <div style={{ padding: "24px", textAlign: "center", color: C.mute, fontSize: "18px" }}>{loaded ? "지금 켜진 방송이 없어요." : "불러오는 중…"}</div>
          ) : displayMessages.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: C.mute, fontSize: "18px" }}>아직 글이 없어요. 손님이 쓰면 바로 나와요.</div>
          ) : displayMessages.map((m) => {
            const isNew = !m.deletedByAuthor && !m.privateCommand && recent.some((r) => r.id === m.id);
            const b = m.badge ? BADGE[m.badge] : null;
            const avatar = m.badge === "bot" ? "/ruru-ai-avatar.png" : m.avatar === AUTO_TEST_AVATAR ? "" : m.avatar;
            return (
              <div key={m.id} data-chat-id={m.id} className={`ruru-chat-row${isNew ? " ruru-chat-new" : ""}`} style={{ display: "flex", alignItems: "flex-start", gap: "var(--chat-row-gap, 10px)", padding: "var(--chat-row-padding, 7px 8px)" }}>
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" referrerPolicy="no-referrer" style={{ width: "1.6em", height: "1.6em", borderRadius: "9999px", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <span aria-hidden="true" style={{ width: "1.6em", height: "1.6em", borderRadius: "9999px", background: "#3A3A3A", color: C.soft, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.75em", fontWeight: 700, flexShrink: 0 }}>{(Array.from(m.nickname)[0] || "?").toUpperCase()}</span>
                )}
                <div style={{ minWidth: 0, flex: 1, wordBreak: "break-word", color: C.ink, opacity: m.deletedByAuthor ? 0.55 : 1 }}>
                  {m.deletedByAuthor ? <span style={{ display: "block", fontSize: "0.7em" }}>작성자가 삭제한 글 · 관리자에게만 표시</span> : null}
                  {m.privateCommand ? <span style={{ display: "block", fontSize: "0.7em", color: "#a8c7fa" }}>나만 보이는 명령어</span> : null}
                  <span style={{ fontWeight: 700, color: "#C2C2C2", marginRight: "8px" }}>{m.nickname}</span>
                  {b ? <span style={{ display: "inline-flex", alignItems: "center", height: "1.25em", padding: "0 0.4em", marginRight: "6px", borderRadius: "6px", background: b.bg, color: b.fg, fontSize: "0.7em", fontWeight: 800, verticalAlign: "0.12em" }}>{b.label}</span> : null}
                  {isNew ? <span aria-label="새 글" style={{ display: "inline-block", marginRight: "6px", padding: "1px 5px", borderRadius: "4px", background: "rgba(116,192,252,.14)", color: "#A5D8FF", fontSize: "0.6em", fontWeight: 700, verticalAlign: "0.15em", letterSpacing: ".04em" }}>NEW</span> : null}
                  <ChatBodyView body={m.body} emojis={emojiMap} />
                </div>
              </div>
            );
          })}
          </div>
        </div>
        </div>
        <div className="ruru-chat-status">
          <span style={{ color: atBottom ? "#A5D8FF" : "#FFD43B" }}>{atBottom ? "● 최신 글 따라가는 중" : "지난 글 읽는 중"}</span>
          <span>새 글 최대 3개 강조</span>
        </div>
        {!atBottom ? (
          <button type="button" onClick={followLatest}
            style={{ position: "absolute", left: "50%", bottom: "48px", transform: "translateX(-50%)", height: "44px", padding: "0 18px", border: "none", borderRadius: "9999px", background: "#F1F1F1", color: "#0F0F0F", fontSize: "16px", fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
            새 글 보기 ↓
          </button>
        ) : null}
      </section>
      </div>
    </div>
  );
}
