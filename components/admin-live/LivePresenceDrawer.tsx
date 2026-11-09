"use client";

// [2026-11-09 사장님 「접속 기록 간단목록 — 누가 뭐 하는지 실시간으로 제대로 보고 싶다」] 「지금 접속」 오른쪽 창(DESIGN-ADMIN §5 목록=드로어·폭 720·폰 전체폭).
//   사이드바 220px 안에 닉네임·상태·시간을 욱여넣던 것 → 여기서 줄마다 닉네임(전체)·이름·뭐 하는 중·장바구니·오늘 주문·마지막 신호.
//   읽기 전용: /api/admin-live/presence GET 만(20초 자동 갱신). 주문·입금·장바구니 쓰기 0.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { filterLiveVisitors, sortLiveVisitors, type LiveVisitor, type LiveSummary, type LiveChip } from "@/lib/presenceLive";

export type LivePresencePayload = {
  ok?: boolean;
  available?: boolean;
  total?: number;
  listed?: number;
  summary?: LiveSummary;
  since?: string;
  visitors?: LiveVisitor[];
};

type Chip = LiveChip;

const btnSub = "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[14px] text-ink hover:bg-surface-2 disabled:opacity-50 max-md:h-11";
const chipCls = (on: boolean) => `inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] tabular-nums ${on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-surface-2"}`;
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

export function agoText(iso: string, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 60) return `${sec}초 전`;
  return `${Math.floor(sec / 60)}분 전`;
}

function statusTone(v: LiveVisitor): string {
  const k = v.activity?.kind;
  if (k === "submitted") return "text-ok-tx";
  if (k === "sheet" || k === "cart") return "text-ink";
  if (k === "option") return "text-ink";
  return "text-ink-soft";
}

type Props = {
  open: boolean;
  onClose: () => void;
  data: LivePresencePayload | null;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenVisitStats?: () => void;
};

export default function LivePresenceDrawer({ open, onClose, data, refreshing, onRefresh, onOpenVisitStats }: Props) {
  const [chip, setChip] = useState<Chip>("all");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string>("");
  const [now, setNow] = useState(() => Date.now());
  const openedAt = useRef(0);
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return;
    openedAt.current = Date.now();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { document.removeEventListener("keydown", onKey); window.clearInterval(t); };
  }, [open, onClose]);

  const visitors = useMemo(() => sortLiveVisitors(data?.visitors ?? []), [data]);
  const list = useMemo(() => filterLiveVisitors(visitors, chip, q), [visitors, chip, q]);
  const s = data?.summary ?? { total: data?.total ?? 0, orderForm: 0, withCart: 0, ordered: 0, guests: 0 };

  if (!open || typeof document === "undefined") return null;

  const chips: Array<[Chip, string, number]> = [
    ["all", "전체", visitors.filter((v) => v.pageType !== "admin").length],
    ["form", "주문서 화면", s.orderForm],
    ["cart", "장바구니 있음", s.withCart],
    ["ordered", "주문함", s.ordered],
    ["guest", "비회원", s.guests],
  ];

  return createPortal(
    <>
      <button
        type="button" aria-label="지금 접속 창 닫기" tabIndex={-1}
        onMouseDown={() => { downOnBackdrop.current = true; }}
        onClick={() => { const ok = downOnBackdrop.current && Date.now() - openedAt.current > 600; downOnBackdrop.current = false; if (ok) onClose(); }}
        className="fixed inset-0 z-[120] bg-black/30"
      />
      <aside role="dialog" aria-modal="true" aria-label="지금 접속"
        className="fixed inset-y-0 right-0 z-[130] flex w-full max-w-[720px] flex-col bg-surface outline-none"
        style={{ boxShadow: "0 8px 24px rgba(0,0,0,.08)" }}>
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-6 py-4 max-md:h-[52px] max-md:px-4 max-md:py-0">
          <button type="button" onClick={onClose} className={`${btnSub} md:hidden`}>닫기</button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[20px] font-bold text-ink max-md:text-[16px]">지금 접속 <span className="tabular-nums">{(data?.total ?? 0).toLocaleString("ko-KR")}</span>명</h2>
            <div className="text-[12px] text-ink-mute max-md:hidden">최근 2분 안에 신호가 온 사람 · 20초마다 새로 셈 · 주문은 {data?.since ? "이번 방송(또는 오늘)" : "오늘"} 기준</div>
          </div>
          <button type="button" onClick={onRefresh} disabled={refreshing} className={btnSub}>{refreshing ? "새로 세는 중…" : "새로고침"}</button>
          {onOpenVisitStats ? <button type="button" onClick={() => { onOpenVisitStats(); onClose(); }} className={`${btnSub} max-md:hidden`}>접속 기록</button> : null}
          <button type="button" onClick={onClose} className={`${btnSub} max-md:hidden`}>닫기</button>
        </div>

        <div className="shrink-0 border-b border-line px-6 py-3 max-md:px-4">
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {chips.map(([k, label, c]) => (
              <button key={k} type="button" onClick={() => setChip(k)} className={chipCls(chip === k)}>
                {label} <span className={chip === k ? "text-white/80" : "text-ink-mute"}>{c}</span>
              </button>
            ))}
          </div>
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉네임·이름 검색" inputMode="search"
            className="mt-2 h-9 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink outline-none focus-visible:border-ink max-md:h-11 max-md:text-[16px]"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!data || data.available === false ? (
            <div className="px-6 py-10 text-center text-[13px] text-ink-mute">접속 정보를 아직 못 읽었어요.</div>
          ) : list.length === 0 ? (
            <div className="px-6 py-10 text-center text-[13px] text-ink-mute">해당하는 사람이 없어요. 다른 칩을 누르거나 검색어를 지워 보세요.</div>
          ) : (
            <ul>
              {list.map((v) => {
                const isOpen = expanded === v.id;
                const nick = v.nickname || (v.pageType === "admin" ? "관리자" : "비회원");
                return (
                  <li key={v.id} className="border-b border-line">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? "" : v.id)}
                      className="flex w-full items-start gap-3 px-6 py-3 text-left hover:bg-surface-2 max-md:px-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[14px] font-bold text-ink">{nick}</span>
                          {v.name ? <span className="text-[13px] text-ink-mute">{v.name}</span> : null}
                          {!v.isMember && !v.nickname ? <span className="text-[12px] text-ink-mute">로그인 전</span> : null}
                        </div>
                        <div className={`mt-0.5 truncate text-[13px] ${statusTone(v)}`}>{v.status}</div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] tabular-nums text-ink-mute">
                          {v.cart.count > 0 ? <span className="text-ink">장바구니 {v.cart.qty}개 · {won(v.cart.amount)}{v.cart.unknownPrice ? "+" : ""}</span> : <span>장바구니 없음</span>}
                          {v.orders.count > 0 ? (
                            <span className="text-ink">주문 {v.orders.count}건 · {won(v.orders.amount)}{v.orders.unpaid > 0 ? <span className="text-danger-tx"> · 미결제 {v.orders.unpaid}</span> : <span className="text-ok-tx"> · 결제완료</span>}</span>
                          ) : <span>주문 없음</span>}
                        </div>
                      </div>
                      <span className="shrink-0 pt-0.5 text-[12px] tabular-nums text-ink-mute">{agoText(v.lastSeenAt, now)}</span>
                    </button>
                    {isOpen ? (
                      <div className="grid gap-3 bg-surface-2 px-6 py-3 text-[13px] max-md:px-4 md:grid-cols-2">
                        <div>
                          <div className="mb-1 text-[12px] font-bold text-ink-mute">장바구니 {v.cart.count > 0 ? `${v.cart.qty}개` : ""}</div>
                          {v.cart.items.length === 0 ? <div className="text-ink-mute">담긴 상품 없음</div> : v.cart.items.map((it, i) => (
                            <div key={i} className="flex justify-between gap-2"><span className="min-w-0 truncate text-ink">{it.name}</span><span className="shrink-0 tabular-nums text-ink">{it.qty}개</span></div>
                          ))}
                          {v.cart.count > v.cart.items.length ? <div className="text-ink-mute">외 {v.cart.count - v.cart.items.length}줄</div> : null}
                        </div>
                        <div>
                          <div className="mb-1 text-[12px] font-bold text-ink-mute">주문 {v.orders.count > 0 ? `${v.orders.count}건` : ""}</div>
                          {v.orders.items.length === 0 ? <div className="text-ink-mute">이번 방송(오늘) 주문 없음</div> : v.orders.items.map((o, i) => (
                            <div key={i} className="flex justify-between gap-2">
                              <span className={`min-w-0 truncate ${o.status === "canceled" ? "text-ink-mute line-through" : "text-ink"}`}>{o.name}</span>
                              <span className={`shrink-0 tabular-nums ${o.status === "paid" ? "text-ok-tx" : o.status === "unpaid" ? "text-danger-tx" : "text-ink-mute"}`}>{o.status === "paid" ? "결제완료" : o.status === "unpaid" ? "미결제" : "취소"} · {won(o.amount)}</span>
                            </div>
                          ))}
                        </div>
                        {v.activity?.label && v.activity.kind !== "submitted" ? <div className="text-[12px] text-ink-mute md:col-span-2">마지막 동작 · {v.status} · {agoText(new Date(v.activity.at).toISOString(), now)}</div> : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {(data?.total ?? 0) > (data?.listed ?? 0) ? (
            <div className="px-6 py-3 text-center text-[12px] text-ink-mute">목록은 최근 {data?.listed}명까지 · 외 {((data?.total ?? 0) - (data?.listed ?? 0)).toLocaleString("ko-KR")}명 더 접속 중</div>
          ) : null}
        </div>
      </aside>
    </>,
    document.body,
  );
}
