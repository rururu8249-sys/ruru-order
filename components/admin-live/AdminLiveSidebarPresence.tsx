"use client";

// [2026-08-29 사장님 요청] 실시간 접속자 + 접속 기록(날짜별·방송별)
//
// 안전
//   · 읽기 전용. /api/admin-live/presence GET, /api/admin-live/visit-stats GET 만 부른다.
//   · 주문 / 입금 / 정산 / 배송 / 재고 데이터는 건드리지 않는다.
//   · 표가 없거나 오류가 나도 조용히 숨긴다(관리자 화면을 막지 않는다).
//
// [2026-08-29 수정] 기록 창이 사이드바 안에 갇혀 세로로 눌려 나오던 문제
//   사이드바(aside)에 transform 이 걸려 있어서 그 안의 position:fixed 가
//   화면 전체가 아니라 사이드바(220px) 기준으로 잡혔다.
//   → 창을 document.body 로 빼내서(포털) 화면 한가운데 제대로 뜨게 한다.
//
// [2026-09-08 리팩터] 접속 기록 창의 내용(탭·표·펼침)은 VisitStatsView.tsx 로 옮겼다.
// [2026-09-08 5단계-B] 기록은 팝업이 아니라 「고객 › 접속 기록」 화면이 됐다.
//   여기 버튼은 그 화면으로 보내기만 한다(onOpenVisitStats). 사이드바 안 팝업·포털·ESC 처리는 삭제.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Visitor = {
  id: string;
  nickname: string;
  pageType: string;
  pageLabel: string;
  lastSeenAt: string;
  viewingProduct?: string;
};

type Payload = {
  ok?: boolean;
  available?: boolean;
  total?: number;
  listed?: number;
  byType?: { orderForm: number; orderLookup: number; admin: number; others: number };
  visitors?: Visitor[];
};

const POLL_MS = 20000;

// [2026-08-29 사장님 지시] 닉네임 가리지 않는다.
//   관리자 본인만 보는 화면이고, 유튜브 채팅에 이미 공개된 닉네임이라 가릴 이유가 없다.
//   가려 놓으면 "누가 지금 주문서를 쓰고 있나"를 채팅과 맞춰볼 수가 없어 실무에서 쓸모가 없었다.
function displayNickname(value: string) {
  return String(value || "").trim() || "비회원";
}

function agoText(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}초 전`;
  return `${Math.floor(sec / 60)}분 전`;
}

type Props = {
  /** 「📊 접속 기록 보기」를 누르면 고객 › 접속 기록 화면으로 이동 */
  onOpenVisitStats?: () => void;
};

export default function AdminLiveSidebarPresence({ onOpenVisitStats }: Props = {}) {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const stoppedRef = useRef(false);

  const loadPresence = async (manual?: boolean) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch("/api/admin-live/presence", { method: "GET", cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as Payload | null;
      if (!stoppedRef.current && payload?.ok) setData(payload);
    } catch {
      // 접속 표시는 보조 기능이라 실패해도 무시한다.
    } finally {
      if (manual) window.setTimeout(() => setRefreshing(false), 350);
    }
  };

  useEffect(() => {
    stoppedRef.current = false;
    void loadPresence();
    const timer = window.setInterval(() => { void loadPresence(); }, POLL_MS);
    return () => { stoppedRef.current = true; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // [2026-08-31 사고수정] 훅은 early return 앞에 선언해야 한다 — 뒤에 두면 React 훅 규칙 위반으로
  //   위젯이 통째로 죽는다(실측: 접속자 위젯 사라짐 + 관리자 페이지 크래시).
  // [2026-08-31 사장님 요청] 접속자 줄 클릭 → 그 손님 장바구니(담긴 상품) 바로 보기
  //   이미 서버에 있는 담김 데이터(/api/admin-live/cart-holds)를 닉네임으로 연결만 한다. 표시 전용.
  const [cartFor, setCartFor] = useState("");
  const [cartHolds, setCartHolds] = useState<Array<{ nickname: string; productName: string; detailName: string; qty: number; unitPrice: number | null }> | null>(null);
  const [cartLoading, setCartLoading] = useState(false);
  const cartFetchedAt = useRef(0);
  const toggleVisitorCart = async (visitorId: string, nickname: string) => {
    if (cartFor === visitorId) { setCartFor(""); return; }
    setCartFor(visitorId);
    if (!String(nickname || "").trim()) return;
    if (!cartHolds || Date.now() - cartFetchedAt.current > 30_000) {
      setCartLoading(true);
      try {
        const r = await fetch("/api/admin-live/cart-holds?scope=all", { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (j?.ok && Array.isArray(j.holds)) { setCartHolds(j.holds); cartFetchedAt.current = Date.now(); }
      } catch { /* 보조 표시 — 실패해도 접속자 목록은 정상 */ }
      finally { setCartLoading(false); }
    }
  };

  if (!data || data.available === false) return null;

  const total = data.total ?? 0;
  const listed = data.listed ?? (data.visitors?.length ?? 0);
  const by = data.byType ?? { orderForm: 0, orderLookup: 0, admin: 0, others: 0 };
  const visitors = data.visitors ?? [];
  const more = Math.max(0, total - listed);

  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={total > 0 ? "absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" : ""} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${total > 0 ? "bg-emerald-500" : "bg-slate-300"}`} />
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
          title="지금 사이트에 들어와 있는 사람 (최근 2분 안에 신호가 온 접속)"
        >
          <span className="block text-[11px] font-black tracking-[0.18em] text-ink-mute">LIVE</span>
          <span className="block text-sm font-black text-ink tabular-nums">지금 접속 {total.toLocaleString("ko-KR")}명</span>
        </button>
        <button
          type="button"
          onClick={() => void loadPresence(true)}
          title="지금 다시 세기"
          aria-label="새로고침"
          className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] font-black text-ink-mute hover:bg-surface-2 hover:text-ink"
        >
          <span className={refreshing ? "inline-block animate-spin" : "inline-block"}>↻</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "접기" : "펴기"}
          className="shrink-0 text-[11px] font-black text-ink-mute"
        >{open ? "▲" : "▼"}</button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {[
          { label: "주문서", value: by.orderForm },
          { label: "조회", value: by.orderLookup },
          { label: "기타", value: by.others },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-surface-2 px-1.5 py-1.5 text-center">
            <div className="text-[11px] font-black text-ink-mute">{item.label}</div>
            <div className="text-[13px] font-black tabular-nums text-ink">{item.value.toLocaleString("ko-KR")}</div>
          </div>
        ))}
      </div>

      {open ? (
        visitors.length === 0 ? (
          <div className="mt-2 rounded-xl bg-surface-2 px-2 py-3 text-center text-[11px] font-bold text-ink-mute">
            지금 접속중인 사람이 없습니다.
          </div>
        ) : (
          <>
            <ul className="mt-2 max-h-[240px] space-y-1 overflow-y-auto">
              {visitors.map((visitor) => (
                <li key={visitor.id}>
                  <button
                    type="button"
                    onClick={() => void toggleVisitorCart(visitor.id, visitor.nickname)}
                    title="누르면 이 손님이 장바구니에 담아둔 상품을 팝업으로 보여줍니다"
                    className={["flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left", cartFor === visitor.id ? "bg-rose-soft" : "bg-surface-2 hover:bg-surface-3"].join(" ")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-black text-ink">{displayNickname(visitor.nickname)}</span>
                      {String(visitor.viewingProduct || "").trim() ? (
                        <span className="block truncate text-[11px] font-bold text-rose-deep">👀 {String(visitor.viewingProduct).trim()}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[11px] font-black text-ink-mute">{visitor.pageLabel}</span>
                    <span className="shrink-0 text-[11px] font-bold text-ink-mute tabular-nums">{agoText(visitor.lastSeenAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {more > 0 ? (
              <div className="mt-1.5 text-center text-[11px] font-bold text-ink-mute">
                이름은 최근 {listed}명까지만 보여요 · 외 {more.toLocaleString("ko-KR")}명 더 접속중
              </div>
            ) : null}
          </>
        )
      ) : null}

      {/* [2026-08-31] 손님 장바구니 팝업 — 사이드바가 좁아 인라인 대신 화면 가운데로(포털) */}
      {cartFor && typeof document !== "undefined" ? createPortal(
        (() => {
          const visitor = visitors.find((v) => v.id === cartFor);
          const nick = String(visitor?.nickname || "").trim();
          const mine = nick ? (cartHolds || []).filter((h) => String(h.nickname || "").trim() === nick) : [];
          const known = mine.reduce((sum, h) => sum + (h.unitPrice ? h.unitPrice * (Number(h.qty) || 0) : 0), 0);
          const hasUnknown = mine.some((h) => h.unitPrice === null || h.unitPrice === undefined);
          return (
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4" onClick={() => setCartFor("")}>
              <div className="w-full max-w-[360px] overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <span className="text-[14px] font-black text-ink">🛒 {displayNickname(nick)} 장바구니</span>
                  <button type="button" onClick={() => setCartFor("")} className="text-lg leading-none text-ink-mute hover:text-ink">✕</button>
                </div>
                <div className="max-h-[50vh] overflow-y-auto px-4 py-3 text-[12.5px] font-bold leading-6 text-ink-soft">
                  {String(visitor?.viewingProduct || "").trim() ? (
                    <div className="mb-2 rounded-lg bg-rose-soft px-2.5 py-1.5 text-[11.5px] font-black text-rose-deep">👀 최근 담은 상품 · {String(visitor?.viewingProduct).trim()}</div>
                  ) : null}
                  {!nick ? (
                    "비회원(닉네임 없음)은 장바구니를 연결할 수 없어요."
                  ) : cartLoading ? (
                    "장바구니 확인 중…"
                  ) : mine.length === 0 ? (
                    "지금 장바구니에 담긴 상품이 없어요."
                  ) : (
                    <>
                      {mine.map((h, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 border-b border-line/60 py-1 last:border-0">
                          <span className="min-w-0 flex-1 truncate">{(h.detailName || h.productName || "상품").trim()}</span>
                          <span className="shrink-0 font-black text-ink">{Number(h.qty) || 0}개</span>
                        </div>
                      ))}
                      <div className="mt-2 flex items-center justify-between text-[13px] font-black">
                        <span className="text-ink-mute">담긴 금액</span>
                        <span className="text-rose-deep">{known.toLocaleString("ko-KR")}원{hasUnknown ? " +미기록" : ""}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })(),
        document.body,
      ) : null}

      <button
        type="button"
        onClick={() => onOpenVisitStats?.()}
        className="mt-2 w-full rounded-xl bg-surface-2 px-2 py-1.5 text-[11px] font-black text-ink-soft hover:bg-surface-3"
      >
        📊 접속 기록 보기
      </button>
    </section>
  );
}
