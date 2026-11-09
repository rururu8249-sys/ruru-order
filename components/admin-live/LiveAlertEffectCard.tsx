"use client";

// [2026-11-09 사장님 「알림톡 돈값」] 판매분석 맨 위 — 최근 알림 보낸 방송마다 «받은 사람 → 사이트 접속 → 주문 → 결제 금액».
//   읽기 전용(/api/admin-live/live-alert-effect GET). 한계는 화면에 그대로 적는다(사장님 19:34 「정확히 명시」).

import { useCallback, useEffect, useState } from "react";

type Row = {
  broadcastId: string; title: string; startedAt: string; endedAt: string;
  alerted: number; cost: number; siteVisitors: number; alertedVisited: number;
  buyers: number; alertedBuyers: number; alertedPaidBuyers: number; paidSum: number; alertedPaidSum: number;
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "-");
const day = (iso: string) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "");

export default function LiveAlertEffectCard() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/admin-live/live-alert-effect?limit=4", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "불러오지 못했어요");
      setRows(j.rows || []);
    } catch (e) { setErr(String((e as Error).message || e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open && rows === null && !loading) void load(); }, [open, rows, loading, load]);

  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-label="방송 알림 효과">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[16px] font-bold text-ink">방송 알림 효과</h3>
        <span className="text-[12px] text-ink-mute">알림 받은 사람이 사이트에 들어왔는지 · 주문했는지</span>
        <div className="ml-auto flex gap-2">
          {open ? <button type="button" onClick={() => void load()} disabled={loading} className="h-9 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink disabled:opacity-50">{loading ? "세는 중…" : "새로고침"}</button> : null}
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="h-9 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink">{open ? "접기" : "보기"}</button>
        </div>
      </div>
      {open ? (
        <div className="mt-3">
          {err ? <p role="alert" className="text-[13px] text-danger-tx">{err}</p> : rows === null ? <p className="text-[13px] text-ink-mute">최근 방송 4개를 세는 중이에요(30초~1분 걸려요)…</p> : rows.length === 0 ? <p className="text-[13px] text-ink-mute">알림을 보낸 방송이 아직 없어요.</p> : (
            <div className="grid gap-3">
              {rows.map((r) => (
                <div key={r.broadcastId} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[14px] font-bold text-ink">{r.title}</span>
                    <span className="text-[12px] tabular-nums text-ink-mute">{day(r.startedAt)}{r.endedAt ? ` ~ ${day(r.endedAt)}` : " · 방송 중"}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[13px] tabular-nums sm:grid-cols-4">
                    <div className="rounded-lg bg-surface-2 p-2"><div className="text-[12px] text-ink-mute">알림 받은 사람</div><div className="text-[16px] font-bold text-ink">{r.alerted.toLocaleString("ko-KR")}명</div><div className="text-[12px] text-ink-mute">비용 약 {won(r.cost)}</div></div>
                    <div className="rounded-lg bg-surface-2 p-2"><div className="text-[12px] text-ink-mute">그중 사이트 들어옴</div><div className="text-[16px] font-bold text-ink">{r.alertedVisited.toLocaleString("ko-KR")}명 <span className="text-[12px] font-normal text-ink-mute">({pct(r.alertedVisited, r.alerted)})</span></div><div className="text-[12px] text-ink-mute">방송 시간 전체 {r.siteVisitors.toLocaleString("ko-KR")}명</div></div>
                    <div className="rounded-lg bg-surface-2 p-2"><div className="text-[12px] text-ink-mute">그중 주문함</div><div className="text-[16px] font-bold text-ink">{r.alertedBuyers.toLocaleString("ko-KR")}명 <span className="text-[12px] font-normal text-ink-mute">({pct(r.alertedBuyers, r.alerted)})</span></div><div className="text-[12px] text-ink-mute">방송 주문한 사람 {r.buyers}명 중 {pct(r.alertedBuyers, r.buyers)}</div></div>
                    <div className="rounded-lg bg-surface-2 p-2"><div className="text-[12px] text-ink-mute">그 사람들 결제완료</div><div className="text-[16px] font-bold text-ink">{won(r.alertedPaidSum)}</div><div className="text-[12px] text-ink-mute">방송 결제 {won(r.paidSum)} 중 {pct(r.alertedPaidSum, r.paidSum)}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <ul className="mt-3 grid gap-0.5 text-[12px] text-ink-mute">
            <li>· 이 숫자로 알 수 없는 것: 유튜브 앱으로 방송을 봤는지(유튜브가 알려 주지 않아요), 알림 «때문에» 왔는지(알림 없이도 왔을 단골일 수 있어요).</li>
            <li>· 「사이트 들어옴」은 그 방송 시간에 닉네임이 남은 접속만 맞춘 숫자예요. 로그인 전에 나갔거나 닉네임이 바뀐 사람은 빠져서 실제보다 적게 나올 수 있어요.</li>
            <li>· 주문·결제는 방송 시작~종료 시각 주문, 취소·테스트 제외, 결제완료 기준(텔레그램 결산과 같은 기준). 비용은 1명당 약 13원(11/8 솔라피 청구 기준)으로 셈.</li>
          </ul>
        </div>
      ) : null}
    </section>
  );
}
