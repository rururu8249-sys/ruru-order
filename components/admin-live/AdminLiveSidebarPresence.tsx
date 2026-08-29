"use client";

// [2026-08-29 사장님 요청] "실시간 접속중인 사람도 확인하고 싶다" + "왼쪽 사이드바에서 보이면 좋겠다"
//
// 안전
//   · 읽기 전용. /api/admin-live/presence GET 만 호출한다.
//   · 주문 / 입금 / 정산 / 배송 / 재고 데이터는 건드리지 않는다.
//   · 표가 없거나 오류가 나도 조용히 숨긴다(관리자 화면을 막지 않는다).

import { useEffect, useRef, useState } from "react";

type Visitor = {
  id: string;
  nickname: string;
  pageType: string;
  pageLabel: string;
  lastSeenAt: string;
};

type VisitStats = {
  ok?: boolean;
  available?: boolean;
  days?: number;
  totals?: { visitors: number; visits: number; capped: boolean } | null;
  daily?: Array<{ date: string; visitors: number; visits: number; live: number; shop: number }>;
  broadcasts?: Array<{ broadcastId: string; title: string; visitors: number; visits: number; startedAt: string }>;
};

type Payload = {
  ok?: boolean;
  available?: boolean;
  total?: number;
  byType?: { orderForm: number; orderLookup: number; admin: number; others: number };
  visitors?: Visitor[];
};

const POLL_MS = 20000;

function maskNickname(value: string) {
  const text = String(value || "").trim();
  if (!text) return "손님";
  const chars = Array.from(text);
  if (chars.length <= 1) return `${chars[0]}*`;
  if (chars.length <= 3) return `${chars[0]}**`;
  return `${chars.slice(0, 2).join("")}**`;
}

export default function AdminLiveSidebarPresence() {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  // [2026-08-29 사장님 요청] 날짜별·방송별 접속 기록
  const [statsOpen, setStatsOpen] = useState(false);
  const [stats, setStats] = useState<VisitStats | null>(null);
  const [statsTab, setStatsTab] = useState<"date" | "broadcast">("date");
  const [statsLoading, setStatsLoading] = useState(false);
  const stoppedRef = useRef(false);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/admin-live/visit-stats", { method: "GET", cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as VisitStats | null;
      if (payload?.ok) setStats(payload);
      else setStats({ ok: false });
    } catch {
      setStats({ ok: false });
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    stoppedRef.current = false;

    const load = async () => {
      if (stoppedRef.current) return;
      try {
        const res = await fetch("/api/admin-live/presence", { method: "GET", cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as Payload | null;
        if (!stoppedRef.current && payload?.ok) setData(payload);
      } catch {
        // 접속자 표시는 보조 기능이라 실패해도 무시한다.
      }
    };

    void load();
    const timer = window.setInterval(load, POLL_MS);

    return () => {
      stoppedRef.current = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!data || data.available === false) return null;

  const total = data.total ?? 0;
  const by = data.byType ?? { orderForm: 0, orderLookup: 0, admin: 0, others: 0 };
  const visitors = data.visitors ?? [];

  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-3 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        title="지금 사이트에 들어와 있는 사람 (최근 2분 안에 신호가 온 접속)"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={total > 0 ? "absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" : ""} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${total > 0 ? "bg-emerald-500" : "bg-slate-300"}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-black tracking-[0.18em] text-ink-mute">LIVE</span>
          <span className="block text-sm font-black text-ink">지금 접속 {total}명</span>
        </span>
        <span className="shrink-0 text-[10px] font-black text-ink-mute">{open ? "▲" : "▼"}</span>
      </button>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {[
          { label: "주문서", value: by.orderForm },
          { label: "조회", value: by.orderLookup },
          { label: "기타", value: by.others },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-surface-2 px-1.5 py-1.5 text-center">
            <div className="text-[9px] font-black text-ink-mute">{item.label}</div>
            <div className="text-[13px] font-black text-ink">{item.value}</div>
          </div>
        ))}
      </div>

      {open ? (
        visitors.length === 0 ? (
          <div className="mt-2 rounded-xl bg-surface-2 px-2 py-3 text-center text-[11px] font-bold text-ink-mute">
            지금 접속중인 사람이 없습니다.
          </div>
        ) : (
          <ul className="mt-2 max-h-[220px] space-y-1 overflow-y-auto">
            {visitors.map((visitor) => (
              <li key={visitor.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-black text-ink">{maskNickname(visitor.nickname)}</span>
                <span className="shrink-0 text-[9.5px] font-black text-ink-mute">{visitor.pageLabel}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
      <button
        type="button"
        onClick={() => { setStatsOpen(true); void loadStats(); }}
        className="mt-2 w-full rounded-xl bg-surface-2 px-2 py-1.5 text-[10.5px] font-black text-ink-soft hover:bg-surface-3"
      >
        📊 접속 기록 보기
      </button>

      {statsOpen ? (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setStatsOpen(false); }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
        >
          <div className="flex max-h-[80vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-[14px] font-black text-ink">📊 접속 기록</span>
              <button type="button" onClick={() => setStatsOpen(false)} className="text-lg leading-none text-ink-mute hover:text-ink">✕</button>
            </div>

            {statsLoading ? (
              <div className="px-4 py-10 text-center text-[12px] font-bold text-ink-mute">불러오는 중…</div>
            ) : stats?.available === false ? (
              <div className="px-4 py-8 text-center text-[12px] font-bold leading-6 text-ink-soft">
                아직 접속 기록을 쌓는 표가 없습니다.
                <br />
                <span className="text-ink-mute">Supabase에서 <b>supabase/visitor_visits_history.sql</b> 을 한 번 실행하면<br />그때부터 날짜별·방송별로 쌓입니다.</span>
              </div>
            ) : !stats?.ok ? (
              <div className="px-4 py-8 text-center text-[12px] font-bold text-ink-mute">기록을 불러오지 못했습니다.</div>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-line px-4 py-2">
                  {([["date", "날짜별"], ["broadcast", "방송별"]] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatsTab(key)}
                      className={[
                        "rounded-full px-3 py-1 text-[11.5px] font-black",
                        statsTab === key ? "bg-rose-deep text-white" : "bg-surface-2 text-ink-soft",
                      ].join(" ")}
                    >{label}</button>
                  ))}
                  <span className="ml-auto text-[10.5px] font-bold text-ink-mute">
                    최근 {stats.days ?? 30}일 · 방문자 {stats.totals?.visitors ?? 0}명
                  </span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  {statsTab === "date" ? (
                    (stats.daily || []).length === 0 ? (
                      <div className="py-8 text-center text-[12px] font-bold text-ink-mute">아직 쌓인 기록이 없습니다.</div>
                    ) : (
                      <ul className="space-y-1">
                        {(stats.daily || []).map((d) => (
                          <li key={d.date} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
                            <span className="w-[86px] shrink-0 text-[12px] font-black text-ink">{d.date}</span>
                            <span className="text-[13px] font-black text-rose-deep">{d.visitors}명</span>
                            <span className="ml-auto text-[10.5px] font-bold text-ink-mute">
                              방송중 {d.live} · 쇼핑몰 {d.shop}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    (stats.broadcasts || []).length === 0 ? (
                      <div className="py-8 text-center text-[12px] font-bold leading-6 text-ink-mute">
                        아직 방송별 기록이 없습니다.
                        <br /><span className="text-[11px]">방송을 켜둔 동안 들어온 손님부터 쌓입니다.</span>
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {(stats.broadcasts || []).map((b) => (
                          <li key={b.broadcastId} className="rounded-xl bg-surface-2 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-[12px] font-black text-ink">{b.title}</span>
                              <span className="shrink-0 text-[13px] font-black text-rose-deep">{b.visitors}명</span>
                            </div>
                            <div className="mt-0.5 text-[10.5px] font-bold text-ink-mute">
                              {String(b.startedAt).slice(0, 16).replace("T", " ")}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
