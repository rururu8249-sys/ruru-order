"use client";

// [2026-11-27 사장님] 유튜브 채팅 기록 — «채팅으로 주문했다»고 하는 손님 대화 돌려보기.
//   방송 고르기 + 닉네임 검색(그 사람 말만) + 보기 칩 [전체 대화 · 주문 같은 말 · 의심 N]
//   주문 같은 말 = 연한 주황 줄 + 근거 낱말 굵게(강조용, 판정 아님). 줄 누르면 그 글 앞뒤 3분 대화.
//   닉네임을 찾으면 그 닉네임 주문서도 같이 보여 줌(있다/없다 바로 비교). 읽기만, 돈·주문 무접촉.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { orderLikeReasons } from "@/lib/youtubeChatLog";

type Bc = { id: string; title: string; startedAt: string | null; endedAt: string | null; live: boolean; chatCount: number };
type Msg = { message_id: string; broadcast_id: string | null; channel_id: string | null; author_name: string; is_owner: boolean; is_bot: boolean; message: string; order_like: boolean; published_at: string };
type OrderGroup = { code: string; nickname: string; name: string; createdAt: string; status: string; payment: string; items: string[] };
type Suspect = { author: string; channelId: string | null; orderLikeCount: number; firstAt: string; lastAt: string; samples: string[]; similar: string[] };
type View = "all" | "order" | "suspect";

const KST = { timeZone: "Asia/Seoul" } as const;
const hms = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { ...KST, hour12: false });
const md = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ko-KR", { ...KST, month: "2-digit", day: "2-digit", weekday: "short" }) : "");
const bcLabel = (b: Bc) => `${md(b.startedAt)} ${b.title || "방송"}${b.live ? " · 방송 중" : ""}`;

/** 근거 낱말을 굵게 */
function Highlighted({ text, words }: { text: string; words: string[] }) {
  const ws = words.filter((w) => w && w !== "번호+옵션").sort((a, b) => b.length - a.length);
  if (!ws.length) return <>{text}</>;
  const esc = ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "\\s?-?\\s?"));
  const parts = text.split(new RegExp(`(${esc.join("|")})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 === 1 ? <b key={i} className="font-bold text-ink">{p}</b> : <span key={i}>{p}</span>))}</>;
}

function MsgRow({ m, focus, onOpen }: { m: Msg; focus?: boolean; onOpen?: () => void }) {
  const r = m.order_like ? orderLikeReasons(m.message) : { orderLike: false, reasons: [] as string[] };
  const who = m.is_owner ? "사장님" : m.is_bot ? "알림" : "";
  return (
    <button type="button" onClick={onOpen} disabled={!onOpen}
      className={`relative grid w-full grid-cols-[72px_minmax(0,140px)_1fr] items-start gap-3 px-4 py-2 text-left text-[13px] max-sm:grid-cols-[60px_1fr] ${m.order_like ? "bg-warn-bg" : focus ? "bg-surface-2" : "hover:bg-surface-2"} ${onOpen ? "cursor-pointer" : "cursor-default"}`}>
      {m.order_like ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-warn-tx" /> : null}
      {focus ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-ink" /> : null}
      <span className="tabular-nums text-ink-mute">{hms(m.published_at)}</span>
      <span className={`truncate font-semibold max-sm:col-start-2 ${m.is_owner || m.is_bot ? "text-ink-mute" : "text-ink"}`}>
        {m.author_name || "(이름 없음)"}{who ? <span className="ml-1 text-xs font-normal">· {who}</span> : null}
      </span>
      <span className={`break-words max-sm:col-span-2 ${m.is_bot ? "text-ink-mute" : "text-ink-soft"}`}>
        <Highlighted text={m.message} words={r.reasons} />
        {m.order_like ? <span className="ml-2 inline-flex h-6 items-center rounded-lg bg-surface px-2 align-middle text-xs font-semibold text-warn-tx">주문 같은 말</span> : null}
      </span>
    </button>
  );
}

export default function YoutubeChatLogPanel({ initialNick = "", initialBroadcastId = "" }: { initialNick?: string; initialBroadcastId?: string }) {
  const [bcs, setBcs] = useState<Bc[] | null>(null);
  const [bc, setBc] = useState(initialBroadcastId);
  const [q, setQ] = useState(initialNick.replace(/^@+/, ""));
  const [qLive, setQLive] = useState(initialNick.replace(/^@+/, ""));
  const [view, setView] = useState<View>("all");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [orders, setOrders] = useState<OrderGroup[] | null>(null);
  const [suspects, setSuspects] = useState<Suspect[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [around, setAround] = useState<{ id: string; list: Msg[] } | null>(null);
  const reqRef = useRef(0);

  // 방송 목록(처음 한 번) — 기본: 받은 방송, 없으면 채팅이 저장된 가장 최근 방송
  useEffect(() => {
    let off = false;
    fetch("/api/admin-live/youtube-chat-log", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (off) return;
      const list: Bc[] = Array.isArray(j?.broadcasts) ? j.broadcasts : [];
      setBcs(list);
      if (!initialBroadcastId && !initialNick) setBc((cur) => cur || list.find((b) => b.chatCount > 0)?.id || list[0]?.id || "");
    }).catch(() => { if (!off) setBcs([]); });
    return () => { off = true; };
  }, [initialBroadcastId, initialNick]);

  // 닉네임 칸은 멈춘 뒤 0.4초에 찾기
  useEffect(() => { const t = setTimeout(() => setQ(qLive.trim().replace(/^@+/, "")), 400); return () => clearTimeout(t); }, [qLive]);

  const load = useCallback(async () => {
    if (!bc && !q) { setMsgs([]); setOrders(null); return; }
    const id = ++reqRef.current;
    setLoading(true); setErr(""); setAround(null);
    try {
      const p = new URLSearchParams({ mode: "chat" });
      if (bc) p.set("bc", bc);
      if (q) p.set("q", q);
      const j = await fetch(`/api/admin-live/youtube-chat-log?${p}`, { cache: "no-store" }).then((r) => r.json());
      if (id !== reqRef.current) return;
      if (!j?.ok) throw new Error(j?.message || "불러오지 못했어요");
      setMsgs(j.messages || []);
      setOrders(q ? j.orders || [] : null);
    } catch (e) {
      if (id === reqRef.current) setErr(String((e as Error).message || e));
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, [bc, q]);
  useEffect(() => { void load(); }, [load]);

  // 의심 목록(방송 바뀔 때)
  useEffect(() => {
    setSuspects(null);
    if (!bc) return;
    let off = false;
    fetch(`/api/admin-live/youtube-chat-log?mode=suspects&bc=${encodeURIComponent(bc)}`, { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (!off) setSuspects(j?.ok ? j.suspects || [] : []); }).catch(() => { if (!off) setSuspects([]); });
    return () => { off = true; };
  }, [bc]);

  const openAround = useCallback(async (m: Msg) => {
    if (around?.id === m.message_id) { setAround(null); return; }
    const b = m.broadcast_id || bc;
    if (!b) return;
    const j = await fetch(`/api/admin-live/youtube-chat-log?mode=around&bc=${encodeURIComponent(b)}&at=${encodeURIComponent(m.published_at)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setAround({ id: m.message_id, list: j?.ok ? j.messages || [] : [] });
  }, [around, bc]);

  const shown = useMemo(() => (view === "order" ? msgs.filter((m) => m.order_like) : msgs), [msgs, view]);
  const orderLikeN = useMemo(() => msgs.filter((m) => m.order_like).length, [msgs]);
  const bcTitle = useMemo(() => new Map((bcs || []).map((b) => [b.id, bcLabel(b)])), [bcs]);

  // 방송 안 고르고 닉네임만 찾으면 방송별로 묶음
  const groups = useMemo(() => {
    const g: { bc: string; list: Msg[] }[] = [];
    for (const m of shown) {
      const key = m.broadcast_id || "";
      const last = g[g.length - 1];
      if (last && last.bc === key) last.list.push(m); else g.push({ bc: key, list: [m] });
    }
    return g;
  }, [shown]);

  const chip = (on: boolean) => `inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm ${on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-surface-2"}`;

  return (
    <div className="flex flex-col gap-3">
      {/* 필터 한 줄: 방송 · 닉네임 · 보기 칩 */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={bc} onChange={(e) => { setBc(e.target.value); setView("all"); }} aria-label="방송"
          className="h-9 min-w-0 max-w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink sm:max-w-[320px]">
          <option value="">모든 방송(닉네임으로 찾기)</option>
          {(bcs || []).map((b) => <option key={b.id} value={b.id}>{bcLabel(b)} · 채팅 {b.chatCount}</option>)}
        </select>
        <input value={qLive} onChange={(e) => setQLive(e.target.value)} placeholder="닉네임 검색" aria-label="닉네임 검색"
          className="h-9 min-w-[160px] flex-1 rounded-lg border border-line bg-surface px-3 text-base text-ink sm:text-sm" />
        {qLive ? <button type="button" onClick={() => setQLive("")} className="h-9 rounded-lg px-2 text-sm text-ink-mute hover:bg-surface-2">초기화</button> : null}
      </div>
      <div className="flex gap-2 overflow-x-auto">
        <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")} className={chip(view === "all")}>전체 대화 {msgs.length}</button>
        <button type="button" aria-pressed={view === "order"} onClick={() => setView("order")} className={chip(view === "order")}>주문 같은 말 {orderLikeN}</button>
        {bc ? <button type="button" aria-pressed={view === "suspect"} onClick={() => setView("suspect")} className={chip(view === "suspect")}>
          주문서 없는 사람 {suspects ? suspects.length : "…"}</button> : null}
      </div>

      {/* 닉네임으로 찾으면: 그 닉네임 주문서 */}
      {q && orders && view !== "suspect" ? (
        <div className="rounded-xl border border-line bg-surface">
          <div className="border-b border-line-soft px-4 py-2 text-sm font-bold text-ink">「{q}」 주문서 {orders.length}건{bc ? " · 이 방송" : ""}</div>
          {orders.length === 0 ? <p className="px-4 py-3 text-[13px] text-warn-tx">이 닉네임으로 낸 주문서가 없어요 — 닉네임을 바꿨을 수 있으니 이름으로도 찾아보세요.</p> : (
            <ul className="divide-y divide-line-soft">
              {orders.map((o) => (
                <li key={o.code} className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2 text-[13px]">
                  <div className="min-w-0">
                    <div className="font-semibold text-ink">{o.nickname}{o.name ? <span className="font-normal text-ink-mute"> · {o.name}</span> : null}</div>
                    <div className="truncate text-ink-soft">{o.items.slice(0, 3).join(", ")}{o.items.length > 3 ? ` 외 ${o.items.length - 3}` : ""}</div>
                  </div>
                  <div className="text-right text-xs text-ink-mute tabular-nums">{md(o.createdAt)} {hms(o.createdAt).slice(0, 5)}<div>{o.status}</div></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {err ? <p className="text-[13px] text-danger-tx">{err} — 잠시 뒤 다시 열어 주세요.</p> : null}

      {view === "suspect" ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {suspects === null ? <p className="px-4 py-6 text-[13px] text-ink-mute">찾는 중…</p>
            : suspects.length === 0 ? <p className="px-4 py-6 text-[13px] text-ink-mute">주문 같은 말을 했는데 주문서가 없는 사람이 없어요.</p> : (
              <ul className="divide-y divide-line-soft">
                {suspects.map((s) => (
                  <li key={`${s.channelId}|${s.author}`} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-ink">{s.author} <span className="font-normal text-ink-mute tabular-nums">· 주문 같은 말 {s.orderLikeCount}번 · {hms(s.firstAt).slice(0, 5)}~{hms(s.lastAt).slice(0, 5)}</span></div>
                      <div className="truncate text-[13px] text-ink-soft">{s.samples.join(" / ")}</div>
                      {s.similar.length ? <div className="text-xs text-warn-tx">비슷한 주문 닉네임: {s.similar.join(", ")}</div> : null}
                    </div>
                    <button type="button" onClick={() => { setQLive(s.author.replace(/^@+/, "")); setView("all"); }}
                      className="h-9 shrink-0 rounded-lg border border-line bg-surface px-3 text-sm text-ink hover:bg-surface-2">대화 보기</button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {loading && !msgs.length ? <p className="px-4 py-6 text-[13px] text-ink-mute">불러오는 중…</p>
            : !bc && !q ? <p className="px-4 py-6 text-[13px] text-ink-mute">방송을 고르거나 닉네임을 적어 주세요.</p>
            : shown.length === 0 ? <p className="px-4 py-6 text-[13px] text-ink-mute">{q ? `「${q}」 채팅이 없어요 — 닉네임 일부만 적어도 찾아요.` : "저장된 채팅이 없어요 — 방송 중 1분마다 쌓여요."}</p> : (
              groups.map((g) => (
                <div key={g.bc || "none"}>
                  {!bc ? <div className="sticky top-0 z-[1] border-b border-line-soft bg-surface-2 px-4 py-1.5 text-xs font-semibold text-ink-soft">{bcTitle.get(g.bc) || "방송"}</div> : null}
                  <div className="divide-y divide-line-soft">
                    {g.list.map((m) => (
                      <div key={m.message_id}>
                        <MsgRow m={m} onOpen={() => void openAround(m)} />
                        {around?.id === m.message_id ? (
                          <div className="border-y border-line bg-canvas py-1">
                            <div className="px-4 py-1 text-xs font-semibold text-ink-mute">앞뒤 3분 대화</div>
                            {around.list.length === 0 ? <p className="px-4 py-2 text-[13px] text-ink-mute">앞뒤 대화가 없어요.</p>
                              : around.list.map((a) => <MsgRow key={a.message_id} m={a} focus={a.message_id === m.message_id} />)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
        </div>
      )}
    </div>
  );
}
