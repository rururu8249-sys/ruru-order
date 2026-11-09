"use client";
// [2026-11-09] 「방송 보며 주문」 ②단계 화면 — 주문서 위에 덮는 방송 화면(손님용).
//   참고: 오늘만셀러(onmlive)·모루라이브 — 세로 영상 꽉 차게, 아래에 «지금 소개 중» 상품 카드,
//   맨 아래 줄 [상품 목록][주문서 확인], 「OO님 주문했어요」 알림.
//   이 화면은 «보여 주기·고르기»만 한다. 담기·장바구니·주문서·결제는 부모(주문 페이지)의 기존 함수가 그대로 처리한다.
//   z-index 60: 아래 메뉴(40)·장바구니 바(39) 위, 옵션 창·주문서 창(100) 아래 → 옵션 창이 방송 위로 올라온다.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  LIVE_WATCH_GUIDE_SEEN_KEY,
  liveWatchList,
  youtubeCommand,
  youtubeEmbedUrl,
  type LiveWatchItem,
} from "@/lib/liveWatch";
import { LIVE_CHAT_MAX_LEN, type LiveChatMessage, type LiveChatPenalty } from "@/lib/liveChat";

export type LiveWatchPinned = {
  productId: string;
  detailName: string;
  name: string;
  imageUrl: string;
  priceText: string;
  soldOut: boolean;
  /** 세부상품을 아직 안 고른 브랜드 묶음 — 버튼 「상품 선택」 */
  brand?: boolean;
};

export type LiveWatchOrderToast = { key: string; nickname: string };

type Props = {
  videoId: string;
  title: string;
  paused: boolean;
  pausedText: string;
  pinned: LiveWatchPinned | null;
  items: LiveWatchItem[];
  cartCount: number;
  cartTotalText: string;
  orderToasts: LiveWatchOrderToast[];
  onOpenProduct: (productId: string, detailName?: string) => void;
  onOpenCart: () => void;
  onSwitchToShop: () => void;
  /** 처음 쓰는 법 창이 열렸는지 — 다른 안내 팝업이 그동안 기다리게 */
  onGuideOpenChange?: (open: boolean) => void;
  /** 오른쪽 세로 메뉴(공지·주문내역·내정보·문의) — 주문서 아래 메뉴와 같은 동작 */
  menu?: { key: string; label: string; badge?: number; onClick: () => void }[];
  /** [2026-11-10 ③] 사이트 채팅 — 없으면(꺼짐) 채팅 줄·입력 안 보임 */
  chat?: {
    messages: LiveChatMessage[];
    notice: string;
    /** 로그인(카카오)·닉네임 있는 손님만 쓰기 */
    canWrite: boolean;
    /** 관리자(시험 계정·허용 번호) — 글을 길게 누르면 지우기·금지 */
    canModerate: boolean;
    onSend: (body: string) => Promise<{ ok: boolean; message?: string }>;
    onModerate: (messageId: number, action: LiveChatPenalty) => Promise<{ ok: boolean; message?: string }>;
  } | null;
};

const SHEET_Z = 70;

function readGuideSeen(): boolean {
  try { return window.localStorage.getItem(LIVE_WATCH_GUIDE_SEEN_KEY) === "1"; } catch { return true; }
}
function writeGuideSeen() {
  try { window.localStorage.setItem(LIVE_WATCH_GUIDE_SEEN_KEY, "1"); } catch { /* 저장 못 해도 화면은 그대로 */ }
}

const IconGridDark = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
);
const TOP_ICON_BTN = { width: "44px", height: "44px", padding: 0, border: "none", background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" } as const;
const IconSoundOff = () => (
  <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9l6 6M22 9l-6 6" /></svg>
);
const IconChat = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8"><path d="M4 5h16v11H9l-5 4z" /></svg>
);
const IconSoundOn = () => (
  <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 010 6" /><path d="M19 6a8 8 0 010 12" /></svg>
);
const MenuIcon = ({ k }: { k: string }) => {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "#FFFFFF", strokeWidth: 1.8 } as const;
  if (k === "notice") return <svg aria-hidden="true" {...p}><rect x="3" y="5" width="18" height="14" rx="1" /><path d="M3 7l9 6 9-6" /></svg>;
  if (k === "orders") return <svg aria-hidden="true" {...p}><path d="M12 3l8 4v10l-8 4-8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></svg>;
  if (k === "chatview") return <svg aria-hidden="true" {...p}><path d="M3 6h10M8 6v13M13 11h8M17 11v8" /></svg>;
  if (k === "install") return <svg aria-hidden="true" {...p}><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M12 7v7M9 11l3 3 3-3" /></svg>;
  if (k === "share") return <svg aria-hidden="true" {...p}><path d="M14 5v4C7 10 4 14 3 20c2.5-3.5 6-5 11-5v4l7-7z" /></svg>;
  if (k === "guide") return <svg aria-hidden="true" {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.2-1.5 2.3" /><path d="M12 17h.01" /></svg>;
  if (k === "close") return <svg aria-hidden="true" {...p}><path d="M5 15l7-7 7 7" /></svg>;
  if (k === "inquiry") return <svg aria-hidden="true" {...p}><path d="M4 5h16v11H9l-5 4z" /></svg>;
  return <svg aria-hidden="true" {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>;
};
// 닉네임마다 다른 색(같은 사람은 늘 같은 색) — 어두운 영상 위에서 잘 보이는 밝은 색만
const NICK_COLORS = ["#FFD43B", "#8CE99A", "#74C0FC", "#FFA8C5", "#B197FC", "#FFA94D", "#63E6BE", "#FF8787", "#C0EB75", "#99E9F2"];
function nicknameColor(nick: string): string {
  let h = 0;
  for (const ch of String(nick || "")) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return NICK_COLORS[h % NICK_COLORS.length];
}
const IconClose = ({ color = "#111111" }: { color?: string }) => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
);

// 채팅 설정(이 폰에만 기억) — 글자 크기·굵게·채팅창 높이
type ChatView = { size: "base" | "mid" | "big"; bold: boolean; height: "base" | "low" | "high" };
const CHAT_VIEW_KEY = "ruru_live_chat_view_v1";
const CHAT_VIEW_DEFAULT: ChatView = { size: "base", bold: false, height: "base" };
const CHAT_SIZES: Record<ChatView["size"], string> = { base: "14px", mid: "16px", big: "18px" };
const CHAT_HEIGHTS: Record<ChatView["height"], string> = { base: "24dvh", low: "14dvh", high: "36dvh" };
function readChatView(): ChatView {
  try {
    const o = JSON.parse(window.localStorage.getItem(CHAT_VIEW_KEY) || "{}") as Partial<ChatView>;
    return {
      size: o.size === "mid" || o.size === "big" ? o.size : "base",
      bold: o.bold === true,
      height: o.height === "low" || o.height === "high" ? o.height : "base",
    };
  } catch { return CHAT_VIEW_DEFAULT; }
}

// 맨 아래 동그란 버튼(그림 + 아래 글자) — 오늘만셀러처럼
function BarBtn(props: { label: string; badge?: number; badgeRed?: boolean; onClick: () => void; children: ReactNode }) {
  const n = props.badge || 0;
  return (
    <button type="button" onClick={props.onClick} aria-label={n > 0 ? `${props.label} ${n}개` : props.label} style={{ flexShrink: 0, width: "44px", padding: 0, border: "none", background: "transparent", color: "#FFFFFF", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", cursor: "pointer" }}>
      <span style={{ position: "relative", width: "40px", height: "40px", borderRadius: "9999px", background: "rgba(255,255,255,0.14)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {props.children}
        {n > 0 ? (
          <span aria-hidden="true" style={{ position: "absolute", top: "-6px", right: "-8px", minWidth: "20px", height: "20px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9999px", background: props.badgeRed ? "#D30005" : "#FFFFFF", color: props.badgeRed ? "#FFFFFF" : "#111111", fontSize: "13px", fontWeight: 700, lineHeight: "20px", textAlign: "center" }}>{n > 99 ? "99+" : n}</span>
        ) : null}
      </span>
      <span style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1 }}>{props.label}</span>
    </button>
  );
}

export default function LiveWatchView(props: Props) {
  const { videoId, title, paused, pausedText, pinned, items, cartCount, cartTotalText, orderToasts } = props;
  const noticeBadge = props.menu?.find((m) => m.key === "notice")?.badge || 0;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  // 영상을 누르면 유튜브 막대(돌려보기)가 나온다. 막대가 우리 위·아래 띠·채팅에 안 가리게 영상 칸을 띠 사이에만 둔다.
  const embedSrc = useMemo(() => youtubeEmbedUrl(videoId, typeof window !== "undefined" ? window.location.origin : undefined, { controls: true }), [videoId]);

  useEffect(() => { setGuideOpen(!readGuideSeen()); }, []);
  const onGuideOpenChange = props.onGuideOpenChange;
  useEffect(() => { onGuideOpenChange?.(guideOpen); }, [guideOpen, onGuideOpenChange]);
  // 방송 화면이 떠 있는 동안 뒤 쇼핑몰 화면이 밀려 올라오지 않게(폰에서 꾹 눌러 올리면 아래 메뉴가 튀어나오던 것)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = [html.style.overflow, body.style.overflow, html.style.overscrollBehavior, body.style.overscrollBehavior];
    html.style.overflow = "hidden"; body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none"; body.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prev[0]; body.style.overflow = prev[1];
      html.style.overscrollBehavior = prev[2]; body.style.overscrollBehavior = prev[3];
    };
  }, []);

  // ── 사이트 채팅 ──
  const chat = props.chat ?? null;
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatHint, setChatHint] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const [chatViewOpen, setChatViewOpen] = useState(false);
  const [installHintOpen, setInstallHintOpen] = useState(false);
  const [chatView, setChatView] = useState<ChatView>(CHAT_VIEW_DEFAULT);
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    setChatView(readChatView());
    try { setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true); } catch { /* 무시 */ }
  }, []);
  const updateChatView = (patch: Partial<ChatView>) => {
    setChatView((prev) => {
      const next = { ...prev, ...patch };
      try { window.localStorage.setItem(CHAT_VIEW_KEY, JSON.stringify(next)); } catch { /* 기억 못 해도 지금 화면엔 적용 */ }
      return next;
    });
  };
  // 앱 설치 — 설치 창을 띄울 수 있으면 바로(PWAInstallBanner 가 모아 둔 것), 아니면 방법 안내
  const installApp = async () => {
    const w = window as unknown as { __ruruPwaPrompt?: { prompt: () => void; userChoice: Promise<unknown> } | null };
    const ev = w.__ruruPwaPrompt;
    if (ev) {
      try { ev.prompt(); await ev.userChoice; w.__ruruPwaPrompt = null; return; } catch { /* 아래 안내로 */ }
    }
    setInstallHintOpen(true);
  };
  // 공유 — 폰 공유 창(카톡 등), 안 되면 주소 복사
  const shareLive = async () => {
    const url = `${window.location.origin}/order`;
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === "function") {
      try { await nav.share({ title: "루루동이 라이브", text: `${title || "루루동이 라이브"} 방송 중이에요`, url }); return; } catch { return; }
    }
    try { await navigator.clipboard.writeText(url); setChatHint("주소를 복사했어요. 카톡에 붙여 넣어 보내 주세요."); } catch { setChatHint(url); }
  };
  const [modTarget, setModTarget] = useState<LiveChatMessage | null>(null);
  const [banConfirm, setBanConfirm] = useState(false);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const pressTimer = useRef<number | null>(null);
  const chatCount = chat?.messages.length ?? 0;
  // 지난 글을 올려 보는 중이면 새 글이 와도 끌어내리지 않는다 — 대신 「새 글 보기」
  const [chatAtBottom, setChatAtBottom] = useState(true);
  const chatAtBottomRef = useRef(true);
  const onChatScroll = () => {
    const el = chatBoxRef.current;
    if (!el) return;
    const at = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    chatAtBottomRef.current = at;
    setChatAtBottom(at);
  };
  const chatToBottom = () => {
    const el = chatBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    chatAtBottomRef.current = true;
    setChatAtBottom(true);
  };
  useEffect(() => {
    const el = chatBoxRef.current;
    if (el && chatAtBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [chatCount]);
  useEffect(() => {
    if (!chatHint) return;
    const t = window.setTimeout(() => setChatHint(""), 3000);
    return () => window.clearTimeout(t);
  }, [chatHint]);
  const sendChat = async () => {
    if (!chat || sending) return;
    const body = draft.trim();
    if (!body) return;
    // 누르자마자 창 닫고 글을 바로 띄운다(부모가 먼저 화면에 넣음). 실패하면 글을 되돌려 놓고 안내.
    setSending(true);
    setDraft("");
    setComposeOpen(false);
    const r = await chat.onSend(body).catch(() => ({ ok: false, message: "못 보냈어요. 다시 눌러 주세요." }));
    setSending(false);
    if (!r.ok) { setDraft(body); setChatHint(r.message || "못 보냈어요."); }
  };
  const startPress = (m: LiveChatMessage) => {
    if (!chat?.canModerate) return;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => setModTarget(m), 500);
  };
  const endPress = () => { if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; } };

  // ── 카톡 안 브라우저가 «페이지 스크롤»로 알아듣지 않게 ──
  //   손가락을 끌면 카톡 브라우저가 위 주소창·아래 ←→ 줄을 꺼내며 화면이 줄어들었다(사장님 영상 11/10 02:46).
  //   ①채팅 칸은 브라우저 스크롤 대신 우리가 직접 위아래로 움직인다(touchmove 막고 scrollTop 만 바꿈)
  //   ②그 밖의 방송 화면(위·아래 띠 등)도 끌기는 막는다 — 단 상품 목록처럼 원래 내려 보는 칸(data-live-scroll)은 그대로
  //   ③끌기 시작하면 길게 누르기(관리) 취소 — 올려 보다가 관리 창이 뜨지 않게
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let startY = 0;
    let startTop = 0;
    let inChat: HTMLElement | null = null;
    let moved = false;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startY = t.clientY;
      moved = false;
      const box = chatBoxRef.current;
      inChat = box && e.target instanceof Node && box.contains(e.target) ? box : null;
      startTop = inChat ? inChat.scrollTop : 0;
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - startY;
      if (!moved && Math.abs(dy) > 8) { moved = true; endPress(); }
      if (inChat) {
        inChat.scrollTop = startTop - dy;
        if (e.cancelable) e.preventDefault();
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      if (target && target.closest("[data-live-scroll]")) return;
      if (e.cancelable) e.preventDefault();
    };
    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
    };
  }, []);
  const moderate = async (action: LiveChatPenalty) => {
    if (!chat || !modTarget) return;
    if (action === "ban" && !banConfirm) { setBanConfirm(true); return; }
    const id = modTarget.id;
    setModTarget(null);
    setBanConfirm(false);
    const r = await chat.onModerate(id, action).catch(() => ({ ok: false, message: "처리 못 했어요." }));
    setChatHint(r.message || (r.ok ? "처리했어요." : "처리 못 했어요."));
  };

  // 방송 화면이 떠 있는 동안 뒤 주문서가 같이 스크롤되지 않게
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const sendToPlayer = (cmd: string) => {
    try { iframeRef.current?.contentWindow?.postMessage(cmd, "https://www.youtube.com"); } catch { /* 플레이어 준비 전이면 무시 */ }
  };
  // ── 돌려보다가 「실시간으로 돌아가기」 ──
  //   유튜브 플레이어가 보내 주는 재생 정보(infoDelivery)로 «재생 중인데 지금 방송보다 30초 넘게 뒤»일 때만 버튼을 띄운다.
  //   누르면 영상을 다시 불러 지금 방송으로(가장 확실한 방법). 정보가 안 오면 버튼도 안 뜬다(유튜브 막대의 「라이브」로도 돌아갈 수 있음).
  const [reloadKey, setReloadKey] = useState(0);
  const [behindLive, setBehindLive] = useState(false);
  const playerInfo = useRef<{ t: number; d: number; state: number }>({ t: 0, d: 0, state: -1 });
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!String(e.origin || "").includes("youtube.com")) return;
      let data: { event?: string; info?: Record<string, unknown> } | null = null;
      try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
      if (!data || data.event !== "infoDelivery" || !data.info) return;
      const info = data.info;
      const cur = playerInfo.current;
      if (typeof info.currentTime === "number") cur.t = info.currentTime;
      if (typeof info.duration === "number") cur.d = info.duration;
      if (typeof info.playerState === "number") cur.state = info.playerState;
      // 막대를 움직여 지난 장면을 볼 때만(재생 중·30초 넘게 뒤). 멈춤·오류·끝난 방송엔 안 띄움
      const behind = cur.state === 1 && cur.d > 0 && cur.t > 0 && cur.d - cur.t > 30;
      setBehindLive((prev) => (prev === behind ? prev : behind));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  const listenPlayer = () => {
    // 플레이어에게 «재생 정보 보내 줘» 요청(몇 번 시도 — 준비가 늦을 수 있음)
    [300, 1500, 4000].forEach((ms) => window.setTimeout(() => sendToPlayer(JSON.stringify({ event: "listening", id: 1, channel: "widget" })), ms));
  };
  const backToLive = () => {
    playerInfo.current = { t: 0, d: 0, state: -1 };
    setBehindLive(false);
    setMuted(true);
    setReloadKey((k) => k + 1);
  };

  const turnSoundOn = () => {
    sendToPlayer(youtubeCommand("unMute"));
    sendToPlayer(youtubeCommand("playVideo"));
    setMuted(false);
  };

  const listItems = useMemo(() => liveWatchList(items, query), [items, query]);
  const totalCount = useMemo(() => items.reduce((n, it) => n + (it.count && it.count > 0 ? it.count : 1), 0), [items]);
  const thumbUrl = (pinned?.imageUrl || items.find((it) => it.pinned)?.imageUrl || items.find((it) => it.imageUrl)?.imageUrl || "");
  const latestToast = orderToasts.length > 0 ? orderToasts[orderToasts.length - 1] : null;

  const closeGuide = () => { writeGuideSeen(); setGuideOpen(false); };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="방송 보며 주문"
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "#000000", color: "#FFFFFF", overflow: "hidden", fontFamily: "inherit", overscrollBehavior: "none" }}
    >
      {/* 영상 — 화면 전체 */}
      <iframe
        ref={iframeRef}
        key={`${videoId}-${reloadKey}`}
        onLoad={listenPlayer}
        src={embedSrc}
        title={`${title || "라이브 방송"} 영상`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        style={{ position: "absolute", left: 0, right: 0, top: 0, width: "100%", height: "calc(100% - 84px - env(safe-area-inset-bottom))", border: 0, background: "#000000" }}
      />

      {/* 위 줄 — LIVE·제목 / 방송 화면 닫기(→ 상품 사진으로 보는 화면) */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, padding: "calc(8px + env(safe-area-inset-top)) 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", background: "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0))", pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "28px", padding: "0 10px", borderRadius: "9999px", background: paused ? "#707072" : "#D30005", fontSize: "13px", fontWeight: 700, flexShrink: 0 }}>
            <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "9999px", background: "#FFFFFF" }} />{paused ? "쉬는 중" : "LIVE"}
          </span>
          <span style={{ fontSize: "15px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title || "라이브 방송"}</span>
        </div>
          {/* 오른쪽 위 — 오늘만셀러처럼 그림만: 새로고침 · 소리 · 닫기(X = 상품 사진으로 보는 쇼핑몰 화면) */}
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0, pointerEvents: "auto", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }}>
            {/* 집중모드 — 채팅·버튼을 숨기고 방송만(오늘만셀러 눈 그림) */}
            <button type="button" onClick={() => { const next = !focus; setFocus(next); setChatHint(next ? "집중모드 — 채팅을 숨겼어요. 눈을 다시 누르면 보여요." : "채팅을 다시 보여 드려요."); }} aria-label={focus ? "집중모드 끄기" : "집중모드 켜기"} aria-pressed={focus} style={TOP_ICON_BTN}>
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{focus ? <path d="M4 4l16 16" /> : null}</svg>
            </button>
            <button type="button" onClick={backToLive} aria-label="방송 새로고침" style={TOP_ICON_BTN}>
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11a8 8 0 00-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0014.3 4.9L20 16" /><path d="M20 20v-4h-4" /></svg>
            </button>
            <button type="button" onClick={muted ? turnSoundOn : () => { sendToPlayer(youtubeCommand("mute")); setMuted(true); }} aria-label={muted ? "소리 켜기" : "소리 끄기"} aria-pressed={!muted} style={TOP_ICON_BTN}>
              {muted ? <IconSoundOff /> : <IconSoundOn />}
            </button>
            <button type="button" onClick={props.onSwitchToShop} aria-label="방송 화면 닫기" style={TOP_ICON_BTN}>
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
      </div>


      {/* 돌려보는 중 → 지금 방송으로 */}
      {behindLive ? (
        <button type="button" onClick={backToLive} style={{ position: "absolute", left: "50%", top: "calc(124px + env(safe-area-inset-top))", transform: "translateX(-50%)", height: "44px", padding: "0 16px", border: "none", borderRadius: "9999px", background: "#D30005", color: "#FFFFFF", fontSize: "15px", fontWeight: 700, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap", zIndex: 1 }}>
          <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "9999px", background: "#FFFFFF" }} />실시간 화면으로 돌아가기
        </button>
      ) : null}

      {/* 잠시 쉬는 중 — 주문은 그대로 */}
      {paused ? (
        <div role="status" style={{ position: "absolute", left: "16px", right: "16px", top: "40%", textAlign: "center" }}>
          <span style={{ display: "inline-block", padding: "12px 18px", borderRadius: "12px", background: "rgba(0,0,0,0.6)", fontSize: "15px", fontWeight: 600, lineHeight: 1.5 }}>
            {pausedText}<br /><span style={{ fontSize: "13px", fontWeight: 400, color: "#E5E5E5" }}>상품은 지금도 담을 수 있어요</span>
          </span>
        </div>
      ) : null}

      {/* 아래쪽 — 채팅 · 주문 알림 · 소개 중 상품 카드(돌려보기 중엔 숨김 — 유튜브 막대를 가리지 않게) */}
      <div style={{ display: focus ? "none" : "flex", position: "absolute", left: "16px", right: "16px", bottom: "calc(90px + env(safe-area-inset-bottom))", flexDirection: "column", gap: "8px", pointerEvents: "none" }}>
        {latestToast ? (
          <div role="status" aria-atomic="true" style={{ display: "flex" }}>
            <span key={latestToast.key} className="ruru-live-watch-toast" style={{ display: "inline-flex", alignItems: "center", height: "32px", maxWidth: "100%", padding: "0 12px", borderRadius: "9999px", background: "rgba(0,0,0,0.55)", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {latestToast.nickname}님 구매 감사합니다
            </span>
          </div>
        ) : null}
        {chat && chat.notice ? (
          <div style={{ alignSelf: "flex-start", maxWidth: "100%", padding: "6px 12px", borderRadius: "12px", background: "rgba(0,0,0,0.6)", fontSize: "13px", fontWeight: 600, lineHeight: 1.45 }}>
            <span style={{ color: "#FFD43B", marginRight: "6px" }}>공지</span>{chat.notice}
          </div>
        ) : null}
        {chat && chat.messages.length > 0 ? (
          <div
            ref={chatBoxRef}
            role="log"
            aria-label="채팅"
            aria-live="polite"
            onScroll={onChatScroll}
            style={{ pointerEvents: "none", overscrollBehavior: "contain", maxHeight: CHAT_HEIGHTS[chatView.height], overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "4px", maskImage: "linear-gradient(transparent, #000 24px)", WebkitMaskImage: "linear-gradient(transparent, #000 24px)", paddingTop: "16px", width: "82%" }}
          >
            {chat.messages.map((m) => (
              <div
                key={m.id}
                style={{ pointerEvents: "auto", touchAction: "pan-y", alignSelf: "flex-start", maxWidth: "100%", padding: "4px 10px", borderRadius: "12px", background: "rgba(0,0,0,0.35)", fontSize: CHAT_SIZES[chatView.size], fontWeight: chatView.bold ? 700 : 400, lineHeight: 1.45, wordBreak: "break-word", textShadow: "0 1px 2px rgba(0,0,0,0.6)", userSelect: chat.canModerate ? "none" : "auto", WebkitUserSelect: chat.canModerate ? "none" : "auto" }}
              >
                {/* 채팅 줄은 터치가 그대로 영상(유튜브 막대)으로 지나감. 관리자만 «닉네임»을 길게 누르면 관리 창 */}
                <span
                  onPointerDown={chat.canModerate ? () => startPress(m) : undefined}
                  onPointerUp={chat.canModerate ? endPress : undefined}
                  onPointerLeave={chat.canModerate ? endPress : undefined}
                  onPointerCancel={chat.canModerate ? endPress : undefined}
                  onContextMenu={chat.canModerate ? (e) => { e.preventDefault(); setModTarget(m); } : undefined}
                  style={{ fontWeight: 700, color: nicknameColor(m.nickname), marginRight: "6px" }}
                >{m.nickname}</span>
                <span>{m.body}</span>
              </div>
            ))}
          </div>
        ) : null}
        {chat && chat.messages.length > 0 && !chatAtBottom ? (
          <button type="button" onClick={chatToBottom} style={{ pointerEvents: "auto", alignSelf: "flex-start", height: "32px", padding: "0 12px", border: "none", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "13px", fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
            새 글 보기 ↓
          </button>
        ) : null}
        {pinned ? (
          <div style={{ pointerEvents: "auto", background: "#FFFFFF", color: "#111111", borderRadius: "12px", padding: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
            <button type="button" onClick={() => props.onOpenProduct(pinned.productId, pinned.detailName || undefined)} aria-label={`${pinned.name} 상품 선택`} style={{ width: "64px", height: "64px", flexShrink: 0, padding: 0, border: "none", background: "#F5F5F5", cursor: "pointer", overflow: "hidden" }}>
              {pinned.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pinned.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : null}
            </button>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#D30005" }}>지금 소개 중</span>
              <span style={{ fontSize: "15px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pinned.name}</span>
              <span style={{ fontSize: "15px", fontWeight: 700 }}>{pinned.priceText}</span>
            </div>
            <button type="button" disabled={pinned.soldOut} onClick={() => props.onOpenProduct(pinned.productId, pinned.detailName || undefined)} style={{ flexShrink: 0, height: "44px", padding: "0 16px", border: "none", borderRadius: "9999px", background: pinned.soldOut ? "#E5E5E5" : "#111111", color: pinned.soldOut ? "#707072" : "#FFFFFF", fontSize: "15px", fontWeight: 600, fontFamily: "inherit", cursor: pinned.soldOut ? "default" : "pointer" }}>
              {pinned.soldOut ? "품절" : "상품 선택"}
            </button>
          </div>
        ) : null}
      </div>

      {/* 맨 아래 줄 — 오늘만셀러처럼 [상품 사진(숫자)] [채팅 입력(크게)] [주문서][더보기(새 공지 숫자)] — 공지·공유는 더보기 안 */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "8px 12px calc(8px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", gap: "8px", background: "#000000" }}>
        {/* 오늘만셀러처럼 — 지금 소개 중(없으면 첫) 상품 사진 + 오른쪽 위 숫자(고를 수 있는 상품 수, 세부상품까지) */}
        <button type="button" onClick={() => setListOpen(true)} aria-label={`방송 상품 목록 보기 (${totalCount}개)`} style={{ position: "relative", flexShrink: 0, width: "52px", height: "52px", padding: 0, border: "2px solid #FFFFFF", borderRadius: "12px", background: "#F5F5F5", fontFamily: "inherit", cursor: "pointer" }}>
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "10px" }} />
          ) : (
            <span style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}><IconGridDark /></span>
          )}
          <span aria-hidden="true" style={{ position: "absolute", top: "-8px", right: "-8px", minWidth: "24px", height: "24px", padding: "0 6px", boxSizing: "border-box", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "13px", fontWeight: 700, lineHeight: "24px", textAlign: "center", boxShadow: "0 0 0 1px rgba(0,0,0,0.15)" }}>{totalCount > 999 ? "999+" : totalCount}</span>
        </button>
        {chat && chat.canWrite && !focus ? (
          <button type="button" onClick={() => setComposeOpen(true)} style={{ flex: 1, minWidth: "112px", height: "52px", border: "1.5px solid rgba(255,255,255,0.55)", borderRadius: "9999px", background: "rgba(255,255,255,0.18)", color: "#FFFFFF", fontSize: "16px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", padding: "0 14px", textAlign: "left", whiteSpace: "nowrap", overflow: "hidden" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>채팅 입력</span>
          </button>
        ) : <span style={{ flex: 1 }} />}
        <BarBtn label="주문서" badge={cartCount} badgeRed onClick={props.onOpenCart}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M6 8h12l1 13H5zM9 8V7a3 3 0 016 0v1" stroke="#FFFFFF" strokeWidth="1.6" strokeLinejoin="round" /></svg>
        </BarBtn>
        {focus ? null : (
        <BarBtn label="더보기" badge={noticeBadge} badgeRed onClick={() => setMoreOpen(true)}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="#FFFFFF"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </BarBtn>
        )}
      </div>

      {/* 더보기 — 오늘만셀러처럼 오른쪽 아래에서 위로 펼쳐지는 메뉴 */}
      {moreOpen ? (
        <div role="dialog" aria-modal="true" aria-label="더보기" onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: SHEET_Z, background: "rgba(0,0,0,0.55)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", right: "12px", bottom: "calc(84px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            {[
              ...(props.menu || []).map((m) => ({ key: m.key, label: m.key === "inquiry" ? "문의하기" : m.key === "notice" ? "공지·쪽지" : m.label, onClick: m.onClick, badge: m.key === "notice" ? noticeBadge : 0 })),
              { key: "share", label: "공유하기", onClick: shareLive },
              { key: "chatview", label: "채팅 설정", onClick: () => setChatViewOpen(true) },
              { key: "guide", label: "사용 방법", onClick: () => setGuideOpen(true) },
              ...(standalone ? [] : [{ key: "install", label: "앱 설치", onClick: installApp }]),
            ].map((m) => (
              <button key={m.key} type="button" onClick={() => { setMoreOpen(false); m.onClick(); }} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "52px", padding: "0 4px 0 16px", border: "none", background: "transparent", color: "#FFFFFF", fontSize: "15px", fontWeight: 700, fontFamily: "inherit", cursor: "pointer", textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>
                <span>{m.label}</span>
                {"badge" in m && m.badge ? <span aria-label={`새 글 ${m.badge}개`} style={{ minWidth: "22px", height: "22px", padding: "0 6px", boxSizing: "border-box", borderRadius: "9999px", background: "#D30005", color: "#FFFFFF", fontSize: "13px", fontWeight: 700, lineHeight: "22px", textAlign: "center", textShadow: "none" }}>{m.badge > 99 ? "99+" : m.badge}</span> : null}
                <MenuIcon k={m.key} />
              </button>
            ))}
            <button type="button" onClick={() => setMoreOpen(false)} aria-label="더보기 닫기" style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "52px", padding: "0 4px 0 16px", border: "none", background: "transparent", color: "#FFFFFF", fontSize: "15px", fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
              <span>닫기</span><MenuIcon k="close" />
            </button>
          </div>
        </div>
      ) : null}

      {/* 채팅 설정 — 글자 크기·굵게·채팅창 높이(이 폰에만 기억) */}
      {chatViewOpen ? (
        <div role="dialog" aria-modal="true" aria-label="채팅 설정" onClick={() => setChatViewOpen(false)} style={{ position: "fixed", inset: 0, zIndex: SHEET_Z, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "calc(16px + env(safe-area-inset-top)) 16px 16px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "440px", background: "#FFFFFF", color: "#111111", borderRadius: "16px", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "16px" }}>
              <div>
                <div style={{ fontSize: "20px", fontWeight: 700 }}>채팅 설정</div>
                <div style={{ fontSize: "13px", color: "#707072", marginTop: "4px" }}>방송 중 채팅 글을 보기 편하게 바꿔요.</div>
              </div>
              <button type="button" onClick={() => setChatViewOpen(false)} aria-label="닫기" style={{ width: "40px", height: "40px", border: "none", borderRadius: "9999px", background: "#F5F5F5", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><IconClose /></button>
            </div>
            {([
              ["글자 크기", "size", [["base", "기본"], ["mid", "중간"], ["big", "크게"]]],
              ["채팅창 높이", "height", [["base", "기본"], ["low", "낮게"], ["high", "높게"]]],
            ] as const).map(([label, field, opts]) => (
              <div key={field} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", minHeight: "52px" }}>
                <span style={{ fontSize: "16px", fontWeight: 600 }}>{label}</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {opts.map(([v, t]) => {
                    const on = chatView[field] === v;
                    return (
                      <button key={v} type="button" aria-pressed={on} onClick={() => updateChatView({ [field]: v } as Partial<ChatView>)} style={{ height: "40px", minWidth: "56px", padding: "0 12px", borderRadius: "9999px", border: on ? "2px solid #111111" : "1px solid #E5E5E5", background: "#FFFFFF", color: on ? "#111111" : "#707072", fontSize: "14px", fontWeight: on ? 700 : 500, fontFamily: "inherit", cursor: "pointer" }}>{t}</button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", minHeight: "52px" }}>
              <span style={{ fontSize: "16px", fontWeight: 600 }}>굵게</span>
              <button type="button" role="switch" aria-checked={chatView.bold} aria-label="채팅 글 굵게" onClick={() => updateChatView({ bold: !chatView.bold })} style={{ position: "relative", width: "52px", height: "32px", border: "none", borderRadius: "9999px", background: chatView.bold ? "#111111" : "#E5E5E5", cursor: "pointer", padding: 0 }}>
                <span aria-hidden="true" style={{ position: "absolute", top: "3px", left: chatView.bold ? "23px" : "3px", width: "26px", height: "26px", borderRadius: "9999px", background: "#FFFFFF", transition: "left 0.15s" }} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 앱 설치 안내(설치 창을 못 띄우는 폰) */}
      {installHintOpen ? (
        <div role="dialog" aria-modal="true" aria-label="앱 설치" onClick={() => setInstallHintOpen(false)} style={{ position: "fixed", inset: 0, zIndex: SHEET_Z, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "360px", background: "#FFFFFF", color: "#111111", borderRadius: "16px", padding: "24px 20px 20px" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>휴대폰 홈 화면에 루루동이 추가</div>
            <div style={{ fontSize: "16px", lineHeight: 1.6 }}>
              다음부터 아이콘 한 번 누르면 바로 열려요.<br /><br />
              <b>아이폰</b>: 사파리 아래 <b>공유</b> 버튼 → <b>홈 화면에 추가</b><br />
              <b>안드로이드</b>: 크롬 오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b>
            </div>
            <div style={{ fontSize: "13px", color: "#707072", lineHeight: 1.5, marginTop: "12px" }}>카카오톡 안에서 열었으면, 오른쪽 위 메뉴에서 «다른 브라우저로 열기» 뒤에 해 주세요.</div>
            <button type="button" onClick={() => setInstallHintOpen(false)} style={{ width: "100%", height: "52px", marginTop: "20px", border: "none", borderRadius: "9999px", background: "#111111", color: "#FFFFFF", fontSize: "16px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>확인</button>
          </div>
        </div>
      ) : null}

      {/* 채팅 안내(보냄 실패·금지 등) */}
      {chatHint ? (
        <div role="status" style={{ position: "absolute", left: "16px", right: "16px", bottom: "calc(90px + env(safe-area-inset-bottom))", display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 2 }}>
          <span style={{ padding: "8px 14px", borderRadius: "9999px", background: "#111111", color: "#FFFFFF", fontSize: "14px", fontWeight: 600 }}>{chatHint}</span>
        </div>
      ) : null}

      {/* 채팅 쓰기 줄 */}
      {composeOpen && chat ? (
        <div role="dialog" aria-modal="true" aria-label="채팅 쓰기" onClick={() => setComposeOpen(false)} style={{ position: "fixed", inset: 0, zIndex: SHEET_Z, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "flex-end" }}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); void sendChat(); }}
            style={{ width: "100%", maxWidth: "560px", margin: "0 auto", background: "#FFFFFF", padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", display: "flex", gap: "8px", alignItems: "center", borderRadius: "16px 16px 0 0" }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, LIVE_CHAT_MAX_LEN))}
              placeholder="채팅 입력"
              aria-label="채팅 메시지"
              enterKeyHint="send"
              maxLength={LIVE_CHAT_MAX_LEN}
              style={{ flex: 1, minWidth: 0, height: "48px", padding: "0 16px", border: "1px solid #E5E5E5", borderRadius: "9999px", fontSize: "16px", fontFamily: "inherit", outline: "none", color: "#111111", background: "#FFFFFF" }}
            />
            <button type="submit" disabled={sending || !draft.trim()} style={{ flexShrink: 0, height: "48px", padding: "0 18px", border: "none", borderRadius: "9999px", background: sending || !draft.trim() ? "#E5E5E5" : "#111111", color: sending || !draft.trim() ? "#707072" : "#FFFFFF", fontSize: "15px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
              {sending ? "보내는 중" : "보내기"}
            </button>
          </form>
        </div>
      ) : null}

      {/* 관리자 — 글 길게 누르면 */}
      {modTarget && chat ? (
        <div role="dialog" aria-modal="true" aria-label="채팅 관리" onClick={() => { setModTarget(null); setBanConfirm(false); }} style={{ position: "fixed", inset: 0, zIndex: SHEET_Z + 2, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", margin: "0 auto", background: "#FFFFFF", color: "#111111", borderRadius: "16px 16px 0 0", padding: "16px 16px calc(16px + env(safe-area-inset-bottom))" }}>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>{modTarget.nickname}</div>
            <div style={{ fontSize: "14px", color: "#707072", marginBottom: "12px", wordBreak: "break-word" }}>{modTarget.body}</div>
            {([
              ["hide", "글 지우기"],
              ["mute30s", "지우고 30초 금지"],
              ["mute5m", "지우고 5분 금지"],
              ["ban", banConfirm ? "정말 차단하기 · 사이트에 못 들어와요" : "지우고 사이트 접속 차단"],
            ] as [LiveChatPenalty, string][]).filter(([a]) => !banConfirm || a === "ban").map(([a, label]) => (
              <button key={a} type="button" onClick={() => void moderate(a)} style={{ width: "100%", height: "52px", marginBottom: "8px", border: "1px solid #E5E5E5", borderRadius: "12px", background: "#FFFFFF", color: a === "ban" ? "#D30005" : "#111111", fontSize: "16px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>{label}</button>
            ))}
            <button type="button" onClick={() => { setModTarget(null); setBanConfirm(false); }} style={{ width: "100%", height: "52px", border: "none", borderRadius: "12px", background: "#F5F5F5", color: "#111111", fontSize: "16px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>취소</button>
          </div>
        </div>
      ) : null}

      {/* 상품 목록 창 */}
      {listOpen ? (
        <div role="dialog" aria-modal="true" aria-label="방송 상품" onClick={() => setListOpen(false)} style={{ position: "fixed", inset: 0, zIndex: SHEET_Z, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", margin: "0 auto", height: "72dvh", background: "#FFFFFF", color: "#111111", borderRadius: "16px 16px 0 0", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "8px 8px 8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontSize: "17px", fontWeight: 700 }}>방송 상품</span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#707072" }}>총 {totalCount}개</span>
              </span>
              <button type="button" onClick={() => setListOpen(false)} aria-label="닫기" style={{ width: "44px", height: "44px", border: "none", borderRadius: "9999px", background: "#F5F5F5", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><IconClose /></button>
            </div>
            <div style={{ padding: "0 16px 8px" }}>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="상품명 검색"
                aria-label="방송 상품 찾기"
                style={{ width: "100%", boxSizing: "border-box", height: "48px", padding: "0 16px", border: "1px solid #E5E5E5", borderRadius: "9999px", fontSize: "16px", fontFamily: "inherit", outline: "none", color: "#111111", background: "#FFFFFF" }}
              />
            </div>
            <div data-live-scroll="1" style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "0 16px calc(16px + env(safe-area-inset-bottom))" }}>
              {listItems.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center", fontSize: "15px", color: "#707072" }}>{query ? "찾는 상품이 없어요" : "방송 상품이 아직 없어요"}</div>
              ) : listItems.map((it) => { const no = items.findIndex((x) => x.id === it.id) + 1; return (
                <div key={`${it.id}|${it.detailName || ""}`} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderBottom: "1px solid #E5E5E5" }}>
                  <button type="button" onClick={() => { if (!it.soldOut) { setListOpen(false); props.onOpenProduct(it.id, it.detailName); } }} aria-label={`${no}번 ${it.name} 상품 선택`} style={{ width: "64px", height: "64px", flexShrink: 0, padding: 0, border: "none", background: "#F5F5F5", overflow: "hidden", cursor: it.soldOut ? "default" : "pointer", position: "relative" }}>
                    <span aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, zIndex: 1, minWidth: "22px", height: "20px", padding: "0 5px", boxSizing: "border-box", background: "rgba(0,0,0,0.7)", color: "#FFFFFF", fontSize: "13px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{no}</span>
                    {it.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.imageUrl} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : null}
                  </button>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                    {it.pinned ? <span style={{ fontSize: "13px", fontWeight: 600, color: "#D30005" }}>지금 소개 중</span> : null}
                    <span style={{ fontSize: "15px", fontWeight: 600, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{it.name}</span>
                    <span style={{ fontSize: "15px", fontWeight: 700 }}>{it.priceText}</span>
                  </div>
                  <button type="button" disabled={it.soldOut} onClick={() => { setListOpen(false); props.onOpenProduct(it.id, it.detailName); }} style={{ flexShrink: 0, height: "40px", minWidth: "64px", padding: "0 14px", border: "none", borderRadius: "9999px", background: it.soldOut ? "#E5E5E5" : "#111111", color: it.soldOut ? "#707072" : "#FFFFFF", fontSize: "14px", fontWeight: 600, fontFamily: "inherit", cursor: it.soldOut ? "default" : "pointer" }}>
                    {it.soldOut ? "품절" : "상품 선택"}
                  </button>
                </div>
              ); })}
            </div>
          </div>
        </div>
      ) : null}

      {/* 처음 한 번만 — 쓰는 법 */}
      {guideOpen ? (
        <div role="dialog" aria-modal="true" aria-label="방송 보며 주문하는 법" style={{ position: "fixed", inset: 0, zIndex: SHEET_Z + 1, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ width: "100%", maxWidth: "360px", background: "#FFFFFF", color: "#111111", borderRadius: "16px", padding: "24px 20px 20px" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>방송 보면서 바로 담아요</div>
            {([
              ["1", <>방송에서 마음에 드는 상품이 나오면</>],
              ["2", <>왼쪽 아래 <b>상품 사진(숫자)</b>을 누르면 방송 상품이 다 나와요. 그 상품의 「상품 선택」으로 옵션을 골라 담아요</>],
              ["3", <>담으면 오른쪽 아래 장바구니(숫자)가 생겨요. 눌러서 주문서를 내면 끝</>],
            ] as [string, ReactNode][]).map(([n, t]) => (
              <div key={n} style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
                <span aria-hidden="true" style={{ width: "28px", height: "28px", flexShrink: 0, borderRadius: "9999px", background: "#111111", color: "#FFFFFF", fontSize: "14px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
                <span style={{ fontSize: "16px", lineHeight: 1.5, paddingTop: "2px" }}>{t}</span>
              </div>
            ))}
            <div style={{ fontSize: "13px", color: "#707072", lineHeight: 1.5, margin: "4px 0 16px" }}>소리는 오른쪽 위 스피커, 화면이 멈추면 오른쪽 위 새로고침. ✕ 를 누르면 방송 없이 상품 사진으로 크게 볼 수 있어요.</div>
            <button type="button" onClick={closeGuide} style={{ width: "100%", height: "52px", border: "none", borderRadius: "9999px", background: "#111111", color: "#FFFFFF", fontSize: "16px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>시작하기</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
