"use client";

// [2026-11-09 사장님 18:12 「접속 기록을 사이드패널에 같이 넣는 게 낫지 않나 · 일거수 일투족 · 관리자 계정 노출 X」]
//   「지금 접속」 오른쪽 창(LivePresenceDrawer) 폐지 → 고객 › 접속 기록 안 첫 탭 「지금 접속」 으로. 이 부품이 그 탭 내용.
//   줄 = 닉네임·이름 / 지금 하는 일 / 장바구니·주문 요약 / 마지막 신호 → 누르면 «최근 동작 타임라인»(시각·동작) + 장바구니·주문 상세.
//   읽기 전용: /api/admin-live/presence GET 만(부모가 넘겨줌). 주문·입금·장바구니 쓰기 0.

import { useEffect, useMemo, useState } from "react";
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

const chipCls = (on: boolean) => `inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] tabular-nums ${on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-surface-2"}`;
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

export function agoText(iso: string | number, now = Date.now()) {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 60) return `${sec}초 전`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  return `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분 전`;
}

const clock = (ms: number) => {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
};

function statusTone(v: LiveVisitor): string {
  const k = v.activity?.kind;
  if (k === "submitted") return "text-ok-tx";
  if (k === "cart_remove" || k === "sheet_close") return "text-danger-tx";
  if (k && k !== "browse") return "text-ink";
  return "text-ink-soft";
}
function timelineTone(kind: string): string {
  if (kind === "submitted") return "text-ok-tx";
  if (kind === "cart") return "text-ink font-semibold";
  if (kind === "cart_remove" || kind === "sheet_close") return "text-danger-tx";
  return "text-ink";
}

type Props = {
  data: LivePresencePayload | null;
  refreshing: boolean;
  onRefresh: () => void;
};

export default function LivePresenceList({ data, refreshing, onRefresh }: Props) {
  const [chip, setChip] = useState<LiveChip>("all");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string>("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const visitors = useMemo(() => sortLiveVisitors(data?.visitors ?? []), [data]);
  const list = useMemo(() => filterLiveVisitors(visitors, chip, q), [visitors, chip, q]);
  const s = data?.summary ?? { total: data?.total ?? 0, orderForm: 0, withCart: 0, ordered: 0, guests: 0 };

  const chips: Array<[LiveChip, string, number]> = [
    ["all", "전체", visitors.length],
    ["form", "주문서 화면", s.orderForm],
    ["cart", "장바구니 있음", s.withCart],
    ["ordered", "주문함", s.ordered],
    ["guest", "비회원", s.guests],
  ];

  return (
    <div className="max-w-[760px]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="text-[20px] font-bold tabular-nums text-ink">지금 접속 {(data?.total ?? 0).toLocaleString("ko-KR")}명</div>
        <div className="text-[12px] text-ink-mute">최근 2분 안에 신호 · 20초마다 새로 셈 · 관리자·제외 계정은 안 셈 · 주문은 {data?.since ? "이번 방송(또는 오늘)" : "오늘"} 기준</div>
        <button type="button" onClick={onRefresh} disabled={refreshing} className="ml-auto inline-flex h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[14px] text-ink hover:bg-surface-2 disabled:opacity-50">{refreshing ? "새로 세는 중…" : "새로고침"}</button>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]">
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

      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        {!data || data.available === false ? (
          <div className="px-4 py-10 text-center text-[13px] text-ink-mute">접속 정보를 아직 못 읽었어요. 잠시 뒤 새로고침을 눌러 주세요.</div>
        ) : list.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-ink-mute">해당하는 사람이 없어요. 다른 칩을 누르거나 검색어를 지워 보세요.</div>
        ) : (
          <ul>
            {list.map((v, idx) => {
              const isOpen = expanded === v.id;
              const nick = v.nickname || "비회원";
              return (
                <li key={v.id} className={idx > 0 ? "border-t border-line" : ""}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? "" : v.id)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2 ${isOpen ? "bg-surface-2" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[14px] font-bold text-ink">{nick}</span>
                        {v.name ? <span className="text-[13px] text-ink-mute">{v.name}</span> : null}
                        {!v.isMember && !v.nickname ? <span className="text-[12px] text-ink-mute">로그인 전</span> : null}
                        {v.timeline.length > 0 ? <span className="text-[12px] tabular-nums text-ink-mute">동작 {v.timeline.length}</span> : null}
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
                    <div className="grid gap-4 border-t border-line bg-surface px-4 py-3 text-[13px] md:grid-cols-[1fr_280px]">
                      <div>
                        <div className="mb-1 text-[12px] font-bold text-ink-mute">최근 동작 {v.timeline.length ? `${v.timeline.length}개` : ""} <span className="font-normal">· 최신이 위</span></div>
                        {v.timeline.length === 0 ? (
                          <div className="text-ink-mute">아직 기록된 동작이 없어요. 손님이 옵션을 고르거나 담으면 바로 쌓여요.</div>
                        ) : (
                          <ol className="grid gap-1">
                            {v.timeline.map((e, i) => (
                              <li key={`${e.at}-${i}`} className="flex gap-3">
                                <span className="w-[64px] shrink-0 tabular-nums text-ink-mute">{clock(e.at)}</span>
                                <span className={`min-w-0 flex-1 break-words ${timelineTone(e.kind)}`}>{e.text}</span>
                                <span className="shrink-0 tabular-nums text-[12px] text-ink-mute">{agoText(e.at, now)}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                      <div className="grid gap-3 content-start">
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
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {(data?.total ?? 0) > (data?.listed ?? 0) ? (
        <div className="mt-2 text-[12px] text-ink-mute">목록은 최근 {data?.listed}명까지 · 외 {((data?.total ?? 0) - (data?.listed ?? 0)).toLocaleString("ko-KR")}명 더 접속 중</div>
      ) : null}
      <div className="mt-2 text-[12px] text-ink-mute">줄을 누르면 그 손님의 최근 동작(옵션 열기·색상/사이즈·수량·담기·빼기·검색·주문서·주문 완료)이 시각순으로 보여요 · 동작은 손님 폰에서 모아 기존 신호에 같이 와서 서버 부담은 그대로예요</div>
    </div>
  );
}
