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

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Visitor = {
  id: string;
  nickname: string;
  pageType: string;
  pageLabel: string;
  lastSeenAt: string;
};

type Payload = {
  ok?: boolean;
  available?: boolean;
  total?: number;
  listed?: number;
  byType?: { orderForm: number; orderLookup: number; admin: number; others: number };
  visitors?: Visitor[];
};

type VisitStats = {
  ok?: boolean;
  available?: boolean;
  days?: number;
  totals?: { visitors: number; visits: number; capped: boolean } | null;
  daily?: Array<{ date: string; visitors: number; visits: number; live: number; shop: number }>;
  broadcasts?: Array<{ broadcastId: string; title: string; visitors: number; visits: number; startedAt: string }>;
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

function agoText(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}초 전`;
  return `${Math.floor(sec / 60)}분 전`;
}

export default function AdminLiveSidebarPresence() {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const stoppedRef = useRef(false);

  // 접속 기록 창
  const [statsOpen, setStatsOpen] = useState(false);
  const [stats, setStats] = useState<VisitStats | null>(null);
  const [statsTab, setStatsTab] = useState<"date" | "broadcast">("date");
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/admin-live/visit-stats", { method: "GET", cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as VisitStats | null;
      setStats(payload?.ok ? payload : { ok: false });
    } catch {
      setStats({ ok: false });
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    stoppedRef.current = false;
    void loadPresence();
    const timer = window.setInterval(() => { void loadPresence(); }, POLL_MS);
    return () => { stoppedRef.current = true; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 창이 떠 있는 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!statsOpen) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setStatsOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = before; window.removeEventListener("keydown", onKey); };
  }, [statsOpen]);

  if (!data || data.available === false) return null;

  const total = data.total ?? 0;
  const listed = data.listed ?? (data.visitors?.length ?? 0);
  const by = data.byType ?? { orderForm: 0, orderLookup: 0, admin: 0, others: 0 };
  const visitors = data.visitors ?? [];
  const more = Math.max(0, total - listed);

  const statsModal = statsOpen && mounted
    ? createPortal(
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setStatsOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 200, background: "rgba(20,12,16,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="접속 기록"
            style={{
              width: "min(560px, 96vw)", maxHeight: "82vh", display: "flex", flexDirection: "column",
              borderRadius: "16px", overflow: "hidden", background: "var(--color-surface)",
              boxShadow: "0 22px 70px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px", borderBottom: "1px solid var(--color-line)" }}>
              <span style={{ fontSize: "14px", fontWeight: 900, color: "var(--color-ink)", whiteSpace: "nowrap" }}>📊 접속 기록</span>
              <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 800, color: "var(--color-ink-mute)", whiteSpace: "nowrap" }}>
                최근 {stats?.days ?? 30}일 · 방문자 {(stats?.totals?.visitors ?? 0).toLocaleString("ko-KR")}명
              </span>
              <button
                type="button"
                onClick={() => setStatsOpen(false)}
                aria-label="닫기"
                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "18px", lineHeight: 1, color: "var(--color-ink-mute)" }}
              >✕</button>
            </div>

            {statsLoading ? (
              <div style={{ padding: "44px 18px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "var(--color-ink-mute)" }}>불러오는 중…</div>
            ) : stats?.available === false ? (
              <div style={{ padding: "36px 22px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "var(--color-ink-soft)", lineHeight: 1.9 }}>
                아직 접속 기록을 쌓는 표가 없습니다.
                <br />
                <span style={{ color: "var(--color-ink-mute)" }}>
                  Supabase에서 <b>supabase/visitor_visits_history.sql</b> 을 한 번 실행하면
                  <br />그때부터 날짜별·방송별로 쌓입니다.
                </span>
              </div>
            ) : !stats?.ok ? (
              <div style={{ padding: "40px 18px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "var(--color-ink-mute)" }}>기록을 불러오지 못했습니다.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: "6px", padding: "10px 16px", borderBottom: "1px solid var(--color-line)" }}>
                  {([["date", "날짜별"], ["broadcast", "방송별"]] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatsTab(key)}
                      style={{
                        border: statsTab === key ? "none" : "1px solid var(--color-line)",
                        borderRadius: "999px", padding: "6px 14px", cursor: "pointer",
                        fontSize: "12px", fontWeight: 900, whiteSpace: "nowrap",
                        background: statsTab === key ? "var(--color-rose-deep)" : "var(--color-surface)",
                        color: statsTab === key ? "#fff" : "var(--color-ink-soft)",
                      }}
                    >{label}</button>
                  ))}
                </div>

                <div style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "12px 16px 16px" }}>
                  {statsTab === "date" ? (
                    (stats.daily || []).length === 0 ? (
                      <div style={{ padding: "34px 10px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "var(--color-ink-mute)" }}>아직 쌓인 기록이 없습니다.</div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {["날짜", "방문자", "방송중", "쇼핑몰"].map((h, i) => (
                              <th key={h} style={{ textAlign: i === 0 ? "left" : "right", fontSize: "10.5px", fontWeight: 900, color: "var(--color-ink-mute)", padding: "0 6px 8px", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(stats.daily || []).map((d) => (
                            <tr key={d.date} style={{ borderTop: "1px solid var(--color-line)" }}>
                              <td style={{ padding: "9px 6px", fontSize: "12.5px", fontWeight: 800, color: "var(--color-ink)", whiteSpace: "nowrap" }}>{d.date}</td>
                              <td style={{ padding: "9px 6px", textAlign: "right", fontSize: "13.5px", fontWeight: 900, color: "var(--color-rose-deep)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{d.visitors.toLocaleString("ko-KR")}</td>
                              <td style={{ padding: "9px 6px", textAlign: "right", fontSize: "12px", fontWeight: 700, color: "var(--color-ink-soft)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{d.live.toLocaleString("ko-KR")}</td>
                              <td style={{ padding: "9px 6px", textAlign: "right", fontSize: "12px", fontWeight: 700, color: "var(--color-ink-soft)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{d.shop.toLocaleString("ko-KR")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  ) : (stats.broadcasts || []).length === 0 ? (
                    <div style={{ padding: "34px 10px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "var(--color-ink-mute)", lineHeight: 1.8 }}>
                      아직 방송별 기록이 없습니다.
                      <br /><span style={{ fontSize: "11.5px" }}>방송을 켜둔 동안 들어온 손님부터 쌓입니다.</span>
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {["방송", "방문자"].map((h, i) => (
                            <th key={h} style={{ textAlign: i === 0 ? "left" : "right", fontSize: "10.5px", fontWeight: 900, color: "var(--color-ink-mute)", padding: "0 6px 8px", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(stats.broadcasts || []).map((b) => (
                          <tr key={b.broadcastId} style={{ borderTop: "1px solid var(--color-line)" }}>
                            <td style={{ padding: "9px 6px" }}>
                              <div style={{ fontSize: "12.5px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "320px" }}>{b.title}</div>
                              <div style={{ marginTop: "2px", fontSize: "10.5px", fontWeight: 700, color: "var(--color-ink-mute)" }}>{String(b.startedAt).slice(0, 16).replace("T", " ")}</div>
                            </td>
                            <td style={{ padding: "9px 6px", textAlign: "right", fontSize: "13.5px", fontWeight: 900, color: "var(--color-rose-deep)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{b.visitors.toLocaleString("ko-KR")}명</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

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
          <span className="block text-[10px] font-black tracking-[0.18em] text-ink-mute">LIVE</span>
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
          className="shrink-0 text-[10px] font-black text-ink-mute"
        >{open ? "▲" : "▼"}</button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {[
          { label: "주문서", value: by.orderForm },
          { label: "조회", value: by.orderLookup },
          { label: "기타", value: by.others },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-surface-2 px-1.5 py-1.5 text-center">
            <div className="text-[9px] font-black text-ink-mute">{item.label}</div>
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
                <li key={visitor.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-black text-ink">{maskNickname(visitor.nickname)}</span>
                  <span className="shrink-0 text-[9.5px] font-black text-ink-mute">{visitor.pageLabel}</span>
                  <span className="shrink-0 text-[9px] font-bold text-ink-mute tabular-nums">{agoText(visitor.lastSeenAt)}</span>
                </li>
              ))}
            </ul>
            {more > 0 ? (
              <div className="mt-1.5 text-center text-[10.5px] font-bold text-ink-mute">
                이름은 최근 {listed}명까지만 보여요 · 외 {more.toLocaleString("ko-KR")}명 더 접속중
              </div>
            ) : null}
          </>
        )
      ) : null}

      <button
        type="button"
        onClick={() => { setStatsOpen(true); void loadStats(); }}
        className="mt-2 w-full rounded-xl bg-surface-2 px-2 py-1.5 text-[10.5px] font-black text-ink-soft hover:bg-surface-3"
      >
        📊 접속 기록 보기
      </button>

      {statsModal}
    </section>
  );
}
