"use client";
// [2026-11-09] 「방송 보며 주문」 ②단계 화면 — 주문서 위에 덮는 방송 화면(손님용).
//   참고: 오늘만셀러(onmlive)·모루라이브 — 세로 영상 꽉 차게, 아래에 «지금 소개 중» 상품 카드,
//   맨 아래 줄 [상품 목록][주문서 확인], 「OO님 주문했어요」 알림.
//   이 화면은 «보여 주기·고르기»만 한다. 담기·장바구니·주문서·결제는 부모(주문 페이지)의 기존 함수가 그대로 처리한다.
//   z-index 60: 아래 메뉴(40)·장바구니 바(39) 위, 옵션 창·주문서 창(100) 아래 → 옵션 창이 방송 위로 올라온다.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  LIVE_WATCH_GUIDE_SEEN_KEY,
  LIVE_EDGE_TOLERANCE_SECONDS,
  liveWatchList,
  youtubeCommand,
  youtubeEmbedUrl,
  type LiveWatchItem,
} from "@/lib/liveWatch";
import { isKakaoInAppBrowser } from "@/lib/youtubeChannelLink";
import { openOrderInExternalBrowser } from "@/components/customer/KakaoExternalOpen";
import { parseBotRef } from "@/lib/liveChatBot";
import { LIVE_CHAT_MAX_LEN, chatColors, type LiveChatAction, type LiveChatMessage, type LiveChatPenalty } from "@/lib/liveChat";
import { EMOJI_MAX_PER_MSG, chatBodyAsText, countEmojiTokens, encodeEmojiTokens, type ChatEmoji } from "@/lib/liveChatEmoji";
import { lastTypedWord, suggestEmojis } from "@/lib/liveChatEmojiSuggest";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useChatAutoScroll } from "@/lib/useChatAutoScroll";
import { useProductIntroPlayer } from "@/lib/useProductIntroPlayer";
import type { IntroReplayRequest } from "@/lib/productIntro";
import { invalidateProductIntroCatalog, loadProductIntroCatalog } from "@/lib/productIntroCatalogClient";
import { useLiveResume } from "@/lib/useLiveResume";
import { ChatBodyView, emojiMapOf } from "@/components/customer/ChatBodyView";
import { ChatProductPicker } from "@/components/customer/ChatProductPicker";
import type { ChatProductSelection } from "@/lib/liveChatProductCommand";
import { ChatProductThumb } from "./ChatProductThumb";
import { chatProductPhoto } from "@/lib/chatProductPhoto";

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
  introReplay?: IntroReplayRequest | null;
  onReturnToProduct?: () => void;
  onEndIntroReplay?: () => void;
  paused: boolean;
  pausedText: string;
  /** [2026-11-10] 유튜브 동시 시청자 수(1분마다 갱신) — 없으면 숫자 안 보임 */
  viewers?: number | null;
  /** [07:18·07:28 사장님] 사이트 접속 수(최근 2분) — 유튜브 숫자와 같이 모든 손님에게 */
  siteViewers?: number | null;
  showSiteViewers?: boolean;
  /** 방송 번호 — 인사하기를 방송마다 다시 띄우려고 */
  broadcastId?: string;
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
    onSend: (body: string, target?: ChatProductSelection) => Promise<{ ok: boolean; message?: string }>;
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
    ownIds?: number[];
    identityVerified?: boolean;
    canReviewDeleted?: boolean;
    onVerifyIdentity?: () => void;
    onDeleteOwn?: (id: number) => Promise<{ ok: boolean; message?: string }>;
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
const IconSoundOn = ({ color = "#FFFFFF" }: { color?: string }) => (
  <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 010 6" /><path d="M19 6a8 8 0 010 12" /></svg>
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
  const box = { width: "24px", height: "24px", borderRadius: "9999px", flexShrink: 0, marginTop: "-2px", overflow: "hidden" } as const;
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} style={{ ...box, pointerEvents: "none", WebkitTouchCallout: "none", objectFit: "cover", display: "block", background: "#333333" }} />;
  }
  const ch = Array.from(String(nick || "").trim())[0] || "?";
  return <span aria-hidden="true" style={{ ...box, display: "inline-flex", alignItems: "center", justifyContent: "center", background: color, color: "#111111", fontSize: "12px", fontWeight: 700, textShadow: "none" }}>{ch}</span>;
}
// 글자를 상자 없이 영상 위에 바로 — 어떤 화면에서도 읽히게 진한 그림자
// [08:50 사장님 「닉네임 흐리멍텅·블러 같다」] 번지는 그림자 대신 1px 또렷한 테두리 그림자
// [09:08 사장님 「밝은 배경에서 흐리멍텅」] 번지는 그림자 대신 또렷한 1px 테두리 + 아래 옅은 그림자
// [12:41 사장님 「유튜브 글씨는 깔끔한데 우리는 도트 폰트처럼 거칠다」] 원인: 위·아래·좌·우 1px 딱딱한 그림자 4개가 글자 가장자리를 계단처럼 깎음
//   → 유튜브 앱처럼 테두리 없이 부드러운 그림자 한 겹(가장자리 그대로 매끈) + 아래로 살짝
// [12:49 사장님 「뒤에 물체 없으면 블러 같다」] 3px 번짐을 빼고 얇은 그림자 두 겹만(글자 둘레가 뿌옇게 안 보이게)
// 유튜브 캡처 확대: 글자 아래에 아주 얇은 어두운 테두리만(번짐 거의 없음) → 같은 정도로
const CHAT_TEXT_SHADOW = "0 0 1px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.5)";
// 닉네임 연한 색 — 사람 색(#RRGGBB)을 흰색과 반쯤 섞음(파스텔). 모르는 값이면 흐린 흰색
function softNickColor(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "rgba(255,255,255,0.8)";
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.45);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}
// 유튜브 앱 글꼴 = 안드로이드 Roboto + 한글 Noto Sans CJK(시스템), 아이폰 시스템 글꼴 — 같은 글꼴을 이 화면에 지정(웹 글꼴 내려받기 없음)
const LIVE_FONT = 'Roboto, "Noto Sans CJK KR", "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const IconClose = ({ color = "#111111" }: { color?: string }) => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
);

// 채팅 설정(이 폰에만 기억) — 글자 크기·굵게·채팅창 높이
type ChatView = { size: "base" | "mid" | "big"; bold: boolean; height: "base" | "low" | "high" };
const CHAT_VIEW_KEY = "ruru_live_chat_view_v1";
const CHAT_VIEW_DEFAULT: ChatView = { size: "base", bold: false, height: "base" };
// [2026-11-10 04:09] 기본 15px — 유튜브 앱 채팅 글자와 비슷하게(사장님 「유튜브랑 비슷하게」)
// [08:39 사장님 「유튜브 라이브 채팅과 글자 크기·굵기·줄 간격·여백 모두 같게」] 유튜브 앱 라이브 채팅 기준: 글자 14 · 줄 높이 20 · 줄 사이 8 · 사진 24 · 사진과 이름 사이 12 · 닉네임·글은 사람마다 정해진 색(08:50 다시)
const CHAT_SIZES: Record<ChatView["size"], string> = { base: "14px", mid: "16px", big: "18px" };
const CHAT_LINE_H: Record<ChatView["size"], string> = { base: "20px", mid: "22px", big: "25px" };
const CHAT_HEIGHTS: Record<ChatView["height"], string> = { base: "24dvh", low: "14dvh", high: "36dvh" };
// 우리 재생 막대(유튜브 막대 대신) — 위치·길이는 유튜브가 보내 주는 재생 정보, 옮기기는 seekTo 명령
function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
type SeekFunc = "playVideo" | "pauseVideo" | "seekTo";
function LiveSeekControls(props: { getPos: () => { t: number; d: number; playing: boolean; live: boolean; atLiveHead: boolean | null }; send: (func: SeekFunc, args?: unknown[]) => void; onHold: (hold: boolean) => void }) {
  const { getPos, send, onHold } = props;
  const [pos, setPos] = useState(() => getPos());
  const [drag, setDrag] = useState<number | null>(null); // 끄는 중 위치(0~1)
  const pending = useRef<{ t: number; until: number; playing?: boolean } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const getPosRef = useRef(getPos);
  useEffect(() => { getPosRef.current = getPos; });
  useEffect(() => {
    const tick = () => {
      const p = getPosRef.current();
      const pd = pending.current;
      if (pd && Date.now() < pd.until) setPos({ ...p, t: pd.t >= 0 ? pd.t : p.t, playing: pd.playing ?? p.playing });
      else { pending.current = null; setPos(p); }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, []);
  const hasDur = pos.d > 0;
  const frac = drag != null ? drag : hasDur ? Math.min(1, Math.max(0, pos.t / pos.d)) : 0;
  const shownT = drag != null && hasDur ? drag * pos.d : pos.t;
  const seekTo = (t: number) => {
    const target = Math.max(0, hasDur ? Math.min(t, pos.live ? pos.d : pos.d - 1) : t);
    send("seekTo", [target, true]);
    pending.current = { t: target, until: Date.now() + 1500 };
    setPos((p) => ({ ...p, t: target }));
  };
  const fracAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return r.width > 0 ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0;
  };
  const togglePlay = () => {
    const next = !pos.playing;
    send(next ? "playVideo" : "pauseVideo");
    pending.current = { t: -1, until: Date.now() + 1500, playing: next };
    setPos((p) => ({ ...p, playing: next }));
  };
  const behind = pos.live && hasDur ? pos.d - shownT : 0;
  const atLiveHead = drag != null ? behind < LIVE_EDGE_TOLERANCE_SECONDS : (pos.atLiveHead ?? (behind < LIVE_EDGE_TOLERANCE_SECONDS));
  const rightText = pos.live ? (atLiveHead ? "실시간" : `-${fmtTime(behind)}`) : hasDur ? fmtTime(pos.d) : "";
  const roundBtn = (size: number) => ({ width: `${size}px`, height: `${size}px`, borderRadius: "9999px", border: "none", background: "rgba(0,0,0,0.45)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, pointerEvents: "auto" as const });
  return (
    <div
      onPointerDown={() => onHold(true)}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      style={{ position: "absolute", left: 0, right: 0, top: 0, height: "calc(100% - 84px - env(safe-area-inset-bottom))", pointerEvents: "none", zIndex: 3 }}
    >
      {/* 가운데 — 10초 뒤로 · 멈춤/재생 · 10초 앞으로 */}
      <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)", display: "flex", justifyContent: "center", alignItems: "center", gap: "40px", pointerEvents: "none" }}>
        <button type="button" aria-label="10초 뒤로" onClick={() => seekTo(pos.t - 10)} style={roundBtn(52)}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><text x="12" y="15.5" textAnchor="middle" fontSize="7" fill="#FFFFFF" stroke="none" fontWeight="700">10</text></svg>
        </button>
        <button type="button" aria-label={pos.playing ? "멈춤" : "재생"} onClick={togglePlay} style={roundBtn(68)}>
          {pos.playing ? (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <button type="button" aria-label="10초 앞으로" onClick={() => seekTo(pos.t + 10)} style={roundBtn(52)}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /><text x="12" y="15.5" textAnchor="middle" fontSize="7" fill="#FFFFFF" stroke="none" fontWeight="700">10</text></svg>
        </button>
      </div>
      {/* 아래 — 시간 + 막대(끌어서 옮김) */}
      {hasDur ? (
        <div style={{ position: "absolute", left: "16px", right: "16px", bottom: "12px", pointerEvents: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600, color: "#FFFFFF", textShadow: "0 1px 2px rgba(0,0,0,0.8)", fontVariantNumeric: "tabular-nums", marginBottom: "2px" }}>
            <span>{fmtTime(shownT)}</span>
            <span style={{ color: pos.live && atLiveHead ? "#FF4E45" : "#FFFFFF" }}>{rightText}</span>
          </div>
          <div
            ref={trackRef}
            role="slider"
            aria-label="재생 위치"
            aria-valuemin={0}
            aria-valuemax={Math.round(pos.d)}
            aria-valuenow={Math.round(shownT)}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(fracAt(e.clientX)); }}
            onPointerMove={(e) => { if (drag != null) setDrag(fracAt(e.clientX)); }}
            onPointerUp={(e) => { const f = drag != null ? drag : fracAt(e.clientX); setDrag(null); seekTo(f * pos.d); }}
            onPointerCancel={() => setDrag(null)}
            style={{ position: "relative", height: "36px", touchAction: "none", pointerEvents: "auto", cursor: "pointer" }}
          >
            <div style={{ position: "absolute", left: 0, right: 0, top: "16px", height: drag != null ? "6px" : "4px", marginTop: drag != null ? "-1px" : 0, borderRadius: "9999px", background: "rgba(255,255,255,0.35)" }} />
            <div style={{ position: "absolute", left: 0, top: "16px", width: `${frac * 100}%`, height: drag != null ? "6px" : "4px", marginTop: drag != null ? "-1px" : 0, borderRadius: "9999px", background: "#FF0033" }} />
            <div style={{ position: "absolute", left: `${frac * 100}%`, top: "18px", width: drag != null ? "20px" : "14px", height: drag != null ? "20px" : "14px", transform: "translate(-50%, -50%)", borderRadius: "9999px", background: "#FF0033" }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
  const isDesktop = useIsDesktop();
  const { videoId, title, paused, pausedText, pinned, items, cartCount, cartTotalText, orderToasts } = props;
  useEffect(() => {
    if (props.broadcastId && videoId) void loadProductIntroCatalog(props.broadcastId, videoId).catch(() => {});
  }, [props.broadcastId, videoId]);
  const noticeBadge = props.menu?.find((m) => m.key === "notice")?.badge || 0;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [soundPromptDone, setSoundPromptDone] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  // 영상을 누르면 유튜브 막대(돌려보기)가 나온다. 막대가 우리 위·아래 띠·채팅에 안 가리게 영상 칸을 띠 사이에만 둔다.
  const embedSrc = useMemo(() => youtubeEmbedUrl(videoId, typeof window !== "undefined" ? window.location.origin : undefined, { controls: false }), [videoId]);

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
  // PC는 상시 입력칸. 폰 쓰기 창을 연 채 PC 폭으로 바뀌면 방문 기록도 기존 정리 절차로 되돌린다.
  useEffect(() => { if (isDesktop) setComposeOpen(false); setEmojiOpen(false); }, [isDesktop]);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const chatTapRef = useRef<{ x: number; y: number; t: number } | null>(null);
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
  // [2026-11-10 08:04 사장님 영상 「채팅 쓰면 순간 겹쳐지며 위아래로 올라갔다 내려감」] 원인 실측(영상 한 장씩):
  //   키보드가 뜨면 카톡 안 브라우저가 화면 높이를 줄여 채팅 줄·쉬는 중 글이 «찌그러져» 겹쳐 보이고, 키보드가 내려가는 동안 그게 보였다 «툭» 원래대로.
  //   [08:17 사장님 「보내기 누르니 방송 화면이 사라지고 소리만」] 처음엔 방송 화면 높이를 고정했는데(frozenH) 그 뒤 이 증상이 보고돼 되돌림.
  //   → 화면 크기는 브라우저 그대로 두고, 쓰기 창이 열린 동안·키보드가 다 내려갈 때까지(최대 0.8초) 채팅 줄·쉬는 중 글만 잠깐 숨겼다가 부드럽게 다시 보임.
  //   [08:31 사장님 「보내면 글자 튕김·스프링 느낌 그대로」] 채팅 줄을 숨겼다 다시 보이는 게 «깜빡·튕김»으로 보여 채팅 줄은 늘 그대로 두고,
  //   겹쳐 보이던 «쉬는 중 글»만 숨김(채팅은 아래에 붙어 키보드와 같이 내려감).
  const [settling, setSettling] = useState(false);
  // [08:52 사장님 「방송 화면 좌우 여백이 남아, 베젤처럼」] 키보드가 뜨면 화면 높이가 줄어 세로 영상이 높이에 맞춰 작아지고
  //   좌우에 검은 띠가 생겼음. → 영상(iframe)만 키보드 뜨기 전 높이를 유지(화면 틀은 그대로라 화면이 밀리지 않음) — 유튜브 앱처럼
  //   키보드가 영상 아래쪽을 덮을 뿐 영상 크기는 그대로.
  const videoBaseH = useRef(0);
  useEffect(() => {
    const keep = () => { if (!composeOpen && !settling) videoBaseH.current = window.innerHeight; };
    keep();
    window.addEventListener("resize", keep);
    return () => window.removeEventListener("resize", keep);
  }, [composeOpen, settling]);
  const freezeVideo = (composeOpen || settling) && videoBaseH.current > 0;
  useEffect(() => {
    if (composeOpen) { setSettling(true); return; }
    if (!settling) return;
    const vv = window.visualViewport;
    let start = 0;
    const done = () => {
      setSettling(false);
      // 키보드 때문에 문서가 밀려 있으면 제자리로(방송 화면이 화면 밖으로 밀린 채 남지 않게)
      try { if (window.scrollY !== 0) window.scrollTo(0, 0); } catch { /* 무시 */ }
    };
    const base = window.innerHeight;
    const check = () => { if (window.innerHeight > base + 40 || (vv && vv.height >= window.innerHeight - 4 && Date.now() - start > 250)) done(); };
    start = Date.now();
    const t = window.setTimeout(done, 800);
    window.addEventListener("resize", check);
    vv?.addEventListener("resize", check);
    return () => { window.clearTimeout(t); window.removeEventListener("resize", check); vv?.removeEventListener("resize", check); };
  }, [composeOpen, settling]);
  const [draft, setDraft] = useState("");
  // [2026-11-10] 이모티콘 — 입력칸 오른쪽 웃는 얼굴(쓸 수 있는 손님만) → 키보드 자리에 이모티콘 판
  const emojiItems = useMemo(() => chat?.emojis ?? [], [chat?.emojis]);
  const emojiMap = useMemo(() => emojiMapOf(emojiItems), [emojiItems]);
  const canEmoji = Boolean(chat?.canEmoji) && emojiItems.length > 0;
  const [emojiOpen, setEmojiOpen] = useState(false);
  // [14:42 사장님 영상 「이모티콘 넣고 입력칸 다시 누르면 화면 꺼짐」] 원인: 입력칸을 누르는 순간(포커스) 이모티콘 판이 사라져
  //   쓰기 창이 232px 낮아지고, 같은 손가락의 «클릭»이 그 자리(이제 바깥 어두운 곳)에 떨어져 창이 닫혔음.
  //   → 바깥 누르기로 닫는 건 «누르기 시작도 바깥»일 때만.
  const composeDownOnBackdrop = useRef(false);
  const [composeHint, setComposeHint] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const caretRef = useRef<{ start: number; end: number } | null>(null);
  const draftEmojiCount = canEmoji ? countEmojiTokens(draft, emojiItems) : 0;
  // 커서 자리 — 넣기용 ref + 추천 낱말 계산용 state(화면이 다시 그려지게)
  const [caretEnd, setCaretEnd] = useState<number | null>(null);
  const rememberCaret = (el: HTMLInputElement) => { caretRef.current = { start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length }; setCaretEnd(caretRef.current.end); };
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
    setCaretEnd(start + token.length);
    setComposeHint("");
    return next;
  };
  // [15:41 사장님 「카톡처럼 단어 쓰면 이모티콘」] 커서 앞 마지막 낱말 → 어울리는 이모티콘(입력칸 위 한 줄 · 이모티콘 판 맨 위)
  //   키보드는 그대로(누를 때 입력칸 포커스 안 뺏김), 누르면 «:이름:» 을 커서 자리에 넣고 보내기 누르면 글과 함께 감.
  //   ✕ 누르면 그 낱말에선 다시 안 뜸(다른 낱말을 쓰면 다시).
  const [suggestHiddenFor, setSuggestHiddenFor] = useState("");
  const typedWord = canEmoji && (composeOpen || isDesktop) ? lastTypedWord(draft.slice(0, Math.min(caretEnd ?? draft.length, draft.length))) : "";
  const wordSuggests = typedWord ? suggestEmojis(typedWord, emojiItems) : [];
  const showSuggestRow = wordSuggests.length > 0 && !emojiOpen && typedWord !== suggestHiddenFor && draftEmojiCount < EMOJI_MAX_PER_MSG;
  const suggestRowRef = useRef<HTMLDivElement | null>(null);
  const [keyboardEmojiId, setKeyboardEmojiId] = useState<string | null>(null);
  const focusSuggestion = (index: number) => {
    const buttons = suggestRowRef.current?.querySelectorAll<HTMLButtonElement>("button");
    if (!buttons?.length) return;
    const button = buttons[(index + buttons.length) % buttons.length];
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const composingRef = useRef(false);
  const insertSuggested = (e: ChatEmoji) => {
    const el = inputRef.current;
    // 한글 조합 중(아직 글자가 덜 끝남)이면 먼저 조합을 끝내야 넣은 뒤 글자가 두 번 들어가지 않음
    if (el && composingRef.current) { el.blur(); composingRef.current = false; }
    insertEmoji(e);
    if (!el) return;
    // 넣은 뒤에도 키보드·커서 그대로(이모티콘 바로 뒤에서 이어 쓰기) — focus 는 누른 순간 바로 해야 아이폰도 키보드 유지
    if (document.activeElement !== el) el.focus();
    window.requestAnimationFrame(() => {
      const at = caretRef.current?.start ?? el.value.length;
      try { el.setSelectionRange(at, at); } catch { /* 무시 */ }
    });
  };
  const openCompose = (withEmoji: boolean) => {
    setEmojiOpen(withEmoji && canEmoji); setComposeHint(""); if (!isDesktop) setComposeOpen(true);
  };
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
  const [chatMenu, setChatMenu] = useState<{ message: LiveChatMessage; x: number; y: number; canManage: boolean } | null>(null);
  useEffect(() => {
    if (!chat?.canReviewDeleted) setChatMenu(prev => prev?.message.deletedByAuthor ? null : prev);
  }, [chat?.canReviewDeleted]);
  const chatMenuFocus = useRef<HTMLElement | null>(null);
  const closeChatMenu = () => {
    setChatMenu(null);
    chatMenuFocus.current?.focus({ preventScroll: true });
  };
  const openChatMenu = (message: LiveChatMessage, x: number, y: number, canManage: boolean) => {
    endPress();
    // 폰의 길게 누르기 뒤 contextmenu가 따라와도 관리 창 위에 복사 창을 겹치지 않는다.
    if (canManage && (!isDesktop || modTarget)) {
      setModTarget(message);
      setBanConfirm(false);
      setChatMenu(null);
      return;
    }
    chatMenuFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setChatMenu({ message, x: Math.max(8, Math.min(x, window.innerWidth - 228)), y: Math.max(8, Math.min(y, window.innerHeight - 152)), canManage });
  };
  const copyChatMessage = async () => {
    if (!chatMenu) return;
    try {
      await navigator.clipboard.writeText(chatBodyAsText(chatMenu.message.body));
      setChatHint("채팅글을 복사했어요.");
    } catch {
      setChatHint("복사하지 못했어요. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
    closeChatMenu();
  };
  const [pinOpen, setPinOpen] = useState(false);
  const pinTextRef = useRef<HTMLSpanElement | null>(null);
  const [banConfirm, setBanConfirm] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const hasChat = (chat?.messages.length ?? 0) > 0;
  const chatColorMap = useMemo(() => chatColors(chat?.messages ?? []), [chat?.messages]);
  // 80개 상한에서도 내용 변경·그림 로드·화면 크기를 추적. 사용자가 지난 글을 읽을 때만 멈춘다.
  const { boxRef: chatBoxRef, contentRef: chatContentRef, atBottom: chatAtBottom, followLatest: chatToBottom } = useChatAutoScroll(
    chat?.messages, `${isDesktop}:${focus}:${chatView.size}:${chatView.height}:${chatView.bold}`,
    Boolean(chat && (hasChat || isDesktop)),
  );
  useEffect(() => {
    if (!chatHint) return;
    const t = window.setTimeout(() => setChatHint(""), 3000);
    return () => window.clearTimeout(t);
  }, [chatHint]);
  const productPickerOpen = Boolean(chat?.canModerate && draft.trimStart().startsWith("/"));
  const sendChat = async (bodyOverride?: string, target?: ChatProductSelection) => {
    if (!chat || sending) return;
    const body = (bodyOverride ?? draft).trim();
    if (!body) return;
    // Keep a batch selection visible until the server confirms it; retries retain the checks.
    const batch = target && "targets" in target;
    setSending(true);
    setComposeHint("");
    if (!batch) { setDraft(""); setComposeOpen(false); }
    closeGreet();
    const commandTarget = batch && target.mode === "replace" ? { ...target, intro: await introPlayer.capture() } : target;
    const r = await chat.onSend(body, commandTarget).catch(() => ({ ok: false, message: "못 보냈어요. 다시 눌러 주세요." }));
    if (r.ok && batch && target.mode === "replace" && props.broadcastId) {
      invalidateProductIntroCatalog(props.broadcastId, videoId);
      void loadProductIntroCatalog(props.broadcastId, videoId).catch(() => {});
    }
    setSending(false);
    if (r.ok && r.message) setChatHint(r.message);
    if (batch) {
      if (r.ok) { setDraft(""); setComposeOpen(false); }
      else setComposeHint(r.message || "못 보냈어요. 선택을 유지했으니 다시 눌러 주세요.");
    } else if (!r.ok) { setDraft(body); setChatHint(r.message || "못 보냈어요."); }
  };
  // [2026-11-10 04:17 사장님] 화면 빈 곳(영상)을 누르면 «돌려보기 모드» — 채팅·카드가 흐려지고 손가락이 그대로 유튜브 막대로 감.
  //   영상은 유튜브 화면(다른 사이트)이라 누른 걸 직접 못 듣는다 → 누르면 그 화면으로 «포커스»가 넘어가는 순간(창 blur)을 보고 안다.
  //   4초 동안 더 안 누르면 원래대로. 다음 누름도 알아채려고 포커스를 우리 화면으로 바로 돌려 놓는다.
  //   [04:33 보정] 돌려보기 중 한 번 더 빈 곳을 누르면 바로 원래대로(유튜브 앱처럼). 막대를 끌거나 멈춤/재생을 누른 것과 구별하려고
  //   누른 뒤 1.2초 동안 재생 위치·상태가 «건너뛰었는지» 본다 — 건너뛰었으면 막대 조작(돌려보기 유지), 그대로면 빈 곳 누름(원래대로).
  // [09:22 사장님 「터치가 먹혔다 안 먹혔다 · 어두워지는데 재생바 안 나옴」] 원인: 유튜브 화면을 누른 걸 «포커스가 넘어갔는지»로
  //   짐작했고, 유튜브 막대는 유튜브가 따로 켜고 끄니(누를 때마다 켬/끔·3초 뒤 저절로 숨김) 우리 어두운 화면과 자주 어긋났음.
  //   이제 유튜브 막대는 끄고(controls=0), 영상 위 투명 판이 누름을 직접 받아 «우리 막대»(재생 위치·멈춤/재생·10초 앞뒤)를 띄움 → 늘 같이 움직임.
  //   한 번 누르면 켜짐, 다시 누르면 꺼짐, 3.5초 손 안 대면 꺼짐(멈춤 중엔 계속 보임).
  const [seekMode, setSeekMode] = useState(false);
  const seekTimer = useRef(0);
  const pausedRef = useRef(false);
  const clearSeekTimer = () => { if (seekTimer.current) { window.clearTimeout(seekTimer.current); seekTimer.current = 0; } };
  const restartSeekTimer = () => {
    clearSeekTimer();
    seekTimer.current = window.setTimeout(() => {
      seekTimer.current = 0;
      if (pausedRef.current) return; // 멈춤 중엔 막대 그대로
      setSeekMode(false);
    }, 3500);
  };
  const toggleSeek = () => {
    if (seekMode) { clearSeekTimer(); setSeekMode(false); return; }
    setSeekMode(true);
    restartSeekTimer();
  };
  useEffect(() => () => clearSeekTimer(), []);
  // 실시간 채팅에서 인사하기(유튜브처럼)
  //   [07:42 사장님 「한 번 나오고 안 나옴 · 유튜브와 같게」] 원인: 기록을 «유튜브 영상 번호»로 해서, 같은 라이브 주소를 계속 쓰면
  //   예전 방송에서 한 번 쓴 기록이 남아 안 떴고, 1분 지나면 저절로 숨겼음.
  //   이제 유튜브처럼 — «이 방송»(방송 번호)에서 아직 글을 안 쓴 손님이면 방송 화면에 들어올 때마다 뜨고, 글을 한 번 쓰면(인사 포함) 그 방송에선 안 뜸.
  //   저절로 숨기지 않음. 새 방송이면 다시 뜸.
  const greetKey = `ruru_live_greet_${props.broadcastId || videoId}`;
  const [greetOpen, setGreetOpen] = useState(false);
  useEffect(() => {
    let done = false;
    try { done = window.localStorage.getItem(greetKey) === "1"; } catch { /* 무시 */ }
    if (done) { setGreetOpen(false); return; }
    const t1 = window.setTimeout(() => setGreetOpen(true), 1500);
    return () => { window.clearTimeout(t1); };
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
    if (m.deletedByAuthor || m.privateCommand || (!chat?.canModerate && !chat?.ownIds?.includes(m.id))) return;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      if (chat?.canModerate) setModTarget(m);
      else openChatMenu(m, downAt.current?.x ?? 16, downAt.current?.y ?? window.innerHeight - 160, false);
    }, 500);
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
  // 유튜브 자막 끄기 명령 묶음(자막 모듈 내리기 + 자막 언어 비우기). 실패해도 무시.
  const ccOffAt = useRef(0);
  const captionsOff = () => {
    sendToPlayer(JSON.stringify({ event: "command", func: "unloadModule", args: ["captions"] }));
    sendToPlayer(JSON.stringify({ event: "command", func: "unloadModule", args: ["cc"] }));
    sendToPlayer(JSON.stringify({ event: "command", func: "setOption", args: ["captions", "track", {}] }));
  };
  // ── 돌려보다가 「실시간으로 돌아가기」 ──
  //   유튜브 재생 정보(infoDelivery)가 재생 막대와 같은 실시간 허용 범위를 벗어나면 버튼을 띄운다.
  //   실시간 이동은 막대를 끝으로 끌 때처럼 seekTo, 영상 새로고침은 별도 버튼으로 처리한다.
  const [reloadKey, setReloadKey] = useState(0);
  const liveResume = useLiveResume(iframeRef, `${videoId}:${reloadKey}`);
  const introPlayer = useProductIntroPlayer(iframeRef, videoId, reloadKey, props.introReplay, liveResume.onAction);
  // Dismiss only this banner; keep the replay controller and playback intact.
  const [dismissedIntroKey, setDismissedIntroKey] = useState<number | null>(null);
  const showIntroBanner = Boolean(props.introReplay && props.introReplay.key !== dismissedIntroKey);
  // Each entry/new player starts muted. Dismiss the large prompt only after
  // this iframe confirms unmute; a later deliberate mute keeps just the icon.
  useEffect(() => {
    setMuted(true);
    setSoundPromptDone(false);
    const onSoundMessage = (e: MessageEvent) => {
      if (e.origin !== "https://www.youtube.com" || e.source !== iframeRef.current?.contentWindow) return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if ((data?.event === "infoDelivery" || data?.event === "initialDelivery") && typeof data.info?.muted === "boolean") {
          setMuted(data.info.muted);
          if (!data.info.muted) setSoundPromptDone(true);
        }
      } catch { /* Ignore unrelated/malformed player messages. */ }
    };
    window.addEventListener("message", onSoundMessage);
    return () => window.removeEventListener("message", onSoundMessage);
  }, [videoId, reloadKey]);
  // [09:08 사장님 「좌우 여백」] 화면이 9:16 보다 넓으면(카톡 브라우저 등) 세로 영상 좌우에 검은 띠 → 영상을 그만큼 키워 꽉 채움(위아래 조금 잘림, 최대 1.12배).
  // 돌려보기 중엔 원래 크기(유튜브 막대가 잘리지 않게).
  const [videoScale, setVideoScale] = useState(1);
  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const s = w / (h * 9 / 16);
      setVideoScale(s > 1.005 ? Math.min(1.12, s) : 1);
    };
    calc();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(calc) : null;
    ro?.observe(el);
    window.addEventListener("resize", calc);
    return () => { ro?.disconnect(); window.removeEventListener("resize", calc); };
  }, [videoId, reloadKey]);
  const [behindLive, setBehindLive] = useState(false);
  // [08:35 사장님 「녹화 영상인데 왜 실시간으로 돌아가기가 떠」] 녹화 영상은 길이(duration) 전체가 끝이라 늘 «30초 넘게 뒤»로 잡혔음.
  //   이제 «진짜 라이브»일 때만: 유튜브가 알려 주는 isLive, 또는 영상 길이가 시간 따라 계속 늘어날 때(라이브는 길이가 자람).
  const playerInfo = useRef<{ t: number; d: number; state: number; live: boolean; d0: number; d0at: number; seekableEnd: number | null; atLiveHead: boolean | null }>({ t: 0, d: 0, state: -1, live: false, d0: 0, d0at: 0, seekableEnd: null, atLiveHead: null });
  const lastTick = useRef<{ t: number; at: number; state: number }>({ t: 0, at: 0, state: -1 });
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== "https://www.youtube.com" || e.source !== iframeRef.current?.contentWindow) return;
      let data: { event?: string; info?: Record<string, unknown> } | null = null;
      try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
      if (!data || data.event !== "infoDelivery" || !data.info) return;
      // [13:28 사장님 「아직도 자막 나옴」] 처음 40초만 끄던 것 → 재생 정보가 올 때마다(5초에 한 번까지) 계속 끔.
      //   라이브는 중간에 유튜브가 자동 자막을 새로 만들어 붙이거나 다시 연결하며 자막이 되살아날 수 있음.
      const nowCc = Date.now();
      if (nowCc - ccOffAt.current > 5000) { ccOffAt.current = nowCc; captionsOff(); }
      const info = data.info;
      const cur = playerInfo.current;
      if (typeof info.currentTime === "number") {
        // 재생 위치 기억(우리 막대가 0.25초마다 이걸로 지금 위치를 셈)
        const now = Date.now();
        lastTick.current = { t: info.currentTime, at: now, state: typeof info.playerState === "number" ? info.playerState : cur.state };
        cur.t = info.currentTime;
      }
      if (typeof info.duration === "number") {
        cur.d = info.duration;
        const nowMs = Date.now();
        if (!cur.d0at) { cur.d0 = info.duration; cur.d0at = nowMs; }
        else if (nowMs - cur.d0at > 4000 && info.duration - cur.d0 >= 2) cur.live = true; // 4초 넘게 지나 길이가 2초 넘게 늘었음 = 라이브
      }
      const vd = info.videoData as { isLive?: unknown } | undefined;
      if (typeof vd?.isLive === "boolean") cur.live = vd.isLive;
      if (typeof info.playerState === "number") { cur.state = info.playerState; pausedRef.current = info.playerState === 2; }
      // 실제 라이브 응답에서 duration(5767초)과 이동 가능한 끝(2170초)이 달랐다.
      // progressState는 현재 DVR 범위와 실제 실시간 도착 여부. 부분 응답에서도 마지막 값을 유지한다.
      const progress = info.progressState as { seekableEnd?: unknown; isAtLiveHead?: unknown } | undefined;
      if (typeof progress?.seekableEnd === "number" && Number.isFinite(progress.seekableEnd) && progress.seekableEnd > 0) cur.seekableEnd = progress.seekableEnd;
      if (typeof progress?.isAtLiveHead === "boolean") cur.atLiveHead = progress.isAtLiveHead;
      const end = cur.seekableEnd ?? cur.d;
      const behind = cur.live && [1, 2, 3].includes(cur.state) && end > 0 && cur.t >= 0 &&
        (cur.atLiveHead !== null ? !cur.atLiveHead : end - cur.t >= LIVE_EDGE_TOLERANCE_SECONDS);
      setBehindLive((prev) => (prev === behind ? prev : behind));
      if (e.origin === "https://www.youtube.com" && e.source === iframeRef.current?.contentWindow) liveResume.onInfo(info);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  const listenPlayer = () => {
    lastTick.current = { t: 0, at: 0, state: -1 };
    // 플레이어에게 «재생 정보 보내 줘» 요청(몇 번 시도 — 준비가 늦을 수 있음)
    [300, 1500, 4000].forEach((ms) => window.setTimeout(() => sendToPlayer(JSON.stringify({ event: "listening", id: 1, channel: "widget" })), ms));
    // [13:18 사장님 캡처] 유튜브 자동 자막이 저절로 켜져 채팅 위에 겹침 → 자막 모듈 끄기(손님 유튜브 계정 설정이 켜져 있어도).
    //   플레이어 준비가 늦거나 라이브 중 자막이 다시 붙을 수 있어 여러 번 보냄(명령만 — 실패해도 무시)
    [800, 2500, 6000, 15000, 40000].forEach((ms) => window.setTimeout(captionsOff, ms));
  };
  const reloadPlayer = () => {
    playerInfo.current = { t: 0, d: 0, state: -1, live: false, d0: 0, d0at: 0, seekableEnd: null, atLiveHead: null };
    lastTick.current = { t: 0, at: 0, state: -1 };
    setBehindLive(false);
    setMuted(true);
    setReloadKey((k) => k + 1);
  };
  const backToLive = () => {
    const { live, d, seekableEnd } = playerInfo.current;
    const target = seekableEnd ?? Math.max(0, d - 1);
    if (!live || !Number.isFinite(target) || target <= 0) return;
    introPlayer.cancel();
    props.onEndIntroReplay?.();
    liveResume.onAction("live");
    // 최신 재생 가능 끝으로 이동. 1초를 빼면 유튜브가 DVR 재생으로 남길 수 있다.
    sendToPlayer(youtubeCommand("seekTo", [target, true]));
    sendToPlayer(youtubeCommand("playVideo"));
    // 소리·플레이어를 유지하고, 실시간 도착 표시는 실제 infoDelivery 응답으로만 갱신한다.
  };

  const turnSoundOn = () => {
    liveResume.onAction("playVideo");
    sendToPlayer(youtubeCommand("unMute"));
    sendToPlayer(youtubeCommand("playVideo"));
    setMuted(false);
  };

  const listItems = useMemo(() => liveWatchList(items, query), [items, query]);
  const totalCount = useMemo(() => items.reduce((n, it) => n + (it.count && it.count > 0 ? it.count : 1), 0), [items]);
  const thumbUrl = (pinned?.imageUrl || items.find((it) => it.pinned)?.imageUrl || items.find((it) => it.imageUrl)?.imageUrl || "");
  const latestToast = orderToasts.length > 0 ? orderToasts[orderToasts.length - 1] : null;

  const closeGuide = () => { writeGuideSeen(); setGuideOpen(false); };

  // 사장님 유튜브 비교 화면처럼 넓은 PC에서는 채팅에 약 1/3을 배정한다.
  const desktopChatWidth = "max(400px, 35%)";
  const videoRight = isDesktop && !focus ? desktopChatWidth : 0;
  const pinnedProductCard = (pinned ? (
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
        ) : null);
  // 한 벌의 입력 폼을 PC 채팅 아래 또는 폰 쓰기 시트에만 렌더한다.
  const composer = (
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); if (composingRef.current || productPickerOpen) return; if (draftEmojiCount > EMOJI_MAX_PER_MSG) { setComposeHint(`이모티콘은 한 번에 ${EMOJI_MAX_PER_MSG}개까지예요.`); return; } setEmojiOpen(false); void sendChat(); }}
            style={{ width: "100%", maxWidth: "560px", margin: "0 auto", background: isDesktop ? "#0F0F0F" : "#FFFFFF", padding: isDesktop ? "12px 0 calc(12px + env(safe-area-inset-bottom))" : emojiOpen ? "12px 16px 0" : "12px 16px calc(12px + env(safe-area-inset-bottom))", borderRadius: isDesktop ? 0 : "16px 16px 0 0", boxSizing: "border-box", ...(isDesktop ? { position: "relative", flexShrink: 0, order: 5, borderTop: "1px solid #333333", pointerEvents: "auto" } : {}) }}
          >
            {chat?.canWrite && chat.onVerifyIdentity && !chat.identityVerified && !chat.canReviewDeleted ? <button type="button" onClick={chat.onVerifyIdentity} style={{ marginBottom: 8, background: "transparent", color: isDesktop ? "#bbb" : "#555", border: 0, padding: "4px 8px", fontSize: 12, textDecoration: "underline" }}>내 글 삭제 · 카카오 본인 확인</button> : null}
            {productPickerOpen && props.broadcastId ? <ChatProductPicker broadcastId={props.broadcastId} query={draft.trimStart().slice(1)} busy={sending} onClose={() => setDraft("")} onApply={(products, mode) => { setEmojiOpen(false); void sendChat(`/선택 상품 ${products.length}개`, { targets: products.map(p => ({ productId: p.productId, detailName: p.detailName })), mode }); }} /> : null}
            {draftEmojiCount > 0 ? (
              // 보내면 이렇게 보여요 — «:이름:» 글자 대신 그림으로 미리
              <div aria-label="미리보기" style={{ marginBottom: "8px", padding: "8px 12px", borderRadius: "12px", background: "#F5F5F5", color: "#111111", fontSize: "15px", lineHeight: 1.45, wordBreak: "break-word" }}>
                <ChatBodyView body={encodeEmojiTokens(draft, emojiItems).text} emojis={emojiMap} />
              </div>
            ) : null}
            {composeHint ? <div role="status" style={{ marginBottom: "8px", fontSize: "13px", fontWeight: 600, color: "#D30005" }}>{composeHint}</div> : null}
            {showSuggestRow && !productPickerOpen ? (
              // 쓰고 있는 낱말에 어울리는 이모티콘 — 누르면 커서 자리에 넣음(키보드 안 내려감)
              <div role="group" aria-label={`「${typedWord}」 어울리는 이모티콘`} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "8px", background: "#F5F5F5", borderRadius: "12px", padding: "2px 2px 2px 6px" }}>
                <div ref={suggestRowRef} data-live-scroll="1" style={{ flex: 1, minWidth: 0, display: "flex", gap: "2px", overflowX: "auto", overscrollBehavior: "contain", scrollbarWidth: "none" }}>
                  {wordSuggests.map((e, index) => (
                    <button
                      key={e.id}
                      type="button"
                      onPointerDown={(ev) => ev.preventDefault()}
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => insertSuggested(e)}
                      onFocus={() => setKeyboardEmojiId(e.id)}
                      onBlur={() => setKeyboardEmojiId(null)}
                      onKeyDown={isDesktop ? (ev) => {
                        if (ev.nativeEvent.isComposing || composingRef.current || ev.keyCode === 229) { if (ev.key === "Enter") ev.preventDefault(); return; }
                        if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") { ev.preventDefault(); focusSuggestion(index + (ev.key === "ArrowLeft" ? -1 : 1)); }
                        else if (ev.key === "Escape" || ev.key === "ArrowDown") { ev.preventDefault(); inputRef.current?.focus(); }
                        else if (ev.key === "ArrowUp") ev.preventDefault();
                        else if (ev.key === "Enter") {
                          ev.preventDefault();
                          if (sending || ev.repeat) return;
                          const next = insertEmoji(e);
                          inputRef.current?.focus();
                          // setDraft 직후의 이전 글을 보내지 않도록 완성한 본문을 같은 전송 함수에 전달.
                          if (next !== undefined) void sendChat(next);
                        }
                      } : undefined}
                      aria-label={`이모티콘 ${e.name} 넣기`}
                      title={isDesktop ? `${e.name} · ← → 선택 · Enter 전송` : e.name}
                      style={{ flexShrink: 0, width: "52px", height: "52px", border: "none", borderRadius: "10px", background: keyboardEmojiId === e.id ? "#E0E7FF" : "transparent", outline: keyboardEmojiId === e.id ? "2px solid #2563EB" : undefined, outlineOffset: "-2px", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={e.url} alt="" draggable={false} style={{ width: "44px", height: "44px", objectFit: "contain", pointerEvents: "none" }} />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onPointerDown={(ev) => ev.preventDefault()}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => setSuggestHiddenFor(typedWord)}
                  aria-label="추천 이모티콘 닫기"
                  style={{ flexShrink: 0, width: "44px", height: "44px", border: "none", background: "transparent", color: "#707072", fontSize: "18px", lineHeight: 1, cursor: "pointer", padding: 0 }}
                >
                  ✕
                </button>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0, height: "48px", boxSizing: "border-box", border: isDesktop ? "1px solid #555555" : "1px solid #E5E5E5", borderRadius: "9999px", display: "flex", alignItems: "center", background: isDesktop ? "#272727" : "#FFFFFF" }}>
                <input
                  ref={inputRef}
                  data-live-chat-input
                  autoFocus={!isDesktop && !emojiOpen}
                  value={draft}
                  readOnly={sending && productPickerOpen}
                  onChange={(e) => { setDraft(e.target.value.slice(0, LIVE_CHAT_MAX_LEN)); if (e.target.value.trimStart().startsWith("/")) setEmojiOpen(false); rememberCaret(e.target); }}
                  onSelect={(e) => rememberCaret(e.currentTarget)}
                  onFocus={() => setEmojiOpen(false)}
                  onKeyDown={isDesktop ? (e) => {
                    if (e.nativeEvent.isComposing || composingRef.current || e.keyCode === 229) { if (e.key === "Enter") e.preventDefault(); return; }
                    if (e.key === "Enter" && e.repeat) { e.preventDefault(); return; }
                    if (e.key === "ArrowUp" && showSuggestRow) { e.preventDefault(); rememberCaret(e.currentTarget); focusSuggestion(0); }
                    if (e.key === "Escape") { setEmojiOpen(false); inputRef.current?.focus(); }
                  } : undefined}
                  onCompositionStart={() => { composingRef.current = true; }}
                  onCompositionEnd={() => { composingRef.current = false; }}
                  placeholder="채팅 입력"
                  aria-label="채팅 메시지"
                  enterKeyHint="send"
                  maxLength={LIVE_CHAT_MAX_LEN}
                  style={{ flex: 1, minWidth: 0, height: "100%", padding: canEmoji ? "0 4px 0 16px" : "0 16px", border: "none", borderRadius: "9999px", fontSize: "16px", fontFamily: "inherit", outline: "none", color: isDesktop ? "#FFFFFF" : "#111111", background: "transparent" }}
                />
                {canEmoji ? (
                  <button
                    type="button"
                    aria-label={emojiOpen ? (isDesktop ? "이모티콘 닫기" : "키보드") : "이모티콘"}
                    aria-pressed={emojiOpen}
                    onClick={() => {
                      if (emojiOpen) { setEmojiOpen(false); inputRef.current?.focus(); }
                      else { if (inputRef.current) rememberCaret(inputRef.current); inputRef.current?.blur(); setEmojiOpen(true); }
                    }}
                    style={{ flexShrink: 0, width: "44px", height: "44px", border: "none", background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                  >
                    <IconSmile color={isDesktop ? "#FFFFFF" : emojiOpen ? "#111111" : "#707072"} />
                  </button>
                ) : null}
              </div>
              <button type="submit" disabled={sending || productPickerOpen || !draft.trim()} style={{ flexShrink: 0, height: "48px", padding: "0 18px", border: "none", borderRadius: "9999px", background: isDesktop ? (sending || productPickerOpen || !draft.trim() ? "#272727" : "#FFFFFF") : sending || productPickerOpen || !draft.trim() ? "#E5E5E5" : "#111111", color: isDesktop ? (sending || productPickerOpen || !draft.trim() ? "#AAAAAA" : "#111111") : sending || productPickerOpen || !draft.trim() ? "#707072" : "#FFFFFF", fontSize: "15px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
                {sending ? "보내는 중" : "보내기"}
              </button>
            </div>
            {emojiOpen && canEmoji ? (
              <div style={{ margin: isDesktop ? 0 : "12px -16px 0", borderTop: "1px solid #E5E5E5", ...(isDesktop ? { position: "absolute", left: 0, right: 0, bottom: "calc(100% + 8px)", zIndex: 4, background: "#FFFFFF", borderRadius: "12px", overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" } : {}) }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px 0" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#111111" }}>루루동이 이모티콘</span>
                  <span style={{ fontSize: "13px", color: "#707072" }}>{draftEmojiCount}/{EMOJI_MAX_PER_MSG}</span>
                </div>
                <div data-live-scroll="1" style={{ height: "232px", overflowY: "auto", overscrollBehavior: "contain", padding: "8px 12px calc(12px + env(safe-area-inset-bottom))", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))", gap: "4px", alignContent: "start" }}>
                  {/* 쓰다 만 낱말이 있으면 맨 위에 어울리는 것부터(카톡 이모티콘 «검색»처럼) */}
                  {wordSuggests.length > 0 ? (
                    <>
                      <div style={{ gridColumn: "1 / -1", fontSize: "13px", fontWeight: 600, color: "#707072", padding: "2px 4px 0" }}>「{typedWord}」 어울리는 이모티콘</div>
                      {wordSuggests.map((e) => (
                        <button key={`s-${e.id}`} type="button" onClick={() => insertEmoji(e)} aria-label={`이모티콘 ${e.name}`} title={e.name} style={{ height: "60px", border: "none", borderRadius: "12px", background: "#F5F5F5", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={e.url} alt="" draggable={false} style={{ width: "48px", height: "48px", objectFit: "contain" }} />
                        </button>
                      ))}
                      <div style={{ gridColumn: "1 / -1", fontSize: "13px", fontWeight: 600, color: "#707072", padding: "6px 4px 0" }}>전체</div>
                    </>
                  ) : null}
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
  );

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="region"
      aria-label="방송 보며 주문"
      // [07:32 사장님] 채팅 그림(이모티콘·프로필)을 꾹 눌러도 «이미지 저장» 창이 안 뜨게 — 그림에서만 막음(글자 입력칸 붙여넣기는 그대로)
      onContextMenu={(e) => { if ((e.target as HTMLElement | null)?.tagName === "IMG") e.preventDefault(); }}
      style={{ WebkitTouchCallout: "none", position: "fixed", inset: 0, zIndex: 60, background: "#000000", color: "#FFFFFF", overflow: "hidden", fontFamily: LIVE_FONT, textRendering: "optimizeLegibility", overscrollBehavior: "none", outline: "none" }}
    >
      {/* PC 영상 영역 / 폰은 기존 화면 전체 배치 */}
      <div data-live-video="1" style={isDesktop ? { position: "absolute", left: 0, right: videoRight, top: 0, bottom: 0, overflow: "hidden" } : { display: "contents" }}>
      <iframe
        ref={iframeRef}
        key={`${videoId}-${reloadKey}`}
        onLoad={listenPlayer}
        src={embedSrc}
        title={`${title || "라이브 방송"} 영상`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        style={{ position: "absolute", left: 0, right: 0, top: 0, width: "100%", height: freezeVideo ? `calc(${videoBaseH.current}px - 84px - env(safe-area-inset-bottom))` : "calc(100% - 84px - env(safe-area-inset-bottom))", border: 0, background: "#000000", transform: isDesktop || videoScale === 1 ? "none" : `scale(${videoScale})`, transformOrigin: "50% 50%", transition: "transform 0.2s" }}
      />

      {/* 위 줄 — LIVE·제목 / 방송 화면 닫기(→ 상품 사진으로 보는 화면) */}
      {/* 돌려보기 중 — 영상 전체를 반투명 검정으로 어둡게(유튜브 막대는 빨강·흰색이라 그대로 보임) */}
      <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, pointerEvents: "none", background: "rgba(0,0,0,0.45)", opacity: seekMode ? 1 : 0, transition: "opacity 0.2s" }} />
      {/* 영상 위 투명 판 — 빈 곳 누름을 우리가 직접 받음(유튜브로 손가락이 안 감) */}
      <div aria-hidden="true" onClick={toggleSeek} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, background: "transparent", WebkitTapHighlightColor: "transparent" }} />
      {seekMode ? (
        <LiveSeekControls
          getPos={() => {
            const cur = playerInfo.current;
            const tick = lastTick.current;
            const t = tick.at > 0 && cur.state === 1 ? tick.t + (Date.now() - tick.at) / 1000 : cur.t;
            const d = cur.live ? (cur.seekableEnd ?? cur.d) : cur.d;
            return { t: d > 0 ? Math.min(t, d) : t, d, playing: cur.state === 1, live: cur.live, atLiveHead: cur.atLiveHead };
          }}
          send={(func, args) => { liveResume.onAction(func, args); sendToPlayer(youtubeCommand(func, args || [])); }}
          onHold={(hold) => { if (hold) clearSeekTimer(); else restartSeekTimer(); }}
        />
      ) : null}
      {props.introReplay && showIntroBanner ? (
        <div data-product-intro-replay style={{ position: "absolute", top: "calc(84px + env(safe-area-inset-top))", left: 12, right: 12, margin: "0 auto", maxWidth: 440, borderRadius: 14, background: "rgba(17,17,17,0.92)", padding: 12, zIndex: 3, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13, color: "#FFFFFF" }}>
          <button type="button" aria-label="소개영상 배너 닫기" title="배너만 닫기 · 영상은 계속 재생" onClick={() => setDismissedIntroKey(props.introReplay!.key)} style={{ position: "absolute", top: 6, right: 6, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 10, background: "transparent", color: "#FFFFFF", cursor: "pointer" }}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <div data-product-intro-summary style={{ flex: "1 1 100%", minWidth: 0, paddingRight: 38, display: "flex", alignItems: "center", gap: 10 }}>
            {props.introReplay.imageUrl ? <img key={props.introReplay.imageUrl} data-product-intro-photo src={props.introReplay.imageUrl} alt={props.introReplay.name} width={44} height={44} onError={event => { event.currentTarget.style.display = "none"; }} style={{ width: 44, height: 44, flexShrink: 0, objectFit: "contain", borderRadius: 8, background: "#FFFFFF" }} /> : null}
            <div style={{ minWidth: 0, flex: 1, lineHeight: 1.5 }}>
              <div title={props.introReplay.name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>{props.introReplay.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 8 }}>
                {props.introReplay.priceText ? <strong data-product-intro-price style={{ whiteSpace: "nowrap" }}>{props.introReplay.priceText}</strong> : null}
                <span role="status" style={{ fontSize: 12, color: "#DDDDDD" }}>{introPlayer.status === "loading" ? "소개영상으로 이동 중…" : introPlayer.status === "unavailable" ? "소개영상 재생 불가" : "소개영상 보는 중"}</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={props.onReturnToProduct} style={{ flex: "1 1 0", minWidth: 0, minHeight: 44, alignSelf: "stretch", wordBreak: "keep-all", padding: "8px 10px", lineHeight: 1.35, borderRadius: 10, border: "1px solid #FFFFFF", background: "#FFFFFF", color: "#111111", font: "inherit", fontWeight: 700, cursor: "pointer" }}><span aria-hidden="true">← </span>상품 선택으로 돌아가기</button>
          {behindLive ? <button type="button" onClick={backToLive} style={{ flex: "1 1 0", minWidth: 0, minHeight: 44, alignSelf: "stretch", wordBreak: "keep-all", padding: "8px 10px", lineHeight: 1.35, borderRadius: 10, border: "1px solid #999999", background: "#333333", color: "#FFFFFF", font: "inherit", fontWeight: 600, cursor: "pointer" }}><span aria-hidden="true">● </span>실시간 방송으로 돌아가기</button> : null}
        </div>
      ) : null}
      <div data-live-seek={seekMode ? "1" : "0"} style={{ position: "absolute", left: 0, right: 0, top: 0, padding: "calc(8px + env(safe-area-inset-top)) 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", background: "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0))", pointerEvents: "none", opacity: seekMode ? 0 : 1, transition: "opacity 0.2s" }}>
        {/* [07:32 사장님 「숫자 넣으니 제목이 사라짐」] 첫 줄 LIVE·숫자, 둘째 줄 제목(제목이 늘 보이게) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px", minWidth: 0 }}>
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
          <span style={{ maxWidth: "100%", fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>{title || "라이브 방송"}</span>
        </div>
          {/* 오른쪽 위 — 오늘만셀러처럼 그림만: 새로고침 · 소리 · 닫기(X = 상품 사진으로 보는 쇼핑몰 화면) */}
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0, pointerEvents: "auto", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }}>
            {/* 집중모드 — 채팅·버튼을 숨기고 방송만(오늘만셀러 눈 그림) */}
            <button type="button" onClick={() => { const next = !focus; setFocus(next); setChatHint(next ? "집중모드 — 채팅을 숨겼어요. 눈을 다시 누르면 보여요." : "채팅을 다시 보여 드려요."); }} aria-label={focus ? "집중모드 끄기" : "집중모드 켜기"} aria-pressed={focus} style={TOP_ICON_BTN}>
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{focus ? <path d="M4 4l16 16" /> : null}</svg>
            </button>
            <button type="button" onClick={reloadPlayer} aria-label="방송 새로고침" style={TOP_ICON_BTN}>
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

      {!soundPromptDone && !guideOpen ? (
        <div style={{ position: "absolute", left: "16px", right: "16px", top: showIntroBanner ? "max(calc(232px + env(safe-area-inset-top)), 25%)" : "max(100px, 25%)", display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 3 }}>
          <button type="button" aria-label="방송 소리 켜기" onClick={turnSoundOn}
            style={{ minWidth: "192px", minHeight: "60px", padding: "12px 24px", border: "1px solid rgba(255,255,255,0.7)", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", boxShadow: "0 4px 24px rgba(0,0,0,0.45)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", fontSize: "20px", fontWeight: 700, fontFamily: "inherit", cursor: "pointer", pointerEvents: "auto" }}>
            <IconSoundOn color="#111111" />소리 켜기
          </button>
        </div>
      ) : null}

      {/* 돌려보는 중 → 지금 방송으로 */}
      {/* 실시간 스트림으로 건너뛰기 — 유튜브 라이브처럼 오른쪽 아래 흰 알약(돌려보기 중에도 보임) */}
      {!showIntroBanner && (behindLive || liveResume.needsTap) ? (
        <button type="button" onClick={backToLive} style={{ position: "absolute", right: "12px", bottom: "calc(140px + env(safe-area-inset-bottom))", height: "40px", padding: "0 16px", border: "none", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "14px", fontWeight: 600, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap", zIndex: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>
          <svg aria-hidden="true" width="18" height="14" viewBox="0 0 18 14" fill="#111111"><path d="M0 0l8 7-8 7zM9 0l8 7-8 7z" /></svg>{liveResume.needsTap ? "눌러서 실시간 방송 재생" : "실시간 스트림으로 건너뛰기"}
        </button>
      ) : null}

      {/* 잠시 쉬는 중 — 주문은 그대로 */}
      {paused ? (
        <div role="status" style={{ position: "absolute", left: "16px", right: "16px", top: "40%", textAlign: "center", pointerEvents: "none", opacity: settling ? 0 : 1, transition: "opacity 0.2s" }}>
          <span style={{ display: "inline-block", padding: "12px 18px", borderRadius: "12px", background: "rgba(0,0,0,0.6)", fontSize: "15px", fontWeight: 600, lineHeight: 1.5 }}>
            {pausedText}<br /><span style={{ fontSize: "13px", fontWeight: 400, color: "#E5E5E5" }}>상품은 지금도 담을 수 있어요</span>
          </span>
        </div>
      ) : null}

      {isDesktop && !focus ? (
        <div data-live-seek={seekMode ? "1" : "0"} style={{ position: "absolute", left: "16px", right: "16px", bottom: "calc(90px + env(safe-area-inset-bottom))", maxWidth: "560px", margin: "0 auto", opacity: seekMode ? 0.06 : 1, transition: "opacity 0.2s" }}>
          {pinnedProductCard}
        </div>
      ) : null}
      </div>

      {/* 아래쪽 — 채팅 · 주문 알림 · 소개 중 상품 카드(돌려보기 중엔 숨김 — 유튜브 막대를 가리지 않게) */}
      {/* 돌려보기 모드 — 안의 모든 것이 손가락을 막지 않게(유튜브 막대로 그대로) */}
      <style>{`[data-live-seek="1"], [data-live-seek="1"] * { pointer-events: none !important; }`}</style>
      <style>{`html, body { overflow: hidden !important; overscroll-behavior: none !important; }`}</style>
      {/* 13:03 사장님 유튜브 캡처 11장 실측: 유튜브도 채팅 뒤(화면 아래 약 45%)를 위에서 아래로 점점 어둡게 깖
          (흰 털 화면 밝기 206 → 맨 아래 80 ≈ 검정 60%). 채팅 칸 위부터만, 손가락 통과, 집중모드·돌려보기엔 숨김 */}
      <div aria-hidden="true" style={{ display: isDesktop || focus || seekMode ? "none" : "block", position: "absolute", left: 0, right: 0, bottom: 0, height: `calc(${CHAT_HEIGHTS[chatView.height]} + 170px + env(safe-area-inset-bottom))`, background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.22) 30%, rgba(0,0,0,0.45) 65%, rgba(0,0,0,0.6) 100%)", pointerEvents: "none" }} />
      <div data-live-chat-panel="1" data-live-seek={!isDesktop && seekMode ? "1" : "0"} style={{ display: focus ? "none" : "flex", position: "absolute", left: isDesktop ? "auto" : "16px", right: isDesktop ? 0 : "16px", bottom: isDesktop ? 0 : "calc(90px + env(safe-area-inset-bottom))", flexDirection: "column", gap: "8px", pointerEvents: isDesktop ? "auto" : "none", opacity: !isDesktop && seekMode ? 0.06 : 1, transition: "opacity 0.2s", ...(isDesktop ? { top: 0, width: desktopChatWidth, padding: "0 16px", boxSizing: "border-box", borderLeft: "1px solid #333333", background: "#0F0F0F", minHeight: 0 } : {}) }}>
        {isDesktop ? <div style={{ flexShrink: 0, padding: "20px 0 16px", borderBottom: "1px solid #333333", fontSize: "16px", fontWeight: 600 }}>실시간 채팅</div> : null}
        {latestToast ? (
          <div role="status" aria-atomic="true" style={{ display: "flex", flexShrink: 0 }}>
            <span key={latestToast.key} className="ruru-live-watch-toast" style={{ display: "inline-flex", alignItems: "center", height: "32px", maxWidth: "100%", padding: "0 12px", borderRadius: "9999px", background: "rgba(0,0,0,0.55)", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {latestToast.nickname}님 구매 감사합니다
            </span>
          </div>
        ) : null}
        {chat && chat.notice ? (
          <div style={{ flexShrink: 0, alignSelf: "flex-start", maxWidth: "100%", padding: "6px 12px", borderRadius: "12px", background: "rgba(0,0,0,0.6)", fontSize: "13px", fontWeight: 600, lineHeight: 1.45 }}>
            <span style={{ color: "#FFD43B", marginRight: "6px" }}>공지</span>{chat.notice}
          </div>
        ) : null}
        {chat && (chat.messages.length > 0 || isDesktop) ? (
          <div style={{ position: "relative", width: "100%", ...(isDesktop ? { flex: 1, minHeight: 0, order: 3 } : {}) }}>
          <div
            ref={chatBoxRef}
            role="log"
            aria-label="채팅"
            aria-live="polite"
            tabIndex={0}
            // [09:39 사장님 「빈 곳 톡 잘 안 먹힘」] 글 줄이 화면 폭 끝까지라 «빈 곳»이 줄 사이 8px 뿐이었음 →
            //   채팅 칸 어디든(글 줄 포함) 짧게 «톡» 누르면 재생 막대. 끌기(8px↑)·길게 누르기(0.45초↑, 관리 창)·「담기 ›」 줄은 제외.
            onPointerDown={(e) => { chatTapRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }; }}
            onClick={(e) => {
              const d = chatTapRef.current;
              chatTapRef.current = null;
              if (isDesktop || !d || modTarget) return;
              if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || Date.now() - d.t > 450) return;
              toggleSeek();
            }}
            style={{ pointerEvents: "auto", overscrollBehavior: "contain", maxHeight: isDesktop ? "none" : CHAT_HEIGHTS[chatView.height], height: isDesktop ? "100%" : undefined, overflowY: "auto", scrollbarWidth: isDesktop ? "thin" : "none", display: "flex", flexDirection: "column", gap: "8px", maskImage: isDesktop ? "none" : "linear-gradient(transparent, #000 24px)", WebkitMaskImage: isDesktop ? "none" : "linear-gradient(transparent, #000 24px)", padding: "16px 0 0 0", boxSizing: "border-box", width: "100%" }}
          >
            <div ref={chatContentRef} style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
            {chat.messages.map((m) => { const color = m.badge === "bot" ? "#FFFFFF" : (chatColorMap.get(m.id) || "#FFFFFF");
              // 루루동이AI — 이 화면에만 끼운 알림 줄(번호가 소수)은 관리 창 없음 / 상품 안내 줄은 누르면 그 상품 옵션 창
              const localLine = !Number.isInteger(m.id);
              const canMod = chat.canModerate && !localLine && !m.deletedByAuthor && !m.privateCommand;
              const canPress = canMod || (!m.deletedByAuthor && !m.privateCommand && Boolean(chat.ownIds?.includes(m.id)));
              const botProduct = m.badge === "bot" && !m.deletedByAuthor ? parseBotRef(m.botRef) : null;
              return (
              <div
                key={m.id}
                data-chat-id={m.id}
                onPointerDown={(e) => { downAt.current = { x: e.clientX, y: e.clientY }; if (canPress && e.button === 0) startPress(m); }}
                onPointerMove={(e) => { const d = downAt.current; if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) endPress(); }}
                onPointerUp={canPress ? endPress : undefined}
                onPointerLeave={canPress ? endPress : undefined}
                onPointerCancel={canPress ? endPress : undefined}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openChatMenu(m, e.clientX, e.clientY, canMod); }}
                onClick={botProduct ? (e) => {
                  e.stopPropagation(); // 「담기 ›」 줄은 상품 창만(재생 막대 안 띄움)
                  const d = downAt.current;
                  if (modTarget || (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8)) return; // 길게 누름·끌기는 열지 않음
                  props.onOpenProduct(botProduct.productId, botProduct.detailName || undefined);
                } : undefined}
                role={botProduct ? "button" : undefined}
                style={{ cursor: botProduct ? "pointer" : undefined, pointerEvents: "auto", touchAction: "pan-y", display: "flex", alignItems: "flex-start", gap: "12px", maxWidth: "100%", color, fontSize: CHAT_SIZES[chatView.size], fontWeight: chatView.bold ? 700 : 400, WebkitFontSmoothing: "antialiased", letterSpacing: "normal", lineHeight: CHAT_LINE_H[chatView.size], wordBreak: "break-word", textShadow: isDesktop ? "none" : CHAT_TEXT_SHADOW, userSelect: chat.canModerate ? "none" : "auto", WebkitUserSelect: chat.canModerate ? "none" : "auto" }}
              >
                {/* 유튜브처럼 [사진][닉네임 · 표시 · 글] — 글이 길어 다음 줄로 가면 사진 밑이 아니라 닉네임 시작 자리에 맞춰 내려감.
                    상자 없이 글자만 — 닉네임과 글은 같은 색(사람마다 정해진 색, 바로 위 다른 사람과는 절대 같은 색 안 됨).
                    관리자는 글 줄을 길게 누르면 관리 창(고정은 왕관 두 사람만) */}
                <ChatAvatar src={m.badge === "bot" ? "/ruru-ai-avatar.png" : m.avatar} nick={m.nickname} color={color} />
                <span style={{ minWidth: 0, flex: 1, opacity: m.deletedByAuthor ? 0.55 : 1 }}>
                  {m.deletedByAuthor ? <span style={{ display: "block", fontSize: 12, color: "#ccc", marginBottom: 3 }}>작성자가 삭제한 글 · 관리자에게만 표시</span> : null}
                  {m.privateCommand ? <span style={{ display: "block", fontSize: 12, color: "#a8c7fa", marginBottom: 3 }}>나만 보이는 명령어</span> : null}
                  {/* [12:54 사장님 「유튜브랑 똑같이」] 사장님 유튜브 캡처에서 잰 값: 닉네임 흐린 흰색(약 80%)·보통 굵기, 글 흰색·보통 굵기 */}
                  {/* [13:44 사장님 「닉네임만 연한 색」] 닉네임만 사람마다 정해진 색을 흰색과 반쯤 섞은 연한 색(글은 흰색 그대로), 루루동이 안내는 흐린 흰색 */}
                  <span style={{ fontWeight: chatView.bold ? 700 : 400, color: m.badge === "bot" ? "rgba(255,255,255,0.8)" : softNickColor(color) }}>{m.nickname}</span>
                  <ChatBadge badge={m.badge} />
                  {botProduct ? <ChatProductThumb src={chatProductPhoto(props.items, botProduct)} name="안내 상품 사진" /> : null}
                  <span style={{ marginLeft: m.badge ? "4px" : "8px", color: "#FFFFFF" /* 글은 유튜브처럼 늘 흰색 — 연한 색 글은 밝은 배경에서 안 읽힘(12:49), 닉네임만 사람 색 */ }}><ChatBodyView body={m.body} emojis={emojiMap} /></span>
                  {botProduct ? (
                    <span style={{ display: "inline", marginLeft: "6px", color: "inherit", fontSize: "1em", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: "3px", whiteSpace: "nowrap" }}>‹ 담기</span>
                  ) : null}
                </span>
              </div>
            ); })}
            </div>
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
          // 고정 댓글 — PC는 채팅 목록 위, 폰은 입력 줄 바로 위. 누르면 전체 글 펼침/접기.
          //   왕관 표시 두 사람은 길게 누르면 고정 해제 등 관리 창
          <div
            role="button"
            tabIndex={0}
            aria-expanded={pinOpen}
            aria-label="고정 댓글"
            data-live-scroll={isDesktop ? "1" : undefined}
            onClick={() => {
              if (modTarget) return;
              // [14:52 사장님 「고정인데 누를 때마다 왜 움직여」] 다 보이는 글은 눌러도 그대로(펼칠 게 있을 때만 펼침)
              const el = pinTextRef.current;
              if (!pinOpen && el && el.scrollWidth <= el.clientWidth + 1) return;
              setPinOpen((v) => !v);
            }}
            onPointerDown={chat.canPin ? (e) => { if (e.button === 0) startPress(chat.pinned!); } : undefined}
            onPointerUp={chat.canPin ? endPress : undefined}
            onPointerLeave={chat.canPin ? endPress : undefined}
            onPointerCancel={chat.canPin ? endPress : undefined}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openChatMenu(chat.pinned!, e.clientX, e.clientY, chat.canPin && Number.isInteger(chat.pinned!.id)); }}
            style={{ ...(isDesktop ? { order: 2, flexShrink: 0, maxHeight: "30%", overflowY: "auto" } : {}), pointerEvents: "auto", display: "flex", alignItems: isDesktop && pinOpen ? "flex-start" : "center", gap: "8px", width: "100%", boxSizing: "border-box", minHeight: "44px", padding: "8px 12px", borderRadius: "22px", background: "rgba(28,28,28,0.88)", color: "#FFFFFF", fontSize: CHAT_SIZES[chatView.size], lineHeight: 1.45, cursor: "pointer", userSelect: "none", WebkitUserSelect: "none" }}
          >
            <ChatAvatar src={chat.pinned.avatar} nick={chat.pinned.nickname} color={chatColorMap.get(chat.pinned.id) || "#FFD43B"} />
            <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", height: "24px", padding: "0 8px", borderRadius: "9999px", background: "rgba(255,255,255,0.16)", fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap", maxWidth: "40%", overflow: "hidden", textOverflow: "ellipsis" }}>
              {chat.pinned.nickname}<ChatBadge badge={chat.pinned.badge} />
            </span>
            {/* 줄 높이 = 이모티콘 높이(2em) — 한 줄로 접혀 있어도 이모티콘 위아래가 안 잘리고, 펼쳐도 줄 높이가 같아 안 움직임 */}
            <span ref={pinTextRef} style={{ flex: 1, minWidth: 0, lineHeight: "2em", padding: "0.15em 0", fontWeight: chatView.bold ? 700 : 500, ...(pinOpen ? { wordBreak: "break-word" } : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }) }}><ChatBodyView body={chat.pinned.body} emojis={emojiMap} /></span>
          </div>
        ) : null}
        {chat && chat.canWrite && greetOpen ? (
          // 실시간 채팅에서 인사하기 — 유튜브 앱과 같은 모양: [손 흔드는 그림] 글 … [보내기 흰 알약]. 「보내기」 = 👋 한 번 보냄
          <div style={{ ...(isDesktop ? { order: 4, flexShrink: 0 } : {}), pointerEvents: "auto", display: "flex", alignItems: "center", gap: "12px", width: "100%", boxSizing: "border-box", minHeight: "52px", padding: "8px 8px 8px 14px", borderRadius: "12px", background: "rgba(40,40,40,0.82)", color: "#FFFFFF" }}>
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: "rotate(-18deg)" }}>
              <path d="M18 11V6a2 2 0 0 0-4 0" /><path d="M14 10V4a2 2 0 0 0-4 0v2" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
            <span style={{ flex: 1, minWidth: 0, fontSize: "15px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>실시간 채팅에서 인사하기</span>
            <button type="button" onClick={() => void sendGreet()} style={{ flexShrink: 0, height: "36px", padding: "0 16px", border: "none", borderRadius: "9999px", background: "#FFFFFF", color: "#0F0F0F", fontSize: "14px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>보내기</button>
          </div>
        ) : null}
        {!isDesktop ? pinnedProductCard : null}
        {isDesktop && !chat ? <div style={{ flex: 1 }} /> : null}
        {isDesktop && chat?.canWrite && !focus ? composer : null}
      </div>

      {/* 맨 아래 줄 — 오늘만셀러처럼 [상품 사진(숫자)] [채팅 입력(크게)] [주문서][더보기(새 공지 숫자)] — 공지·공유는 더보기 안 */}
      <div style={{ position: "absolute", left: 0, right: isDesktop ? videoRight : 0, bottom: 0, padding: "8px 12px calc(8px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", justifyContent: isDesktop ? "center" : undefined, gap: isDesktop ? "16px" : "8px", background: "#000000" }}>
        {/* 오늘만셀러처럼 — 지금 소개 중(없으면 첫) 상품 사진 + 오른쪽 위 숫자(고를 수 있는 상품 수, 세부상품까지) */}
        <button type="button" onClick={() => setListOpen(true)} aria-label={`방송 상품 목록 보기 (${totalCount}개)`} style={{ position: "relative", flexShrink: 0, width: isDesktop ? "208px" : "52px", height: "52px", padding: isDesktop ? "4px 12px 4px 4px" : 0, border: "2px solid #FFFFFF", borderRadius: "12px", background: "#F5F5F5", fontFamily: "inherit", cursor: "pointer", ...(isDesktop ? { display: "flex", alignItems: "center", gap: "10px", color: "#111111" } : {}) }}>
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="" style={{ width: isDesktop ? "40px" : "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "10px" }} />
          ) : (
            <span style={{ display: "flex", width: isDesktop ? "40px" : "100%", height: "100%", alignItems: "center", justifyContent: "center" }}><IconGridDark /></span>
          )}
          {isDesktop ? <>
            <span style={{ fontSize: "16px", fontWeight: 700, whiteSpace: "nowrap" }}>상품 목록</span>
            <span style={{ marginLeft: "auto", fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap" }}>{totalCount > 999 ? "999+" : totalCount}개</span>
          </> : <span aria-hidden="true" style={{ position: "absolute", top: "-8px", right: "-8px", minWidth: "24px", height: "24px", padding: "0 6px", boxSizing: "border-box", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "13px", fontWeight: 700, lineHeight: "24px", textAlign: "center", boxShadow: "0 0 0 1px rgba(0,0,0,0.15)" }}>{totalCount > 999 ? "999+" : totalCount}</span>}
        </button>
        {!isDesktop && chat && chat.canWrite && !focus ? (
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
        ) : !isDesktop ? <span style={{ flex: 1 }} /> : null}
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
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", right: isDesktop ? undefined : "12px", ...(isDesktop ? { left: `calc((100% - ${videoRight || "0px"}) / 2)`, transform: "translateX(-50%)", width: "328px" } : {}), bottom: "calc(84px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
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
      {!isDesktop && composeOpen && chat ? (
        <div role="dialog" aria-modal="true" aria-label="채팅 쓰기" onPointerDown={(e) => { composeDownOnBackdrop.current = e.target === e.currentTarget; }} onClick={(e) => { if (e.target === e.currentTarget && composeDownOnBackdrop.current) setComposeOpen(false); composeDownOnBackdrop.current = false; }} style={{ position: "fixed", inset: 0, zIndex: SHEET_Z, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "flex-end" }}>
          {composer}
        </div>
      ) : null}

      {/* 오른쪽 클릭 — 손님은 복사, 관리자는 기존 관리 창도 열 수 있다. */}
      {chatMenu ? (
        <div onPointerDown={(e) => { if (e.target === e.currentTarget) closeChatMenu(); }} onContextMenu={(e) => { e.preventDefault(); closeChatMenu(); }} style={{ position: "fixed", inset: 0, zIndex: SHEET_Z + 3 }}>
          <div role="dialog" aria-label="채팅글 메뉴" onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeChatMenu(); }
            if (e.key === "Tab") {
              const buttons = Array.from(e.currentTarget.querySelectorAll("button"));
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              e.preventDefault(); buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
            }
          }} style={{ position: "absolute", left: chatMenu.x, top: chatMenu.y, width: "220px", padding: "6px", boxSizing: "border-box", border: "1px solid #555", borderRadius: "12px", background: "#272727", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
            <button autoFocus type="button" onClick={() => void copyChatMessage()} style={{ width: "100%", minHeight: "44px", border: "none", borderRadius: "8px", background: "transparent", color: "#FFF", fontSize: "15px", fontFamily: "inherit", textAlign: "left", padding: "10px 12px", cursor: "pointer" }}>글 복사하기</button>
            {!chatMenu.message.deletedByAuthor && !chatMenu.message.privateCommand && chat?.ownIds?.includes(chatMenu.message.id) && chat.onDeleteOwn ? <button type="button" onClick={async () => { const id = chatMenu.message.id; closeChatMenu(); const r = await chat.onDeleteOwn!(id); setChatHint(r.message || (r.ok ? "내 글을 삭제했어요." : "삭제하지 못했어요.")); }} style={{ width: "100%", minHeight: 44, border: 0, borderRadius: 8, background: "transparent", color: "#ffb4b4", textAlign: "left", padding: "10px 12px", fontSize: 15 }}>내 글 삭제하기</button> : null}
            {chatMenu.canManage ? <button type="button" onClick={() => { setModTarget(chatMenu.message); setBanConfirm(false); setChatMenu(null); }} style={{ width: "100%", minHeight: "44px", border: "none", borderRadius: "8px", background: "transparent", color: "#FFF", fontSize: "15px", fontFamily: "inherit", textAlign: "left", padding: "10px 12px", cursor: "pointer" }}>채팅 관리</button> : null}
          </div>
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
              // [07:35 사장님] 30초 금지 없앰 · 문구 = 유튜브(삭제·시간 제한·숨기기)처럼 «채팅 삭제»를 앞에
              ["hide", "채팅 삭제"],
              ["mute5m", "채팅 삭제 · 5분 채팅 금지"],
              ["ban", banConfirm ? "정말 차단할까요? 사이트에 다시 못 들어와요" : "채팅 삭제 · 사이트 접속 차단"],
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
