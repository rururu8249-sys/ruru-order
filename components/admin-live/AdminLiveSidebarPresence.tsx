"use client";

// [2026-08-29 사장님 요청] 실시간 접속자 — 왼쪽 사이드바 카드
// [2026-11-09 사장님 「접속 기록 간단목록 — 누가 뭐 하는지 실시간으로 제대로」] 재설계:
//   사이드바(220px) 안 목록·장바구니 팝업 폐지 → 카드는 「지금 접속 N명 · 주문서 N · 장바구니 N · 주문 N」 요약만,
//   누르면 오른쪽 창(LivePresenceDrawer)에서 줄마다 닉네임·이름·뭐 하는 중·장바구니·오늘 주문·마지막 신호.
//   읽기 전용: /api/admin-live/presence GET 만(20초). 주문·입금·장바구니 쓰기 0.

import { useEffect, useRef, useState } from "react";
import LivePresenceDrawer, { type LivePresencePayload } from "./LivePresenceDrawer";

const POLL_MS = 20000;

type Props = {
  /** 「접속 기록」을 누르면 고객 › 접속 기록 화면으로 이동 */
  onOpenVisitStats?: () => void;
};

export default function AdminLiveSidebarPresence({ onOpenVisitStats }: Props = {}) {
  const [data, setData] = useState<LivePresencePayload | null>(null);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const stoppedRef = useRef(false);

  const loadPresence = async (manual?: boolean) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch("/api/admin-live/presence", { method: "GET", cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as LivePresencePayload | null;
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

  if (!data || data.available === false) return null;

  const total = data.total ?? 0;
  const s = data.summary ?? { total, orderForm: data.visitors?.filter((v) => v.pageType === "order_form").length ?? 0, withCart: 0, ordered: 0, guests: 0 };

  return (
    <section className="mt-3 shrink-0 rounded-xl border border-line bg-surface p-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="누르면 지금 접속한 사람 목록(누가 뭐 하는지·장바구니·주문)을 오른쪽 창으로"
        className="flex w-full items-center gap-2 rounded-lg text-left hover:bg-surface-2"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={total > 0 ? "absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-ok-tx)] opacity-70" : ""} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${total > 0 ? "bg-[var(--color-ok-tx)]" : "bg-surface-3"}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-ink tabular-nums">지금 접속 {total.toLocaleString("ko-KR")}명</span>
          <span className="block truncate text-[12px] text-ink-mute tabular-nums">주문서 {s.orderForm} · 장바구니 {s.withCart} · 주문 {s.ordered}</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-[13px] text-ink-mute">›</span>
      </button>
      <LivePresenceDrawer
        open={open}
        onClose={() => setOpen(false)}
        data={data}
        refreshing={refreshing}
        onRefresh={() => void loadPresence(true)}
        onOpenVisitStats={onOpenVisitStats}
      />
    </section>
  );
}
