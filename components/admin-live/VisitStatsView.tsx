"use client";

// 접속 기록(날짜별·방송별) 화면 — 읽기 전용. /api/admin-live/visit-stats GET 만 부른다.
// [2026-11-07 사장님 「1인당 1회만 유효 카운트 · 칸 사이가 허허벌판 · 사이드 패널로」] 전면 재작성
//   · 사람 = 닉네임 기준 1명(중복 포함 횟수는 괄호), 비회원 = 브라우저 1개
//   · 위: 요약 숫자 4칸(방문자·처음 온 사람·방송 중·주문한 사람) · 표는 왼쪽에 좁게
//   · 줄 누르면 오른쪽 드로어(폭 720): 칩(전체·주문함·주문 안 함·처음·비회원)·검색·사람 표
//   · 주문 / 입금 / 정산 / 배송 / 재고 데이터는 건드리지 않는다(표시 전용).

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { BroadcastBucket, DailyBucket, VisitPerson } from "@/lib/visitStatsAgg";

export type VisitStats = {
  ok?: boolean;
  available?: boolean;
  days?: number;
  totals?: { visitors: number; visits: number; capped: boolean } | null;
  daily?: DailyBucket[];
  broadcasts?: Array<BroadcastBucket & { title: string }>;
};

type Tab = "date" | "broadcast";
type Chip = "all" | "ordered" | "notOrdered" | "new" | "guest";

const n = (v: number) => (v || 0).toLocaleString("ko-KR");

export function seoulStamp(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "-";
  const d = new Date(t + 9 * 60 * 60 * 1000);
  const p2 = (x: number) => String(x).padStart(2, "0");
  return `${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00+09:00`);
  const w = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()] || "";
  return `${date.slice(5).replace("-", ".")}(${w})`;
}

function pct(a: number, b: number) {
  if (!b) return "-";
  return `${Math.round((a / b) * 100)}%`;
}

type Bucket = { key: string; title: string; sub: string } & Pick<DailyBucket, "visitors" | "visits" | "newcomers" | "liveVisitors" | "buyers" | "people" | "peopleCapped">;

const btnSub = "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[14px] text-ink hover:bg-surface-2 disabled:opacity-50 max-md:h-11";
const chipCls = (on: boolean) => `inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] tabular-nums ${on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-surface-2"}`;

// ── 요약 숫자 4칸 ────────────────────────────────────────────────────────
function Summary({ b }: { b: Bucket }) {
  const cells = [
    { label: "방문자", value: `${n(b.visitors)}명`, sub: `중복 포함 ${n(b.visits)}회` },
    { label: "처음 온 사람", value: `${n(b.newcomers)}명`, sub: "" },
    { label: "방송 중 들어온 사람", value: `${n(b.liveVisitors)}명`, sub: "" },
    { label: "주문한 사람", value: `${n(b.buyers)}명`, sub: `방문자 중 ${pct(b.buyers, b.visitors)}` },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 max-md:grid-cols-2">
      {cells.map((c) => (
        <div key={c.label} className="rounded-xl bg-surface-2 px-4 py-3">
          <div className="text-[12px] text-ink-mute">{c.label}</div>
          <div className="mt-0.5 text-[20px] font-bold tabular-nums text-ink">{c.value}</div>
          {c.sub ? <div className="text-[12px] tabular-nums text-ink-mute">{c.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

// ── 오른쪽 드로어: 그날(그 방송)에 누가 왔었나 ──────────────────────────
function PeopleDrawer({ b, onClose }: { b: Bucket; onClose: () => void }) {
  const [chip, setChip] = useState<Chip>("all");
  const [q, setQ] = useState("");
  const [openedAt] = useState(() => Date.now());
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const counts = useMemo(() => {
    const p = b.people;
    return {
      all: p.length,
      ordered: p.filter((x) => x.ordered).length,
      notOrdered: p.filter((x) => x.member && !x.ordered).length,
      new: p.filter((x) => x.isNew).length,
      guest: p.filter((x) => !x.member).length,
    };
  }, [b.people]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return b.people.filter((p) => {
      if (chip === "ordered" && !p.ordered) return false;
      if (chip === "notOrdered" && (!p.member || p.ordered)) return false;
      if (chip === "new" && !p.isNew) return false;
      if (chip === "guest" && p.member) return false;
      if (kw && !p.name.toLowerCase().includes(kw) && !(p.ip || "").includes(kw)) return false;
      return true;
    });
  }, [b.people, chip, q]);

  // 같은 IP 로 들어온 다른 닉네임(장난 다계정·한 사람 여러 닉 파악 보조)
  const ipNames = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of b.people) {
      const ip = (p.ip || "").trim();
      if (!ip || !p.member) continue; // 비회원은 이름이 없어 «누구와 같은지» 알려 줄 게 없음
      const arr = m.get(ip);
      if (arr) arr.push(p.name); else m.set(ip, [p.name]);
    }
    return m;
  }, [b.people]);

  const chips: Array<[Chip, string, number]> = [
    ["all", "전체", counts.all],
    ["ordered", "주문함", counts.ordered],
    ["notOrdered", "주문 안 함", counts.notOrdered],
    ["new", "처음", counts.new],
    ["guest", "비회원", counts.guest],
  ];

  return (
    <>
      <button
        type="button" aria-label="접속 기록 창 닫기" tabIndex={-1}
        onMouseDown={() => { downOnBackdrop.current = true; }}
        onClick={() => { const ok = downOnBackdrop.current && Date.now() - openedAt > 600; downOnBackdrop.current = false; if (ok) onClose(); }}
        className="fixed inset-0 z-[120] bg-black/30"
      />
      <aside role="dialog" aria-modal="true" aria-label={b.title}
        className="fixed inset-y-0 right-0 z-[130] flex w-full max-w-[720px] flex-col bg-surface outline-none"
        style={{ boxShadow: "0 8px 24px rgba(0,0,0,.08)" }}>
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-6 py-4 max-md:h-[52px] max-md:px-4 max-md:py-0">
          <button type="button" onClick={onClose} className={`${btnSub} md:hidden`}>닫기</button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[20px] font-bold text-ink max-md:text-[16px]">{b.title}</h2>
            <div className="text-[12px] text-ink-mute max-md:hidden">{b.sub}</div>
          </div>
          <button type="button" onClick={onClose} className={`${btnSub} max-md:hidden`}>닫기</button>
        </div>

        <div className="shrink-0 border-b border-line px-6 py-3 max-md:px-4">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 tabular-nums">
            <span className="text-[12px] text-ink-mute">방문자 <span className="text-[20px] font-bold text-ink">{n(b.visitors)}</span>명 <span>(중복 포함 {n(b.visits)}회)</span></span>
            <span className="text-[12px] text-ink-mute">주문 <span className="text-[20px] font-bold text-ink">{n(b.buyers)}</span>명 · {pct(b.buyers, b.visitors)}</span>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {chips.map(([k, label, c]) => (
              <button key={k} type="button" onClick={() => setChip(k)} className={chipCls(chip === k)}>
                {label} <span className={chip === k ? "text-white/80" : "text-ink-mute"}>{c}</span>
              </button>
            ))}
          </div>
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉네임·IP 검색" inputMode="search"
            className="mt-2 h-9 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink outline-none focus-visible:border-ink max-md:h-11 max-md:text-[16px]"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <div className="px-6 py-10 text-center text-[13px] text-ink-mute">해당하는 사람이 없어요. 다른 칩을 눌러 보세요.</div>
          ) : (
            <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 36 }} /><col /><col style={{ width: 56 }} /><col style={{ width: 64 }} /><col style={{ width: 96 }} />
              </colgroup>
              <thead>
                <tr className="bg-surface-2 text-[12px] text-ink-mute">
                  <th className="sticky top-0 bg-surface-2 py-2 text-center font-normal">#</th>
                  <th className="sticky top-0 bg-surface-2 py-2 pl-2 text-left font-normal">닉네임</th>
                  <th className="sticky top-0 bg-surface-2 py-2 pr-3 text-right font-normal">방문</th>
                  <th className="sticky top-0 bg-surface-2 py-2 text-center font-normal">주문</th>
                  <th className="sticky top-0 bg-surface-2 py-2 pr-4 text-right font-normal">마지막 접속</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p, i) => {
                  const ip = (p.ip || "").trim();
                  const same = ip ? (ipNames.get(ip) || []).filter((x) => x !== p.name) : [];
                  return (
                    <tr key={`${p.name}-${i}`} className="border-t border-line text-[13px] hover:bg-surface-2">
                      <td className="py-2 text-center text-[12px] tabular-nums text-ink-mute">{i + 1}</td>
                      <td className="min-w-0 py-2 pl-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${p.live ? "bg-danger-tx" : "bg-line"}`} title={p.live ? "방송 중 접속" : "쇼핑몰 접속"} />
                          <span className={`truncate font-semibold ${p.member ? "text-ink" : "text-ink-mute"}`}>{p.name}</span>
                          {p.isNew ? <span className="inline-flex h-5 items-center rounded-md bg-info-bg px-1.5 text-[11px] font-semibold text-info-tx">처음</span> : null}
                        </div>
                        {ip ? (
                          <div className={`truncate text-[12px] ${same.length ? "text-warn-tx" : "text-ink-mute"}`} title={same.length ? `같은 IP: ${same.join(", ")}` : ip}>
                            {ip}{same.length ? ` · ${same[0]}${same.length > 1 ? ` 외 ${same.length - 1}명` : ""}과 같은 인터넷 주소` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${p.visits > 1 ? "text-ink" : "text-ink-mute"}`}>{p.visits}</td>
                      <td className="py-2 text-center">
                        {p.ordered ? <span className="inline-flex h-6 items-center rounded-lg bg-ok-bg px-2 text-[12px] font-semibold text-ok-tx">주문</span> : <span className="text-ink-mute">-</span>}
                      </td>
                      <td className="py-2 pr-4 text-right text-[12px] tabular-nums text-ink-soft">{seoulStamp(p.lastAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="shrink-0 border-t border-line px-6 py-2 text-[12px] text-ink-mute max-md:px-4">
          {n(list.length)}명 표시 · 빨간 점 = 방송 중 접속{b.peopleCapped ? " · 최근 400명까지만" : ""}
        </div>
      </aside>
    </>
  );
}

// ── 본 화면 ──────────────────────────────────────────────────────────────
type Props = { embedded?: boolean; style?: CSSProperties };

export default function VisitStatsView({ style }: Props) {
  const [stats, setStats] = useState<VisitStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("date");
  const [openKey, setOpenKey] = useState<string>("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin-live/visit-stats", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as VisitStats | null;
      setStats(payload?.ok ? payload : { ok: false });
    } catch {
      setStats({ ok: false });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const buckets: Bucket[] = useMemo(() => {
    if (tab === "date") {
      return (stats?.daily || []).map((d) => ({ key: `d:${d.date}`, title: dayLabel(d.date), sub: d.date, ...d }));
    }
    return (stats?.broadcasts || []).map((b) => ({ ...b, key: `b:${b.broadcastId}`, title: b.title, sub: seoulStamp(b.startedAt) + " 시작" }));
  }, [stats, tab]);

  const top = buckets[0];
  const opened = buckets.find((b) => b.key === openKey) || null;
  const close = useCallback(() => setOpenKey(""), []);

  const th = "py-2 text-[12px] font-normal text-ink-mute whitespace-nowrap";
  const tdNum = "py-2 text-right tabular-nums text-[13px]";

  return (
    <div className="flex min-h-0 flex-col" style={style}>
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-6 py-4 max-md:px-4">
        <h2 className="whitespace-nowrap text-[20px] font-bold text-ink">접속 기록</h2>
        <span className="ml-auto text-[12px] tabular-nums text-ink-mute">
          최근 {stats?.days ?? 30}일 · 다녀간 사람 {n(stats?.totals?.visitors ?? 0)}명
        </span>
        <button type="button" onClick={() => void reload()} disabled={loading} className={btnSub}>{loading ? "불러오는 중" : "새로고침"}</button>
      </div>

      <div className="flex shrink-0 gap-4 border-b border-line px-6 max-md:px-4">
        {([["date", "날짜별"], ["broadcast", "방송별"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`-mb-px h-10 border-b-2 px-1 text-[14px] ${tab === k ? "border-ink font-semibold text-ink" : "border-transparent text-ink-mute"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 max-md:px-4">
        {loading ? (
          <div className="py-12 text-center text-[13px] text-ink-mute">불러오는 중…</div>
        ) : stats?.available === false ? (
          <div className="py-12 text-center text-[13px] text-ink-mute">접속 기록 표(visitor_visits)가 없어요. 개발자에게 알려 주세요.</div>
        ) : !stats?.ok ? (
          <div className="py-12 text-center text-[13px] text-ink-mute">기록을 불러오지 못했어요. 새로고침을 눌러 주세요.</div>
        ) : buckets.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-ink-mute">아직 기록이 없어요. 손님이 주문서에 들어오면 쌓여요.</div>
        ) : (
          <div className="max-w-[760px]">
            {top ? (
              <>
                <div className="mb-2 text-[13px] text-ink-soft">{tab === "date" ? "오늘" : "최근 방송"} · {top.title}</div>
                <Summary b={top} />
              </>
            ) : null}

            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr className="bg-surface-2">
                    <th className={`${th} pl-4 text-left ${tab === "date" ? "w-[120px] max-md:w-[96px]" : ""}`}>{tab === "date" ? "날짜" : "방송"}</th>
                    <th className={`${th} w-[150px] pr-3 text-right max-md:w-[120px]`}>방문자 <span className="text-[11px]">(중복 포함)</span></th>
                    <th className={`${th} w-[72px] pr-3 text-right max-md:hidden`}>처음</th>
                    <th className={`${th} w-[80px] pr-3 text-right max-md:hidden`}>방송 중</th>
                    <th className={`${th} w-[72px] pr-3 text-right max-md:w-[56px] max-md:pr-4`}>주문</th>
                    <th className={`${th} w-[72px] pr-4 text-right max-md:hidden`}>주문율</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr key={b.key} onClick={() => setOpenKey(b.key)} className="h-10 cursor-pointer border-t border-line hover:bg-surface-2" title="누르면 누가 왔는지 보여요">
                      <td className="min-w-0 pl-4 text-[13px] font-semibold text-ink">
                        <div className="truncate">{b.title}</div>
                        {tab === "broadcast" ? <div className="truncate text-[12px] font-normal text-ink-mute">{b.sub}</div> : null}
                      </td>
                      <td className={`${tdNum} pr-3 font-semibold text-ink`}>{n(b.visitors)}명 <span className="font-normal text-ink-mute max-md:block max-md:text-[12px]">({n(b.visits)}회)</span></td>
                      <td className={`${tdNum} pr-3 max-md:hidden ${b.newcomers ? "text-info-tx" : "text-ink-mute"}`}>{n(b.newcomers)}</td>
                      <td className={`${tdNum} pr-3 text-ink-soft max-md:hidden`}>{n(b.liveVisitors)}</td>
                      <td className={`${tdNum} pr-3 max-md:pr-4 ${b.buyers ? "text-ok-tx" : "text-ink-mute"}`}>{n(b.buyers)}</td>
                      <td className={`${tdNum} pr-4 text-ink-soft max-md:hidden`}>{pct(b.buyers, b.visitors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[12px] text-ink-mute">방문자 = 닉네임 기준 1명(폰 2대여도 1명) · 괄호 = 들어온 횟수 · 줄을 누르면 사람 목록</div>
          </div>
        )}
      </div>

      {opened ? <PeopleDrawer b={opened} onClose={close} /> : null}
    </div>
  );
}
