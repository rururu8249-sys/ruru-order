"use client";

// [2026-09-05 사장님 요청 · 단골 리포트] "초등학생도 쓰는" 실행형 리포트.
//   카드 4장(새손님/단골/떠나려는 단골/떠난 손님) + 🚨떠나려는 단골 명단 + 포인트·쪽지 원클릭.
//   돈 로직: 기존 단건 지급 API를 그대로 쓰는 useBulkPointGrant 재사용(새 돈 경로 0).
//   쪽지: 기존 /api/admin-live/customer-note 의 targets 일괄 발송 재사용.
//   통계: /api/admin-live/repurchase-stats (읽기 전용).

import { useEffect, useMemo, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";
import { useBulkPointGrant } from "./useBulkPointGrant";

type Stats = {
  ok: boolean;
  totalCustomers: number;
  repeaters: number;
  repurchaseRatePct: number;
  gapDays: { samples: number; p25: number; median: number; p75: number; p90: number };
  segments: { fresh: number; loyal: number; atRisk: number; gone: number };
  atRiskList: Array<{ phone: string; nick: string; buys: number; lastBuy: string; daysSince: number }>;
  recentComebackPhones: string[];
  lapsedDaysCut: number;
  monthly: Array<{ month: string; new: number; repeat: number }>;
  topCustomers: Array<{ nick: string; n: number; last: string }>;
};

const DAY_CHOICES = [30, 45, 60, 90];
const DEFAULT_POINT = 3000;
const COMEBACK_REASON = "복귀 감사 포인트"; // ⚠️ 재지급 잠금이 이 문구("복귀")로 식별 — 바꾸면 잠금도 같이 볼 것

export default function AdminLiveLoyaltyReport() {
  const [days, setDays] = useState(45);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [amountText, setAmountText] = useState(String(DEFAULT_POINT));
  const [noteText, setNoteText] = useState("");
  const [sending, setSending] = useState(false);
  const { grant } = useBulkPointGrant();

  const load = async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin-live/repurchase-stats?days=${d}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as Stats | null;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.message || `조회 실패(${res.status})`);
      setStats(json);
      // 기본 선택: 최근 30일 안에 이미 복귀 포인트 받은 사람은 빼고 전원 선택
      const lock = new Set(json.recentComebackPhones || []);
      setChecked(new Set(json.atRiskList.filter((c) => !lock.has(c.phone)).map((c) => c.phone)));
    } catch (e) {
      showAdminToast("단골 리포트 조회 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(days); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const lockSet = useMemo(() => new Set(stats?.recentComebackPhones || []), [stats]);
  const thisMonth = stats?.monthly?.[stats.monthly.length - 1];
  const defaultNote = `오랜만이에요! 보고 싶어서 감사 포인트 ${Number(amountText || 0).toLocaleString()}P 넣어드렸어요 🎁 다음 방송에서 바로 쓰실 수 있어요. 곧 만나요!`;

  const doSend = async () => {
    if (!stats) return;
    const amount = Math.floor(Number(amountText.replace(/[^0-9]/g, "") || 0));
    if (!amount || amount <= 0) { showAdminToast("포인트 금액을 적어주세요.", "error"); return; }
    if (amount > 50000) { showAdminToast("1인당 5만P를 넘는 금액은 일괄로 보낼 수 없어요. 개별 지급을 사용해 주세요.", "error"); return; }
    const targets = stats.atRiskList.filter((c) => checked.has(c.phone) && !lockSet.has(c.phone));
    if (targets.length === 0) { showAdminToast("보낼 대상이 없습니다.", "error"); return; }
    const totalWon = amount * targets.length;
    if (!window.confirm(`${targets.length}명에게 ${amount.toLocaleString()}P씩, 총 ${totalWon.toLocaleString()}P를 지급하고 쪽지를 보냅니다.\n\n(최근 30일 안에 이미 받은 분은 자동 제외됐어요)\n\n진행할까요?`)) return;
    setSending(true);
    try {
      const result = await grant(
        targets.map((t) => ({ phone: t.phone, label: t.nick })),
        { amount, reason: COMEBACK_REASON, adminMemo: `단골 리포트 일괄(기준 ${days}일)`, customerVisible: true },
      );
      const message = (noteText.trim() || defaultNote).slice(0, 500);
      let noteOk = false;
      try {
        const res = await fetch("/api/admin-live/customer-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ targets: targets.map((t) => ({ phone: t.phone })), title: "💝 오랜만이에요!", message }),
        });
        const json = await res.json().catch(() => null);
        noteOk = Boolean(res.ok && json?.ok);
      } catch { noteOk = false; }
      showAdminToast(
        `포인트 지급 ${result.success}/${result.total}명 완료` +
        (result.failed.length ? `\n실패 ${result.failed.length}명: ${result.failed.slice(0, 3).map((f) => f.label).join(", ")}${result.failed.length > 3 ? " 외" : ""}` : "") +
        (noteOk ? "\n쪽지도 보냈어요." : "\n⚠️ 쪽지 발송은 실패 — 공지·쪽지에서 다시 보내주세요."),
        result.failed.length ? "error" : "success",
      );
      setSendOpen(false);
      void load(days);
    } finally {
      setSending(false);
    }
  };

  const card = (emoji: string, label: string, count: number, desc: string, hot = false) => (
    <div className={`rounded-2xl border p-4 ${hot ? "border-rose-deep bg-rose-soft/40" : "border-line bg-surface"}`}>
      <div className="text-[13px] font-black text-ink-soft">{emoji} {label}</div>
      <div className={`mt-1 text-3xl font-black ${hot ? "text-rose-deep" : "text-ink"}`}>{count.toLocaleString()}<span className="ml-1 text-sm font-bold text-ink-mute">명</span></div>
      <div className="mt-1 text-[11px] font-bold leading-4 text-ink-mute">{desc}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 상단 요약 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border border-line bg-surface-2 px-4 py-3">
        <span className="text-[13px] font-black text-ink">재구매율 <b className="text-rose-deep">{stats ? `${stats.repurchaseRatePct}%` : "…"}</b></span>
        <span className="text-[13px] font-black text-ink">단골 구매주기 <b className="text-rose-deep">{stats ? `${stats.gapDays.median}일` : "…"}</b></span>
        {thisMonth ? <span className="text-[13px] font-black text-ink">이번달 신규 {thisMonth.new}명 · 재구매 {thisMonth.repeat}명</span> : null}
        <span className="ml-auto flex items-center gap-1 text-[12px] font-bold text-ink-mute">
          기준
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] font-black text-ink">
            {DAY_CHOICES.map((d) => <option key={d} value={d}>{d}일</option>)}
          </select>
          동안 안 사면 「떠나려는 단골」
        </span>
      </div>

      {/* 카드 4장 */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {card("🌱", "새손님", stats?.segments.fresh ?? 0, "1번 사봤어요 — 방송에서 이름 불러주면 단골이 돼요")}
        {card("💖", "단골", stats?.segments.loyal ?? 0, `2번 이상 샀고 최근 ${days}일 안에도 샀어요`)}
        {card("🚨", "떠나려는 단골", stats?.segments.atRisk ?? 0, `단골이었는데 ${days}일 넘게 조용해요 — 아래에서 붙잡으세요`, true)}
        {card("💤", "떠난 손님", stats?.segments.gone ?? 0, "1번 사고 90일 넘게 소식 없어요")}
      </div>

      {/* 🚨 명단 + 보내기 */}
      <div className="rounded-2xl border border-rose-line bg-surface p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-black text-ink">🚨 떠나려는 단골 명단 <span className="text-ink-mute">({stats?.atRiskList.length ?? 0}명)</span></span>
          <button
            type="button"
            disabled={loading || !stats || checked.size === 0}
            onClick={() => { setNoteText(""); setSendOpen(true); }}
            className="ml-auto rounded-xl bg-rose-deep px-4 py-2 text-[13px] font-black text-white disabled:opacity-40"
          >💝 선택 {checked.size}명에게 포인트+쪽지 보내기</button>
        </div>
        <div className="mb-2 text-[11px] font-bold text-ink-mute">체크된 분들에게만 갑니다 · 최근 30일 안에 이미 복귀 포인트를 받은 분은 🔒 표시되고 자동 제외돼요</div>
        {loading ? <div className="py-8 text-center text-[13px] font-bold text-ink-mute">불러오는 중…</div> : null}
        {!loading && stats && stats.atRiskList.length === 0 ? (
          <div className="py-8 text-center text-[13px] font-bold text-ink-mute">지금은 떠나려는 단골이 없어요 👍</div>
        ) : null}
        <div className="max-h-[320px] space-y-1 overflow-y-auto">
          {(stats?.atRiskList || []).map((c) => {
            const locked = lockSet.has(c.phone);
            const on = checked.has(c.phone);
            return (
              <label key={c.phone} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${locked ? "border-line bg-surface-2 opacity-60" : on ? "border-rose-line bg-rose-soft/30" : "border-line bg-surface"}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={locked}
                  onChange={() => setChecked((prev) => { const next = new Set(prev); if (next.has(c.phone)) next.delete(c.phone); else next.add(c.phone); return next; })}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-black text-ink">{c.nick}</span>
                <span className="text-[12px] font-bold text-ink-soft">{c.buys}회 구매</span>
                <span className="text-[12px] font-bold text-rose-deep">{c.daysSince}일째 조용</span>
                {locked ? <span className="text-[11px] font-black text-ink-mute">🔒 이미 보냄</span> : null}
              </label>
            );
          })}
        </div>
      </div>

      {/* 참고: TOP 단골 */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-2 text-[13px] font-black text-ink">👑 우리 가게 최고 단골 TOP 10</div>
        <div className="flex flex-wrap gap-1.5">
          {(stats?.topCustomers || []).slice(0, 10).map((t) => (
            <span key={`${t.nick}-${t.n}`} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-bold text-ink">{t.nick} <b className="text-rose-deep">{t.n}회</b></span>
          ))}
        </div>
      </div>

      {/* 보내기 모달 */}
      {sendOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => !sending && setSendOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-[15px] font-black text-ink">💝 {checked.size}명에게 보내기</div>
            <label className="mb-1 block text-[12px] font-black text-ink-soft">1인당 포인트</label>
            <input value={amountText} inputMode="numeric" onChange={(e) => setAmountText(e.target.value.replace(/[^0-9]/g, ""))} className="mb-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] font-black text-ink outline-none focus:border-rose-deep" />
            <div className="mb-3 text-[11px] font-bold text-ink-mute">총 {(Math.floor(Number(amountText || 0)) * checked.size).toLocaleString()}P · 권장 3,000P(객단가의 5%)</div>
            <label className="mb-1 block text-[12px] font-black text-ink-soft">쪽지 내용 (비우면 아래 기본 문구)</label>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={defaultNote} rows={3} className="mb-4 w-full rounded-xl border border-line bg-surface px-3 py-2 text-[13px] font-bold text-ink outline-none focus:border-rose-deep" />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={sending} onClick={() => setSendOpen(false)} className="h-11 rounded-xl border border-line bg-surface text-[14px] font-black text-ink-soft">취소</button>
              <button type="button" disabled={sending} onClick={() => void doSend()} className="h-11 rounded-xl bg-rose-deep text-[14px] font-black text-white disabled:opacity-50">{sending ? "보내는 중…" : "보내기"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
