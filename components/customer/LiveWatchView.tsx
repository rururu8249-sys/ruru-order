"use client";
// [2026-11-09] 「방송 보며 주문」 ②단계 화면 — 주문서 위에 덮는 방송 화면(손님용).
//   참고: 오늘만셀러(onmlive)·모루라이브 — 세로 영상 꽉 차게, 아래에 «지금 소개 중» 상품 카드,
//   맨 아래 줄 [상품 목록][주문서 확인], 「OO님 주문했어요」 알림.
//   이 화면은 «보여 주기·고르기»만 한다. 담기·장바구니·주문서·결제는 부모(주문 페이지)의 기존 함수가 그대로 처리한다.
//   z-index 60: 아래 메뉴(40)·장바구니 바(39) 위, 옵션 창·주문서 창(100) 아래 → 옵션 창이 방송 위로 올라온다.

import { useEffect, useMemo, useRef, useState } from "react";
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

const IconGrid = () => (
  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
);
const IconSound = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 010 6" /></svg>
);
const IconChat = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8"><path d="M4 5h16v11H9l-5 4z" /></svg>
);
const IconSoundOn = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 010 6" /><path d="M19 6a8 8 0 010 12" /></svg>
);
const MenuIcon = ({ k }: { k: string }) => {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "#FFFFFF", strokeWidth: 1.8 } as const;
  if (k === "notice") return <svg aria-hidden="true" {...p}><rect x="3" y="5" width="18" height="14" rx="1" /><path d="M3 7l9 6 9-6" /></svg>;
  if (k === "orders") return <svg aria-hidden="true" {...p}><path d="M12 3l8 4v10l-8 4-8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></svg>;
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

export default function LiveWatchView(props: Props) {
  const { videoId, title, paused, pausedText, pinned, items, cartCount, cartTotalText, orderToasts } = props;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  // 영상을 누르면 유튜브 막대(돌려보기)가 나온다. 막대가 우리 위·아래 띠·채팅에 안 가리게 영상 칸을 띠 사이에만 둔다.
  const embedSrc = useMemo(() => youtubeEmbedUrl(videoId, typeof window !== "undefined" ? window.location.origin : undefined, { controls: true }), [videoId]);

  useEffect(() => { setGuideOpen(!readGuideSeen()); }, []);

  // ── 사이트 채팅 ──
  const chat = props.chat ?? null;
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatHint, setChatHint] = useState("");
  const [modTarget, setModTarget] = useState<LiveChatMessage | null>(null);
  const [banConfirm, setBanConfirm] = useState(false);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const pressTimer = useRef<number | null>(null);
  const chatCount = chat?.messages.length ?? 0;
  useEffect(() => {
    const el = chatBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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
  const turnSoundOn = () => {
    sendToPlayer(youtubeCommand("unMute"));
    sendToPlayer(youtubeCommand("playVideo"));
    setMuted(false);
  };

  const listItems = useMemo(() => liveWatchList(items, query), [items, query]);
  const latestToast = orderToasts.length > 0 ? orderToasts[orderToasts.length - 1] : null;

  const closeGuide = () => { writeGuideSeen(); setGuideOpen(false); };

  return (
    <div
      role="region"
      aria-label="방송 보며 주문"
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "#000000", color: "#FFFFFF", overflow: "hidden", fontFamily: "inherit" }}
    >
      {/* 영상 — 화면 전체 */}
      <iframe
        ref={iframeRef}
        key={videoId}
        src={embedSrc}
        title={`${title || "라이브 방송"} 영상`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        style={{ position: "absolute", left: 0, right: 0, top: 0, width: "100%", height: "calc(100% - 76px - env(safe-area-inset-bottom))", border: 0, background: "#000000" }}
      />

      {/* 위 줄 — LIVE·제목 / 쇼핑몰처럼 보기 */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, padding: "calc(8px + env(safe-area-inset-top)) 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", background: "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0))", pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "28px", padding: "0 10px", borderRadius: "9999px", background: paused ? "#707072" : "#D30005", fontSize: "13px", fontWeight: 700, flexShrink: 0 }}>
            <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "9999px", background: "#FFFFFF" }} />{paused ? "쉬는 중" : "LIVE"}
          </span>
          <span style={{ fontSize: "15px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title || "라이브 방송"}</span>
        </div>
          <button type="button" onClick={props.onSwitchToShop} style={{ pointerEvents: "auto", flexShrink: 0, height: "44px", padding: "0 14px", border: "none", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "14px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
            쇼핑몰처럼 보기
          </button>
      </div>


      {/* 오른쪽 세로 메뉴 — 공지·주문내역·내정보·문의(오늘만셀러처럼). 돌려보기 중엔 숨김 */}
      {props.menu && props.menu.length > 0 ? (
        <nav aria-label="메뉴" style={{ position: "absolute", right: "8px", top: "calc(124px + env(safe-area-inset-top))", display: "flex", flexDirection: "column", gap: "4px" }}>
          {props.menu.map((m) => (
            <button key={m.key} type="button" onClick={m.onClick} style={{ position: "relative", width: "60px", minHeight: "56px", padding: "6px 0", border: "none", background: "transparent", color: "#FFFFFF", fontSize: "13px", fontWeight: 600, fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", cursor: "pointer", textShadow: "0 1px 3px rgba(0,0,0,0.7)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }}>
              <MenuIcon k={m.key} />
              <span>{m.label}</span>
              {m.badge && m.badge > 0 ? (
                <span aria-label={`안 읽은 ${m.badge}개`} style={{ position: "absolute", top: "2px", right: "10px", minWidth: "18px", height: "18px", padding: "0 4px", boxSizing: "border-box", borderRadius: "9999px", background: "#D30005", color: "#FFFFFF", fontSize: "13px", fontWeight: 700, lineHeight: "18px", textAlign: "center", textShadow: "none" }}>{m.badge > 9 ? "9+" : m.badge}</span>
              ) : null}
            </button>
          ))}
        </nav>
      ) : null}

      {/* 소리 끄기 — 켠 뒤엔 작은 스피커 버튼 */}
      {!muted ? (
        <button type="button" onClick={() => { sendToPlayer(youtubeCommand("mute")); setMuted(true); }} aria-label="소리 끄기" style={{ position: "absolute", left: "16px", top: "calc(68px + env(safe-area-inset-top))", width: "44px", height: "44px", border: "1px solid rgba(255,255,255,0.5)", borderRadius: "9999px", background: "rgba(0,0,0,0.4)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <IconSoundOn />
        </button>
      ) : null}
      {/* 소리 켜기 — 폰은 소리 꺼진 채로만 자동 재생된다(브라우저 규칙) */}
      {muted ? (
        <button type="button" onClick={turnSoundOn} style={{ position: "absolute", left: "16px", top: "calc(68px + env(safe-area-inset-top))", height: "44px", padding: "0 18px", border: "none", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "15px", fontWeight: 600, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap" }}>
          <IconSound />소리 켜기
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
      <div style={{ display: "flex", position: "absolute", left: "16px", right: "16px", bottom: "calc(84px + env(safe-area-inset-bottom))", flexDirection: "column", gap: "8px", pointerEvents: "none" }}>
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
            style={{ pointerEvents: chat.canModerate ? "auto" : "none", maxHeight: "24dvh", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "4px", maskImage: "linear-gradient(transparent, #000 24px)", WebkitMaskImage: "linear-gradient(transparent, #000 24px)", paddingTop: "16px", width: "82%" }}
          >
            {chat.messages.map((m) => (
              <div
                key={m.id}
                onPointerDown={() => startPress(m)}
                onPointerUp={endPress}
                onPointerLeave={endPress}
                onPointerCancel={endPress}
                onContextMenu={(e) => { if (chat.canModerate) { e.preventDefault(); setModTarget(m); } }}
                style={{ alignSelf: "flex-start", maxWidth: "100%", padding: "4px 10px", borderRadius: "12px", background: "rgba(0,0,0,0.35)", fontSize: "14px", lineHeight: 1.45, wordBreak: "break-word", textShadow: "0 1px 2px rgba(0,0,0,0.6)", userSelect: chat.canModerate ? "none" : "auto", WebkitUserSelect: chat.canModerate ? "none" : "auto" }}
              >
                <span style={{ fontWeight: 700, color: nicknameColor(m.nickname), marginRight: "6px" }}>{m.nickname}</span>
                <span>{m.body}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div role="status" aria-atomic="true" style={{ minHeight: "32px", display: "flex" }}>
          {latestToast ? (
            <span key={latestToast.key} className="ruru-live-watch-toast" style={{ display: "inline-flex", alignItems: "center", height: "32px", maxWidth: "100%", padding: "0 12px", borderRadius: "9999px", background: "rgba(0,0,0,0.55)", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {latestToast.nickname}님 구매 감사합니다
            </span>
          ) : null}
        </div>
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

      {/* 맨 아래 줄 — [상품 목록] [주문서 확인] */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", gap: "8px", background: "#000000" }}>
        <button type="button" onClick={() => setListOpen(true)} aria-label={`방송 상품 ${items.length}개 보기`} style={{ position: "relative", width: "52px", height: "52px", flexShrink: 0, border: "none", borderRadius: "12px", background: "rgba(255,255,255,0.18)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <IconGrid />
          <span aria-hidden="true" style={{ position: "absolute", top: "-6px", right: "-6px", minWidth: "22px", height: "22px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "13px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{items.length}</span>
        </button>
        {chat && chat.canWrite ? (
          <button type="button" onClick={() => setComposeOpen(true)} style={{ flex: 1, minWidth: 0, height: "52px", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "9999px", background: "rgba(0,0,0,0.25)", color: "#E5E5E5", fontSize: "15px", fontWeight: 500, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px", padding: "0 16px", textAlign: "left", whiteSpace: "nowrap", overflow: "hidden" }}>
            <IconChat /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>메시지 입력</span>
          </button>
        ) : null}
        {cartCount > 0 ? (
          <button type="button" onClick={props.onOpenCart} style={{ flex: chat && chat.canWrite ? "0 0 auto" : 1, minWidth: 0, height: "52px", border: "none", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "15px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", whiteSpace: "nowrap", padding: "0 16px" }}>
            {chat && chat.canWrite ? (
              <span role="status" aria-atomic="true">주문서 {cartCount}개</span>
            ) : (
              <><span role="status" aria-atomic="true">{cartCount}개 · {cartTotalText}</span><span aria-hidden="true">·</span><span>주문서 확인</span></>
            )}
          </button>
        ) : chat && chat.canWrite ? null : (
          <button type="button" onClick={() => setListOpen(true)} style={{ flex: 1, minWidth: 0, height: "52px", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "9999px", background: "transparent", color: "#FFFFFF", fontSize: "15px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 16px" }}>
            방송에서 주문한 상품을 담아 주세요
          </button>
        )}
      </div>

      {/* 채팅 안내(보냄 실패·금지 등) */}
      {chatHint ? (
        <div role="status" style={{ position: "absolute", left: "16px", right: "16px", bottom: "calc(84px + env(safe-area-inset-bottom))", display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 2 }}>
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
              placeholder="메시지 입력"
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
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#707072" }}>총 {items.length}개</span>
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
            <div style={{ flex: 1, overflowY: "auto", padding: "0 16px calc(16px + env(safe-area-inset-bottom))" }}>
              {listItems.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center", fontSize: "15px", color: "#707072" }}>{query ? "찾는 상품이 없어요" : "방송 상품이 아직 없어요"}</div>
              ) : listItems.map((it) => { const no = items.findIndex((x) => x.id === it.id) + 1; return (
                <div key={it.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderBottom: "1px solid #E5E5E5" }}>
                  <button type="button" onClick={() => { if (!it.soldOut) { setListOpen(false); props.onOpenProduct(it.id); } }} aria-label={`${no}번 ${it.name} 상품 선택`} style={{ width: "64px", height: "64px", flexShrink: 0, padding: 0, border: "none", background: "#F5F5F5", overflow: "hidden", cursor: it.soldOut ? "default" : "pointer", position: "relative" }}>
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
                  <button type="button" disabled={it.soldOut} onClick={() => { setListOpen(false); props.onOpenProduct(it.id); }} style={{ flexShrink: 0, height: "40px", minWidth: "64px", padding: "0 14px", border: "none", borderRadius: "9999px", background: it.soldOut ? "#E5E5E5" : "#111111", color: it.soldOut ? "#707072" : "#FFFFFF", fontSize: "14px", fontWeight: 600, fontFamily: "inherit", cursor: it.soldOut ? "default" : "pointer" }}>
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
            {[
              ["1", "방송을 보다가 마음에 드는 상품이 나오면"],
              ["2", "아래 상품 카드나 상품 목록에서 담고"],
              ["3", "「주문서 확인」을 눌러 주문하면 끝"],
            ].map(([n, t]) => (
              <div key={n} style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
                <span aria-hidden="true" style={{ width: "28px", height: "28px", flexShrink: 0, borderRadius: "9999px", background: "#111111", color: "#FFFFFF", fontSize: "14px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
                <span style={{ fontSize: "16px", lineHeight: 1.5, paddingTop: "2px" }}>{t}</span>
              </div>
            ))}
            <div style={{ fontSize: "13px", color: "#707072", lineHeight: 1.5, margin: "4px 0 16px" }}>위 「쇼핑몰처럼 보기」를 누르면 예전 화면으로 볼 수 있어요.</div>
            <button type="button" onClick={closeGuide} style={{ width: "100%", height: "52px", border: "none", borderRadius: "9999px", background: "#111111", color: "#FFFFFF", fontSize: "16px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>시작하기</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
