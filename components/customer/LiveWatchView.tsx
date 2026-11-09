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
  const embedSrc = useMemo(() => youtubeEmbedUrl(videoId, typeof window !== "undefined" ? window.location.origin : undefined), [videoId]);

  useEffect(() => { setGuideOpen(!readGuideSeen()); }, []);

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
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "#000000" }}
      />

      {/* 위 줄 — LIVE·제목 / 쇼핑몰처럼 보기 */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, padding: "calc(8px + env(safe-area-inset-top)) 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", background: "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "28px", padding: "0 10px", borderRadius: "9999px", background: paused ? "#707072" : "#D30005", fontSize: "13px", fontWeight: 700, flexShrink: 0 }}>
            <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "9999px", background: "#FFFFFF" }} />{paused ? "쉬는 중" : "LIVE"}
          </span>
          <span style={{ fontSize: "15px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title || "라이브 방송"}</span>
        </div>
        <button type="button" onClick={props.onSwitchToShop} style={{ flexShrink: 0, height: "44px", padding: "0 14px", border: "none", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "14px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
          쇼핑몰처럼 보기
        </button>
      </div>

      {/* 소리 켜기 — 폰은 소리 꺼진 채로만 자동 재생된다(브라우저 규칙) */}
      {muted ? (
        <button type="button" onClick={turnSoundOn} style={{ position: "absolute", left: "50%", top: "calc(68px + env(safe-area-inset-top))", transform: "translateX(-50%)", height: "44px", padding: "0 18px", border: "none", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "15px", fontWeight: 600, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap" }}>
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

      {/* 아래쪽 — 주문 알림 · 소개 중 상품 카드 */}
      <div style={{ position: "absolute", left: "16px", right: "16px", bottom: "calc(88px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: "8px", pointerEvents: "none" }}>
        <div role="status" aria-atomic="true" style={{ minHeight: "32px", display: "flex" }}>
          {latestToast ? (
            <span key={latestToast.key} className="ruru-live-watch-toast" style={{ display: "inline-flex", alignItems: "center", height: "32px", maxWidth: "100%", padding: "0 12px", borderRadius: "9999px", background: "rgba(0,0,0,0.55)", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {latestToast.nickname}님 주문 감사합니다
            </span>
          ) : null}
        </div>
        {pinned ? (
          <div style={{ pointerEvents: "auto", background: "#FFFFFF", color: "#111111", borderRadius: "12px", padding: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
            <button type="button" onClick={() => props.onOpenProduct(pinned.productId, pinned.detailName || undefined)} aria-label={`${pinned.name} ${pinned.brand ? "상품 선택" : "담기"}`} style={{ width: "64px", height: "64px", flexShrink: 0, padding: 0, border: "none", background: "#F5F5F5", cursor: "pointer", overflow: "hidden" }}>
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
              {pinned.soldOut ? "품절" : pinned.brand ? "상품 선택" : "담기"}
            </button>
          </div>
        ) : null}
      </div>

      {/* 맨 아래 줄 — [상품 목록] [주문서 확인] */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", gap: "8px", background: "rgba(0,0,0,0.55)" }}>
        <button type="button" onClick={() => setListOpen(true)} aria-label={`방송 상품 ${items.length}개 보기`} style={{ position: "relative", width: "52px", height: "52px", flexShrink: 0, border: "none", borderRadius: "12px", background: "rgba(255,255,255,0.18)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <IconGrid />
          <span aria-hidden="true" style={{ position: "absolute", top: "-6px", right: "-6px", minWidth: "22px", height: "22px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "13px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{items.length}</span>
        </button>
        {cartCount > 0 ? (
          <button type="button" onClick={props.onOpenCart} style={{ flex: 1, minWidth: 0, height: "52px", border: "none", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "15px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", whiteSpace: "nowrap" }}>
            <span role="status" aria-atomic="true">{cartCount}개 · {cartTotalText}</span><span aria-hidden="true">·</span><span>주문서 확인</span>
          </button>
        ) : (
          <button type="button" onClick={() => setListOpen(true)} style={{ flex: 1, minWidth: 0, height: "52px", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "9999px", background: "transparent", color: "#FFFFFF", fontSize: "15px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 16px" }}>
            방송에서 주문한 상품을 담아 주세요
          </button>
        )}
      </div>

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
                  <button type="button" onClick={() => { if (!it.soldOut) { setListOpen(false); props.onOpenProduct(it.id); } }} aria-label={`${no}번 ${it.name} ${it.brand ? "상품 선택" : "담기"}`} style={{ width: "64px", height: "64px", flexShrink: 0, padding: 0, border: "none", background: "#F5F5F5", overflow: "hidden", cursor: it.soldOut ? "default" : "pointer", position: "relative" }}>
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
                    {it.soldOut ? "품절" : it.brand ? "상품 선택" : "담기"}
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
