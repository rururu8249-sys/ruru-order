"use client";
// [2026-11-12] 방송 시청 선물 — 선물 받은 사람 목록(페이지 넘김, 무한 스크롤 아님) + 최근 30일 요약.
//   서버 /api/admin-live/welcome-point?list=1 (관리자만·읽기만). 주문은 «선물 받은 뒤» 들어온 주문서만 셈.
import { useEffect, useState } from "react";
import ProductPagination from "@/components/admin-live/ProductPagination";

type Row = {
  id: string; at: string; kind: "first" | "back"; amount: number;
  nickname: string; name: string; phoneTail: string;
  orders: number; paidOrders: number; paidAmount: number;
};
type Summary = { days: number; gifts: number; points: number; ordered: number; paid: number; paidAmount: number; capped: boolean };

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "0%");

function whenText(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const k = new Date(d.getTime() + 9 * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

export default function WelcomeRecipientList() {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [msg, setMsg] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch(`/api/admin-live/welcome-point?list=1&page=${page}&size=${size}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j?.ok) throw new Error(j?.message || "읽기 실패");
        setRows(Array.isArray(j.rows) ? j.rows : []);
        setTotal(Number(j.total) || 0);
        if (j.summary) setSummary(j.summary);
        setState("ready");
      })
      .catch((e) => { if (alive) { setState("error"); setMsg(e instanceof Error ? e.message : "읽기 실패"); } });
    return () => { alive = false; };
  }, [page, size, reload]);

  const pageCount = Math.max(1, Math.ceil(total / size));
  const start = total ? (page - 1) * size + 1 : 0;
  const end = Math.min(total, page * size);

  return (
    <div className="grid gap-2 border-t border-line pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-ink">선물 받은 사람</span>
        <button type="button" onClick={() => { setPage(1); setReload((n) => n + 1); }} disabled={state === "loading"}
          className="h-8 shrink-0 rounded-lg border border-line bg-white px-3 text-[12px] font-bold text-ink disabled:opacity-50">새로고침</button>
      </div>

      {summary ? (
        <div className="rounded-lg bg-white px-3 py-2 text-[13px] text-ink-soft">
          <div>최근 {summary.days}일 <b className="text-ink">{summary.gifts.toLocaleString("ko-KR")}명</b> 받음 · {summary.points.toLocaleString("ko-KR")}P</div>
          <div>그중 주문 <b className="text-ink">{summary.ordered}명</b>({pct(summary.ordered, summary.gifts)}) · 결제완료 <b className="text-ink">{summary.paid}명</b> · {won(summary.paidAmount)}</div>
          {summary.capped ? <div className="text-[12px] text-ink-mute">최신 2,000명까지만 셌어요</div> : null}
        </div>
      ) : null}

      {state === "error" ? <div className="text-[12px] text-danger">{msg}</div> : null}
      {state === "loading" && !rows.length ? <div className="text-[12px] text-ink-mute">불러오는 중…</div> : null}
      {state !== "loading" && state !== "error" && !rows.length ? <div className="text-[12px] text-ink-mute">아직 선물 받은 사람이 없어요</div> : null}

      {rows.length ? (
        <ul className={`grid divide-y divide-line rounded-lg bg-white ${state === "loading" ? "opacity-60" : ""}`}>
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold text-ink">
                  {r.nickname || "닉네임 없음"}{r.name ? <span className="font-normal text-ink-soft"> · {r.name}</span> : null}
                  {r.phoneTail ? <span className="font-normal text-ink-mute"> · {r.phoneTail}</span> : null}
                </div>
                <div className="text-[12px] text-ink-mute">
                  {r.kind === "first" ? "처음 오신 선물" : "오랜만에 오신 선물"} {r.amount.toLocaleString("ko-KR")}P · {whenText(r.at)}
                </div>
              </div>
              <div className="shrink-0 text-right text-[12px]">
                {r.paidOrders > 0 ? (
                  <><div className="font-bold text-ink">결제완료 {r.paidOrders}건</div><div className="text-ink-soft tabular-nums">{won(r.paidAmount)}</div></>
                ) : r.orders > 0 ? (
                  <div className="font-bold text-ink-soft">주문함 · 미결제</div>
                ) : (
                  <div className="text-ink-mute">주문 없음</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {total > size ? (
        <ProductPagination page={page} pageCount={pageCount} total={total} start={start} end={end} size={size} label="선물 받은 사람"
          unit="명" onPage={(p) => setPage(Math.min(pageCount, Math.max(1, p)))} onSize={(n) => { setSize(n); setPage(1); }} />
      ) : total ? <div className="text-[12px] text-ink-mute">총 {total}명</div> : null}
    </div>
  );
}
