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
import { isKakaoInAppBrowser } from "@/lib/youtubeChannelLink";
import { openOrderInExternalBrowser } from "@/components/customer/KakaoExternalOpen";
import { parseBotRef } from "@/lib/liveChatBot";
import { LIVE_CHAT_MAX_LEN, chatColors, type LiveChatAction, type LiveChatMessage, type LiveChatPenalty } from "@/lib/liveChat";
import { EMOJI_MAX_PER_MSG, countEmojiTokens, encodeEmojiTokens, type ChatEmoji } from "@/lib/liveChatEmoji";
import { ChatBodyView, emojiMapOf } from "@/components/customer/ChatBodyView";

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
  /** [2026-11-10] 유튜브 동시 시청자 수(1분마다 갱신) — 없으면 숫자 안 보임 */
  viewers?: number | null;
  /** [07:18·07:28 사장님] 사이트 접속 수(최근 2분) — 유튜브 숫자와 같이 모든 손님에게 */
  siteViewers?: number | null;
  showSiteViewers?: boolean;
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
    /** 고정 댓글(없으면 null) */
    pinned: LiveChatMessage | null;
    /** 총관리자 — 길게 눌러 채팅 관리자 지정·해제 */
    canGrant: boolean;
    /** 왕관 표시 두 사람만 — 길게 눌러 고정 댓글 */
    canPin: boolean;
    onModerate: (messageId: number, action: LiveChatAction) => Promise<{ ok: boolean; message?: string }>;
    /** [2026-11-10] 이모티콘 — 켜진 목록(채팅 그림 그리기용, 누구나) */
    emojis?: ChatEmoji[];
    /** 이 손님이 이모티콘을 쓸 수 있는지(서버 판정) — 아니면 입력칸 웃는 얼굴 표시가 안 보임 */
    canEmoji?: boolean;
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
const IconSmile = ({ color = "#707072", size = 24 }: { color?: string; size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2" /><circle cx="9" cy="10" r="0.6" fill={color} /><circle cx="15" cy="10" r="0.6" fill={color} /></svg>
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
// 닉네임 뒤 표시 — 금색 왕관(총관리자) / 분홍 왕관 / R 동그라미(채팅 관리자). 우리 가게 표시라 직접 그림.
function ChatBadge({ badge }: { badge: LiveChatMessage["badge"] }) {
  if (!badge) return null;
  if (badge === "bot") {
    // 루루동이AI — 손님 글과 헷갈리지 않게 파란 「AI」 표시
    return <span aria-label="루루동이 자동 안내" style={{ display: "inline-flex", alignItems: "center", verticalAlign: "0.1em", margin: "0 4px 0 4px", height: "1.15em", padding: "0 0.35em", borderRadius: "9999px", background: "#3B82F6", color: "#FFFFFF", fontSize: "0.72em", fontWeight: 800, textShadow: "none", lineHeight: 1 }}>AI</span>;
  }
  const st = { display: "inline-block", verticalAlign: "-0.18em", margin: "0 4px 0 2px", width: "1.15em", height: "1.15em", flexShrink: 0 } as const;
  if (badge === "mod") {
    return (
      <svg aria-label="채팅 관리자" role="img" viewBox="0 0 20 20" style={st}>
        <circle cx="10" cy="10" r="9" fill="#E8587A" stroke="#FFFFFF" strokeWidth="1.2" />
        <text x="10" y="14.4" textAnchor="middle" fontSize="12" fontWeight="800" fill="#FFFFFF" fontFamily="sans-serif">R</text>
      </svg>
    );
  }
  const fill = badge === "crown_pink" ? "#FF7EB0" : "#F5C242";
  return (
    <svg aria-label="총관리자" role="img" viewBox="0 0 20 20" style={st}>
      <path d="M2 14.5 L3 5.5 L7 9.5 L10 3.5 L13 9.5 L17 5.5 L18 14.5 Z" fill={fill} stroke="#000000" strokeOpacity="0.35" strokeWidth="0.8" />
      <rect x="2" y="15" width="16" height="2.4" rx="0.6" fill={fill} />
    </svg>
  );
}
// 닉네임 앞 동그란 사진 — 카카오 프로필 사진, 없거나 못 불러오면 닉네임 첫 글자(그 사람 색)
function ChatAvatar({ src, nick, color }: { src: string; nick: string; color: string }) {
  const [broken, setBroken] = useState(false);
  const box = { width: "24px", height: "24px", borderRadius: "9999px", flexShrink: 0, marginTop: "1px", overflow: "hidden" } as const;
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ ...box, objectFit: "cover", display: "block", background: "#333333" }} />;
  }
  const ch = Array.from(String(nick || "").trim())[0] || "?";
  return <span aria-hidden="true" style={{ ...box, display: "inline-flex", alignItems: "center", justifyContent: "center", background: color, color: "#111111", fontSize: "12px", fontWeight: 700, textShadow: "none" }}>{ch}</span>;
}
// 글자를 상자 없이 영상 위에 바로 — 어떤 화면에서도 읽히게 진한 그림자
const CHAT_TEXT_SHADOW = "0 0 2px #000, 0 1px 2px #000, 0 0 6px rgba(0,0,0,0.7)";
const IconClose = ({ color = "#111111" }: { color?: string }) => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
);

// 채팅 설정(이 폰에만 기억) — 글자 크기·굵게·채팅창 높이
type ChatView = { size: "base" | "mid" | "big"; bold: boolean; height: "base" | "low" | "high" };
const CHAT_VIEW_KEY = "ruru_live_chat_view_v1";
const CHAT_VIEW_DEFAULT: ChatView = { size: "base", bold: false, height: "base" };
// [2026-11-10 04:09] 기본 15px — 유튜브 앱 채팅 글자와 비슷하게(사장님 「유튜브랑 비슷하게」)
const CHAT_SIZES: Record<ChatView["size"], string> = { base: "15px", mid: "17px", big: "19px" };
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
  //   [04:47 근본 수정] 예전엔 html·body 글자 칸(style.overflow)에 직접 hidden 을 넣고 닫을 때 «넣기 전 값»으로 되돌렸는데,
  //   접속 차단 확인(CustomerAccessBlockGuard)도 같은 칸을 잠갔다 풀어서 순서가 엇갈리면 닫은 뒤 «hidden»이 되살아나 스크롤이 안 됐다.
  //   이제 칸은 안 건드리고, 방송 화면 안에 넣은 <style> 한 줄로만 잠금 → 방송 화면이 사라지면 잠금도 같이 사라짐.
  // ── 사이트 채팅 ──
  const chat = props.chat ?? null;
  const [composeOpen, setComposeOpen] = useState(false);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  // [04:55 사장님] 채팅 쓰는 중 폰 «뒤로» → 사이트에서 나가지 말고 쓰기 창만 닫고 방송 화면으로.
  //   쓰기 창을 열 때 방문 기록을 하나 쌓아 두고, 뒤로가 오면 그 기록만 지우며 창을 닫음.
  useEffect(() => {
    if (!composeOpen) return;
    try { window.history.pushState({ ...(window.history.state || {}), ruruCompose: 1 }, ""); } catch { return; }
    const onPop = () => setComposeOpen(false);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // 뒤로 말고 다른 방법(보내기·바깥 누르기)으로 닫았으면 쌓아 둔 기록을 치움
      try { if (window.history.state && window.history.state.ruruCompose) window.history.back(); } catch { /* 무시 */ }
    };
  }, [composeOpen]);
  const [draft, setDraft] = useState("");
  // [2026-11-10] 이모티콘 — 입력칸 오른쪽 웃는 얼굴(쓸 수 있는 손님만) → 키보드 자리에 이모티콘 판
  const emojiItems = useMemo(() => chat?.emojis ?? [], [chat?.emojis]);
  const emojiMap = useMemo(() => emojiMapOf(emojiItems), [emojiItems]);
  const canEmoji = Boolean(chat?.canEmoji) && emojiItems.length > 0;
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [composeHint, setComposeHint] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const caretRef = useRef<{ start: number; end: number } | null>(null);
  const draftEmojiCount = canEmoji ? countEmojiTokens(draft, emojiItems) : 0;
  const rememberCaret = (el: HTMLInputElement) => { caretRef.current = { start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length }; };
  const insertEmoji = (e: ChatEmoji) => {
    if (draftEmojiCount >= EMOJI_MAX_PER_MSG) { setComposeHint(`이모티콘은 한 번에 ${EMOJI_MAX_PER_MSG}개까지 보낼 수 있어요.`); return; }
    const token = `:${e.name}:`;
    const c = caretRef.current ?? { start: draft.length, end: draft.length };
    const start = Math.min(c.start, draft.length);
    const end = Math.min(Math.max(c.end, start), draft.length);
    const next = draft.slice(0, start) + token + draft.slice(end);
    if (next.length > LIVE_CHAT_MAX_LEN) { setComposeHint("글이 너무 길어요."); return; }
    setDraft(next);
    caretRef.current = { start: start + token.length, end: start + token.length };
    setComposeHint("");
  };
  const openCompose = (withEmoji: boolean) => { setEmojiOpen(withEmoji && canEmoji); setComposeHint(""); setComposeOpen(true); };
  useEffect(() => { if (!composeHint) return; const t = window.setTimeout(() => setComposeHint(""), 2500); return () => window.clearTimeout(t); }, [composeHint]);
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
    // [2026-11-10 04:09] 카톡 채널에서 연 화면(카톡 안 브라우저)은 앱 설치가 안 됨 → 폰 기본 브라우저(크롬·삼성인터넷·사파리)로 이 화면을 열어 줌.
    //   거기서 다시 「앱 설치」를 누르면 설치 창이 뜬다. (카카오가 제공하는 주소 kakaotalk://web/openExternal)
    if (isKakaoInAppBrowser(navigator.userAgent)) {
      openOrderInExternalBrowser("/order", true); // 로그인 정보 같이 넘김 + 넘어가자마자 「설치하기」 창 → 다시 로그인 안 해도 됨
      return;
    }
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
  const [pinOpen, setPinOpen] = useState(false);
  const [banConfirm, setBanConfirm] = useState(false);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const pressTimer = useRef<number | null>(null);
  const chatCount = chat?.messages.length ?? 0;
  const chatColorMap = useMemo(() => chatColors(chat?.messages ?? []), [chat?.messages]);
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
    closeGreet();
    const r = await chat.onSend(body).catch(() => ({ ok: false, message: "못 보냈어요. 다시 눌러 주세요." }));
    setSending(false);
    if (!r.ok) { setDraft(body); setChatHint(r.message || "못 보냈어요."); }
  };
  // [2026-11-10 04:17 사장님] 화면 빈 곳(영상)을 누르면 «돌려보기 모드» — 채팅·카드가 흐려지고 손가락이 그대로 유튜브 막대로 감.
  //   영상은 유튜브 화면(다른 사이트)이라 누른 걸 직접 못 듣는다 → 누르면 그 화면으로 «포커스»가 넘어가는 순간(창 blur)을 보고 안다.
  //   4초 동안 더 안 누르면 원래대로. 다음 누름도 알아채려고 포커스를 우리 화면으로 바로 돌려 놓는다.
  //   [04:33 보정] 돌려보기 중 한 번 더 빈 곳을 누르면 바로 원래대로(유튜브 앱처럼). 막대를 끌거나 멈춤/재생을 누른 것과 구별하려고
  //   누른 뒤 1.2초 동안 재생 위치·상태가 «건너뛰었는지» 본다 — 건너뛰었으면 막대 조작(돌려보기 유지), 그대로면 빈 곳 누름(원래대로).
  const [seekMode, setSeekMode] = useState(false);
  const seekModeRef = useRef(false);
  const seekPokeRef = useRef<() => void>(() => {});
  useEffect(() => { seekModeRef.current = seekMode; }, [seekMode]);
  useEffect(() => {
    let timer = 0;
    let check = 0;
    const SEEK_MS = 3500;
    const restart = () => { if (timer) window.clearTimeout(timer); timer = window.setTimeout(() => setSeekMode(false), SEEK_MS); };
    // 재생 위치가 건너뛰었다는 소식(막대를 끌어 놓음) → 돌려보기 화면 다시/유지
    seekPokeRef.current = () => { if (check) window.clearTimeout(check); setSeekMode(true); restart(); };
    const onBlur = () => {
      window.setTimeout(() => {
        if (document.activeElement !== iframeRef.current) return;
        window.setTimeout(() => { try { rootRef.current?.focus({ preventScroll: true }); } catch { /* 무시 */ } }, 150);
        if (!seekModeRef.current) { setSeekMode(true); restart(); return; }
        // [05:38 사장님 「다시 누르면 글씨가 늦게 나타남」] 돌려보기 중 또 누르면 바로 원래대로(기다리지 않음).
        //   막대를 끌어 놓은 거였으면 재생 위치가 건너뛴 소식(seekPokeRef)이 와서 다시 돌려보기 화면이 됨.
        if (timer) window.clearTimeout(timer);
        if (check) window.clearTimeout(check);
        setSeekMode(false);
      }, 0);
    };
    window.addEventListener("blur", onBlur);
    return () => { window.removeEventListener("blur", onBlur); if (timer) window.clearTimeout(timer); if (check) window.clearTimeout(check); };
  }, []);
  // 실시간 채팅에서 인사하기(유튜브처럼) — 이 방송에서 아직 글을 안 쓴 손님에게 한 번, 1분 지나면 저절로 숨김
  const greetKey = `ruru_live_greet_${videoId}`;
  const [greetOpen, setGreetOpen] = useState(false);
  useEffect(() => {
    let done = false;
    try { done = window.localStorage.getItem(greetKey) === "1"; } catch { /* 무시 */ }
    if (done) return;
    const t1 = window.setTimeout(() => setGreetOpen(true), 1500);
    const t2 = window.setTimeout(() => setGreetOpen(false), 61500);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [greetKey]);
  const closeGreet = () => {
    setGreetOpen(false);
    try { window.localStorage.setItem(greetKey, "1"); } catch { /* 무시 */ }
  };
  const sendGreet = async () => {
    if (!chat) return;
    closeGreet();
    const r = await chat.onSend("👋").catch(() => ({ ok: false, message: "못 보냈어요." }));
    if (!r.ok) setChatHint(r.message || "못 보냈어요.");
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
    // [2026-11-10 04:09 사장님 「위아래로 훑을 때 딱딱 끊기고 부자연스러움」]
    //   손가락만큼만 움직이고 손을 떼면 바로 멈춰서 딱딱했다 → 손 뗄 때 빠르기를 재서 폰처럼 «미끄러지듯» 이어서 멈춤(관성).
    let lastY = 0;
    let lastT = 0;
    let velocity = 0; // 화면 px / ms (아래로 끌면 +)
    let raf = 0;
    const stopGlide = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
    const glide = (el: HTMLElement, v0: number) => {
      stopGlide();
      let v = v0;
      let prev = performance.now();
      const step = (now: number) => {
        const dt = Math.min(32, now - prev);
        prev = now;
        el.scrollTop -= v * dt;
        v *= Math.pow(0.95, dt / 16);
        const atEdge = el.scrollTop <= 0 || el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if (Math.abs(v) < 0.02 || atEdge) { raf = 0; return; }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      stopGlide();
      startY = t.clientY;
      lastY = t.clientY;
      lastT = e.timeStamp || performance.now();
      velocity = 0;
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
        const now = e.timeStamp || performance.now();
        const dt = now - lastT;
        if (dt > 0) velocity = 0.8 * ((t.clientY - lastY) / dt) + 0.2 * velocity;
        lastY = t.clientY;
        lastT = now;
        if (e.cancelable) e.preventDefault();
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      if (target && target.closest("[data-live-scroll]")) return;
      if (e.cancelable) e.preventDefault();
    };
    const onEnd = (e: TouchEvent) => {
      if (!inChat || !moved) return;
      const now = e.timeStamp || performance.now();
      // 손을 멈췄다 뗐으면(0.1초 넘게 가만) 미끄러지지 않음
      if (now - lastT > 100 || Math.abs(velocity) < 0.1) return;
      glide(inChat, Math.max(-4, Math.min(4, velocity)));
    };
    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd, { passive: true });
    root.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      stopGlide();
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onEnd);
    };
  }, []);
  const moderate = async (action: LiveChatAction) => {
    if (!chat || !modTarget) return;
    if (action === "ban" && !banConfirm) { setBanConfirm(true); return; }
    const id = modTarget.id;
    setModTarget(null);
    setBanConfirm(false);
    const r = await chat.onModerate(id, action).catch(() => ({ ok: false, message: "처리 못 했어요." }));
    setChatHint(r.message || (r.ok ? "처리했어요." : "처리 못 했어요."));
  };

  // [2026-11-10 사장님 「방송 화면 닫고 나오면 스크롤 안 먹힘」] 여기 있던 두 번째 body 잠금은 지움 —
  //   위 잠금(html·body)과 겹쳐 닫을 때 «잠긴 값»으로 되돌려 쇼핑몰 화면 스크롤이 계속 막혔다. 잠금은 위 하나만.

  const sendToPlayer = (cmd: string) => {
    try { iframeRef.current?.contentWindow?.postMessage(cmd, "https://www.youtube.com"); } catch { /* 플레이어 준비 전이면 무시 */ }
  };
  // ── 돌려보다가 「실시간으로 돌아가기」 ──
  //   유튜브 플레이어가 보내 주는 재생 정보(infoDelivery)로 «재생 중인데 지금 방송보다 30초 넘게 뒤»일 때만 버튼을 띄운다.
  //   누르면 영상을 다시 불러 지금 방송으로(가장 확실한 방법). 정보가 안 오면 버튼도 안 뜬다(유튜브 막대의 「라이브」로도 돌아갈 수 있음).
  const [reloadKey, setReloadKey] = useState(0);
  const [behindLive, setBehindLive] = useState(false);
  const playerInfo = useRef<{ t: number; d: number; state: number }>({ t: 0, d: 0, state: -1 });
  const lastTick = useRef<{ t: number; at: number; state: number }>({ t: 0, at: 0, state: -1 });
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!String(e.origin || "").includes("youtube.com")) return;
      let data: { event?: string; info?: Record<string, unknown> } | null = null;
      try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
      if (!data || data.event !== "infoDelivery" || !data.info) return;
      const info = data.info;
      const cur = playerInfo.current;
      if (typeof info.currentTime === "number") {
        // 막대로 건너뛴 걸 알아채기 — 예상 위치에서 3초 넘게 벗어나면 돌려보기 화면(채팅 흐리게)
        const now = Date.now();
        const last = lastTick.current;
        if (last.at > 0 && last.t > 0) {
          const expected = last.state === 1 ? last.t + (now - last.at) / 1000 : last.t;
          if (Math.abs(info.currentTime - expected) > 3) seekPokeRef.current();
        }
        lastTick.current = { t: info.currentTime, at: now, state: typeof info.playerState === "number" ? info.playerState : cur.state };
        cur.t = info.currentTime;
      }
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
    lastTick.current = { t: 0, at: 0, state: -1 };
    // 플레이어에게 «재생 정보 보내 줘» 요청(몇 번 시도 — 준비가 늦을 수 있음)
    [300, 1500, 4000].forEach((ms) => window.setTimeout(() => sendToPlayer(JSON.stringify({ event: "listening", id: 1, channel: "widget" })), ms));
  };
  const backToLive = () => {
    playerInfo.current = { t: 0, d: 0, state: -1 };
    lastTick.current = { t: 0, at: 0, state: -1 };
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
      tabIndex={-1}
      role="region"
      aria-label="방송 보며 주문"
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "#000000", color: "#FFFFFF", overflow: "hidden", fontFamily: "inherit", overscrollBehavior: "none", outline: "none" }}
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
      {/* 돌려보기 중 — 영상 전체를 반투명 검정으로 어둡게(유튜브 막대는 빨강·흰색이라 그대로 보임) */}
      <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, height: "calc(100% - 84px - env(safe-area-inset-bottom))", pointerEvents: "none", background: "rgba(0,0,0,0.45)", opacity: seekMode ? 1 : 0, transition: "opacity 0.2s" }} />
      <div data-live-seek={seekMode ? "1" : "0"} style={{ position: "absolute", left: 0, right: 0, top: 0, padding: "calc(8px + env(safe-area-inset-top)) 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", background: "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0))", pointerEvents: "none", opacity: seekMode ? 0 : 1, transition: "opacity 0.2s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          {/* [07:05 사장님] LIVE + 시청자 수(유튜브 동시 시청자) — 오늘만셀러처럼 한 알약 */}
          <span aria-label={props.viewers != null ? `${paused ? "쉬는 중" : "라이브"} · 시청자 ${props.viewers}명` : undefined} style={{ display: "inline-flex", alignItems: "stretch", height: "28px", borderRadius: "9999px", overflow: "hidden", fontSize: "13px", fontWeight: 700, flexShrink: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "0 10px", background: paused ? "#707072" : "#D30005" }}>
              <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "9999px", background: "#FFFFFF" }} />{paused ? "쉬는 중" : "LIVE"}
            </span>
            {props.showSiteViewers ? (
              // 유튜브 시청자·사이트 접속 둘 다(유튜브 빨간 재생 그림 / 사이트 = 폰 그림) — 모든 손님
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "0 10px 0 8px", background: "rgba(0,0,0,0.5)" }}>
                <span aria-label={`유튜브 시청자 ${props.viewers ?? "-"}명`} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <svg aria-hidden="true" width="16" height="12" viewBox="0 0 16 12"><rect width="16" height="12" rx="3" fill="#FF0000" /><path d="M6.5 3.5v5l4-2.5z" fill="#FFFFFF" /></svg>
                  {props.viewers != null ? props.viewers.toLocaleString("ko-KR") : "-"}
                </span>
                <span aria-label={`사이트 접속 ${props.siteViewers ?? "-"}명`} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <svg aria-hidden="true" width="12" height="14" viewBox="0 0 12 16" fill="none" stroke="#FFFFFF" strokeWidth="1.8"><rect x="1" y="1" width="10" height="14" rx="2" /><path d="M5 12.5h2" /></svg>
                  {props.siteViewers != null ? props.siteViewers.toLocaleString("ko-KR") : "-"}
                </span>
              </span>
            ) : props.viewers != null ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "0 10px 0 8px", background: "rgba(0,0,0,0.5)" }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
                {props.viewers.toLocaleString("ko-KR")}
              </span>
            ) : null}
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
      {behindLive && !seekMode ? (
        <button type="button" onClick={backToLive} style={{ position: "absolute", left: "50%", top: "calc(124px + env(safe-area-inset-top))", transform: "translateX(-50%)", height: "44px", padding: "0 16px", border: "none", borderRadius: "9999px", background: "#D30005", color: "#FFFFFF", fontSize: "15px", fontWeight: 700, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap", zIndex: 1 }}>
          <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "9999px", background: "#FFFFFF" }} />실시간 화면으로 돌아가기
        </button>
      ) : null}

      {/* 잠시 쉬는 중 — 주문은 그대로 */}
      {paused ? (
        <div role="status" style={{ position: "absolute", left: "16px", right: "16px", top: "40%", textAlign: "center", pointerEvents: "none" }}>
          <span style={{ display: "inline-block", padding: "12px 18px", borderRadius: "12px", background: "rgba(0,0,0,0.6)", fontSize: "15px", fontWeight: 600, lineHeight: 1.5 }}>
            {pausedText}<br /><span style={{ fontSize: "13px", fontWeight: 400, color: "#E5E5E5" }}>상품은 지금도 담을 수 있어요</span>
          </span>
        </div>
      ) : null}

      {/* 아래쪽 — 채팅 · 주문 알림 · 소개 중 상품 카드(돌려보기 중엔 숨김 — 유튜브 막대를 가리지 않게) */}
      {/* 돌려보기 모드 — 안의 모든 것이 손가락을 막지 않게(유튜브 막대로 그대로) */}
      <style>{`[data-live-seek="1"], [data-live-seek="1"] * { pointer-events: none !important; }`}</style>
      <style>{`html, body { overflow: hidden !important; overscroll-behavior: none !important; }`}</style>
      <div data-live-seek={seekMode ? "1" : "0"} style={{ display: focus ? "none" : "flex", position: "absolute", left: "16px", right: "16px", bottom: "calc(90px + env(safe-area-inset-bottom))", flexDirection: "column", gap: "8px", pointerEvents: "none", opacity: seekMode ? 0.06 : 1, transition: "opacity 0.2s" }}>
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
          <div style={{ position: "relative", width: "100%" }}>
          <div
            ref={chatBoxRef}
            role="log"
            aria-label="채팅"
            aria-live="polite"
            onScroll={onChatScroll}
            style={{ pointerEvents: "none", overscrollBehavior: "contain", maxHeight: CHAT_HEIGHTS[chatView.height], overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "8px", maskImage: "linear-gradient(transparent, #000 24px)", WebkitMaskImage: "linear-gradient(transparent, #000 24px)", padding: "16px 0 0 4px", boxSizing: "border-box", width: "100%" }}
          >
            {chat.messages.map((m) => { const color = chatColorMap.get(m.id) || "#FFFFFF";
              // 루루동이AI — 이 화면에만 끼운 알림 줄(번호가 소수)은 관리 창 없음 / 상품 안내 줄은 누르면 그 상품 옵션 창
              const localLine = !Number.isInteger(m.id);
              const canMod = chat.canModerate && !localLine;
              const botProduct = m.badge === "bot" ? parseBotRef(m.botRef) : null;
              return (
              <div
                key={m.id}
                onPointerDown={(e) => { downAt.current = { x: e.clientX, y: e.clientY }; if (canMod) startPress(m); }}
                onPointerUp={canMod ? endPress : undefined}
                onPointerLeave={canMod ? endPress : undefined}
                onPointerCancel={canMod ? endPress : undefined}
                onContextMenu={canMod ? (e) => { e.preventDefault(); setModTarget(m); } : undefined}
                onClick={botProduct ? (e) => {
                  const d = downAt.current;
                  if (modTarget || (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8)) return; // 길게 누름·끌기는 열지 않음
                  props.onOpenProduct(botProduct.productId, botProduct.detailName || undefined);
                } : undefined}
                role={botProduct ? "button" : undefined}
                style={{ cursor: botProduct ? "pointer" : undefined, pointerEvents: "auto", touchAction: "pan-y", display: "flex", alignItems: "flex-start", gap: "8px", maxWidth: "100%", color, fontSize: CHAT_SIZES[chatView.size], fontWeight: chatView.bold ? 700 : 500, lineHeight: 1.45, wordBreak: "break-word", textShadow: CHAT_TEXT_SHADOW, userSelect: chat.canModerate ? "none" : "auto", WebkitUserSelect: chat.canModerate ? "none" : "auto" }}
              >
                {/* 유튜브처럼 [사진][닉네임 · 표시 · 글] — 글이 길어 다음 줄로 가면 사진 밑이 아니라 닉네임 시작 자리에 맞춰 내려감.
                    상자 없이 글자만 — 닉네임과 글은 같은 색(사람마다 정해진 색, 바로 위 다른 사람과는 절대 같은 색 안 됨).
                    관리자는 글 줄을 길게 누르면 관리 창(고정은 왕관 두 사람만) */}
                <ChatAvatar src={m.badge === "bot" ? "/ruru-ai-avatar.png" : m.avatar} nick={m.nickname} color={color} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 800 }}>{m.nickname}</span>
                  <ChatBadge badge={m.badge} />
                  <span style={{ marginLeft: m.badge ? "4px" : "8px" }}><ChatBodyView body={m.body} emojis={emojiMap} /></span>
                  {botProduct ? (
                    <span style={{ display: "inline-flex", alignItems: "center", marginLeft: "8px", height: "24px", padding: "0 10px", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "13px", fontWeight: 700, textShadow: "none", verticalAlign: "middle", whiteSpace: "nowrap" }}>담기 ›</span>
                  ) : null}
                </span>
              </div>
            ); })}
          </div>
          {!chatAtBottom ? (
            // 유튜브처럼 채팅 가운데 아래 흰 동그라미 화살표 — 누르면 맨 아래(새 글)로
            <button type="button" onClick={chatToBottom} aria-label="새 글 보기" style={{ pointerEvents: "auto", position: "absolute", left: "50%", bottom: "4px", transform: "translateX(-50%)", width: "40px", height: "40px", border: "none", borderRadius: "9999px", background: "#FFFFFF", boxShadow: "0 2px 8px rgba(0,0,0,0.35)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
            </button>
          ) : null}
          </div>
        ) : null}
        {chat && chat.pinned ? (
          // 고정 댓글 — 유튜브처럼 채팅 맨 아래(입력 줄 바로 위) 어두운 띠 한 줄. 누르면 전체 글 펼침/접기.
          //   왕관 표시 두 사람은 길게 누르면 고정 해제 등 관리 창
          <div
            role="button"
            tabIndex={0}
            aria-expanded={pinOpen}
            aria-label="고정 댓글"
            onClick={() => { if (!modTarget) setPinOpen((v) => !v); }}
            onPointerDown={chat.canPin ? () => startPress(chat.pinned!) : undefined}
            onPointerUp={chat.canPin ? endPress : undefined}
            onPointerLeave={chat.canPin ? endPress : undefined}
            onPointerCancel={chat.canPin ? endPress : undefined}
            onContextMenu={chat.canPin ? (e) => { e.preventDefault(); setModTarget(chat.pinned); } : undefined}
            style={{ pointerEvents: "auto", display: "flex", alignItems: pinOpen ? "flex-start" : "center", gap: "8px", width: "100%", boxSizing: "border-box", minHeight: "44px", padding: "8px 12px", borderRadius: "22px", background: "rgba(28,28,28,0.88)", color: "#FFFFFF", fontSize: CHAT_SIZES[chatView.size], lineHeight: 1.45, cursor: "pointer", userSelect: "none", WebkitUserSelect: "none" }}
          >
            <ChatAvatar src={chat.pinned.avatar} nick={chat.pinned.nickname} color={chatColorMap.get(chat.pinned.id) || "#FFD43B"} />
            <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", height: "24px", padding: "0 8px", borderRadius: "9999px", background: "rgba(255,255,255,0.16)", fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap", maxWidth: "40%", overflow: "hidden", textOverflow: "ellipsis" }}>
              {chat.pinned.nickname}<ChatBadge badge={chat.pinned.badge} />
            </span>
            <span style={{ flex: 1, minWidth: 0, fontWeight: chatView.bold ? 700 : 500, ...(pinOpen ? { wordBreak: "break-word" } : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }) }}><ChatBodyView body={chat.pinned.body} emojis={emojiMap} /></span>
          </div>
        ) : null}
        {chat && chat.canWrite && greetOpen ? (
          // 실시간 채팅에서 인사하기 — 유튜브 앱과 같은 모양: [손 흔드는 그림] 글 … [보내기 흰 알약]. 「보내기」 = 👋 한 번 보냄
          <div style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: "12px", width: "100%", boxSizing: "border-box", minHeight: "52px", padding: "8px 8px 8px 14px", borderRadius: "12px", background: "rgba(40,40,40,0.82)", color: "#FFFFFF" }}>
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: "rotate(-18deg)" }}>
              <path d="M18 11V6a2 2 0 0 0-4 0" /><path d="M14 10V4a2 2 0 0 0-4 0v2" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
            <span style={{ flex: 1, minWidth: 0, fontSize: "15px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>실시간 채팅에서 인사하기</span>
            <button type="button" onClick={() => void sendGreet()} style={{ flexShrink: 0, height: "36px", padding: "0 16px", border: "none", borderRadius: "9999px", background: "#FFFFFF", color: "#0F0F0F", fontSize: "14px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>보내기</button>
          </div>
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
          <div style={{ flex: 1, minWidth: "112px", height: "52px", boxSizing: "border-box", border: "1.5px solid rgba(255,255,255,0.55)", borderRadius: "9999px", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", overflow: "hidden" }}>
            <button type="button" onClick={() => openCompose(false)} style={{ flex: 1, minWidth: 0, height: "100%", border: "none", background: "transparent", color: "#FFFFFF", fontSize: "16px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", padding: canEmoji ? "0 0 0 14px" : "0 14px", textAlign: "left", whiteSpace: "nowrap", overflow: "hidden" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>채팅 입력</span>
            </button>
            {canEmoji ? (
              // 이모티콘을 쓸 수 있는 손님만 — 입력칸 맨 오른쪽 웃는 얼굴(유튜브 멤버십처럼)
              <button type="button" onClick={() => openCompose(true)} aria-label="이모티콘" style={{ flexShrink: 0, width: "44px", height: "100%", border: "none", background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                <IconSmile color="#FFFFFF" />
              </button>
            ) : null}
          </div>
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

      {/* 채팅 쓰기 줄 — 쓸 수 있는 손님은 입력칸 오른쪽 웃는 얼굴 → 키보드 자리에 이모티콘 판 */}
      {composeOpen && chat ? (
        <div role="dialog" aria-modal="true" aria-label="채팅 쓰기" onClick={() => setComposeOpen(false)} style={{ position: "fixed", inset: 0, zIndex: SHEET_Z, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "flex-end" }}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); if (draftEmojiCount > EMOJI_MAX_PER_MSG) { setComposeHint(`이모티콘은 한 번에 ${EMOJI_MAX_PER_MSG}개까지예요.`); return; } setEmojiOpen(false); void sendChat(); }}
            style={{ width: "100%", maxWidth: "560px", margin: "0 auto", background: "#FFFFFF", padding: emojiOpen ? "12px 16px 0" : "12px 16px calc(12px + env(safe-area-inset-bottom))", borderRadius: "16px 16px 0 0", boxSizing: "border-box" }}
          >
            {draftEmojiCount > 0 ? (
              // 보내면 이렇게 보여요 — «:이름:» 글자 대신 그림으로 미리
              <div aria-label="미리보기" style={{ marginBottom: "8px", padding: "8px 12px", borderRadius: "12px", background: "#F5F5F5", color: "#111111", fontSize: "15px", lineHeight: 1.45, wordBreak: "break-word" }}>
                <ChatBodyView body={encodeEmojiTokens(draft, emojiItems).text} emojis={emojiMap} />
              </div>
            ) : null}
            {composeHint ? <div role="status" style={{ marginBottom: "8px", fontSize: "13px", fontWeight: 600, color: "#D30005" }}>{composeHint}</div> : null}
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0, height: "48px", boxSizing: "border-box", border: "1px solid #E5E5E5", borderRadius: "9999px", display: "flex", alignItems: "center", background: "#FFFFFF" }}>
                <input
                  ref={inputRef}
                  autoFocus={!emojiOpen}
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value.slice(0, LIVE_CHAT_MAX_LEN)); rememberCaret(e.target); }}
                  onSelect={(e) => rememberCaret(e.currentTarget)}
                  onFocus={() => setEmojiOpen(false)}
                  placeholder="채팅 입력"
                  aria-label="채팅 메시지"
                  enterKeyHint="send"
                  maxLength={LIVE_CHAT_MAX_LEN}
                  style={{ flex: 1, minWidth: 0, height: "100%", padding: canEmoji ? "0 4px 0 16px" : "0 16px", border: "none", borderRadius: "9999px", fontSize: "16px", fontFamily: "inherit", outline: "none", color: "#111111", background: "transparent" }}
                />
                {canEmoji ? (
                  <button
                    type="button"
                    aria-label={emojiOpen ? "키보드" : "이모티콘"}
                    aria-pressed={emojiOpen}
                    onClick={() => {
                      if (emojiOpen) { setEmojiOpen(false); inputRef.current?.focus(); }
                      else { if (inputRef.current) rememberCaret(inputRef.current); inputRef.current?.blur(); setEmojiOpen(true); }
                    }}
                    style={{ flexShrink: 0, width: "44px", height: "44px", border: "none", background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                  >
                    <IconSmile color={emojiOpen ? "#111111" : "#707072"} />
                  </button>
                ) : null}
              </div>
              <button type="submit" disabled={sending || !draft.trim()} style={{ flexShrink: 0, height: "48px", padding: "0 18px", border: "none", borderRadius: "9999px", background: sending || !draft.trim() ? "#E5E5E5" : "#111111", color: sending || !draft.trim() ? "#707072" : "#FFFFFF", fontSize: "15px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
                {sending ? "보내는 중" : "보내기"}
              </button>
            </div>
            {emojiOpen && canEmoji ? (
              <div style={{ margin: "12px -16px 0", borderTop: "1px solid #E5E5E5" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px 0" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#111111" }}>루루동이 이모티콘</span>
                  <span style={{ fontSize: "13px", color: "#707072" }}>{draftEmojiCount}/{EMOJI_MAX_PER_MSG}</span>
                </div>
                <div data-live-scroll="1" style={{ height: "232px", overflowY: "auto", overscrollBehavior: "contain", padding: "8px 12px calc(12px + env(safe-area-inset-bottom))", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))", gap: "4px", alignContent: "start" }}>
                  {emojiItems.map((e) => (
                    <button key={e.id} type="button" onClick={() => insertEmoji(e)} aria-label={`이모티콘 ${e.name}`} title={e.name} style={{ height: "60px", border: "none", borderRadius: "12px", background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={e.url} alt="" draggable={false} style={{ width: "48px", height: "48px", objectFit: "contain" }} />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </form>
        </div>
      ) : null}

      {/* 관리자 — 글 길게 누르면 */}
      {modTarget && chat ? (
        <div role="dialog" aria-modal="true" aria-label="채팅 관리" onClick={() => { setModTarget(null); setBanConfirm(false); }} style={{ position: "fixed", inset: 0, zIndex: SHEET_Z + 2, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", margin: "0 auto", background: "#FFFFFF", color: "#111111", borderRadius: "16px 16px 0 0", padding: "16px 16px calc(16px + env(safe-area-inset-bottom))" }}>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px", display: "flex", alignItems: "center" }}>{modTarget.nickname}<ChatBadge badge={modTarget.badge} /></div>
            <div style={{ fontSize: "14px", color: "#707072", marginBottom: "12px", wordBreak: "break-word" }}><ChatBodyView body={modTarget.body} emojis={emojiMap} /></div>
            {!banConfirm ? (() => {
              const isPinned = chat.pinned?.id === modTarget.id;
              const isOwnerTarget = modTarget.badge === "crown" || modTarget.badge === "crown_pink";
              const rows: [LiveChatAction, string][] = chat.canPin ? [[isPinned ? "unpin" : "pin", isPinned ? "고정 해제" : "이 글 고정하기"]] : [];
              if (chat.canGrant && !isOwnerTarget) rows.push(modTarget.badge === "mod" ? ["revoke", "채팅 관리자에서 해제"] : ["grant", "채팅 관리자로 지정"]);
              return rows.map(([a, label]) => (
                <button key={a} type="button" onClick={() => void moderate(a)} style={{ width: "100%", height: "52px", marginBottom: "8px", border: "1px solid #E5E5E5", borderRadius: "12px", background: "#FFFFFF", color: "#111111", fontSize: "16px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>{label}</button>
              ));
            })() : null}
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
