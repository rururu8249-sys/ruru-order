"use client";

// [2026-09-05 사장님 요청 · 단골 리포트 v2] "초등학생도 쓰는" 실행형 리포트.
//   v2(사장님 지적 반영): 카드 4장 전부 클릭=명단 · TOP10 금액 표시 · 관리자 계정 제외(API) ·
//   방송주기 표시 · 멘트 개선(윈백 카피 표준: 보고싶다+혜택 명확+다음 행동 하나).
//   돈 로직: 기존 단건 지급 API 재사용(useBulkPointGrant — 새 돈 경로 0) · 쪽지: customer-note targets 일괄.
//   통계: /api/admin-live/repurchase-stats (읽기 전용).

import { useEffect, useMemo, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";
import { useBulkPointGrant } from "./useBulkPointGrant";

type SegKey = "fresh" | "loyal" | "atRisk" | "gone";
type SegRow = { phone: string; nick: string; buys: number; lastBuy: string; daysSince: number; spend: number };
type Stats = {
  ok: boolean;
  totalCustomers: number;
  repurchaseRatePct: number;
  gapDays: { median: number; p90: number };
  segments: Record<SegKey, number>;
  lists: Record<SegKey, SegRow[]>;
  recentComebackPhones: string[];
  broadcastCount30d: number;
  monthly: Array<{ month: string; new: number; repeat: number }>;
  topCustomers: Array<{ nick: string; n: number; last: string; spend: number }>;
  topSpenders: Array<{ nick: string; n: number; last: string; spend: number }>;
};

const DAY_CHOICES = [30, 45, 60, 90];
const DEFAULT_POINT = 2000; // [사장님 결정 09-05] 기본 2,000P — 보낼 때 금액칸에서 자유 수정
const COMEBACK_REASON = "복귀 감사 포인트"; // ⚠️ 재지급 잠금이 "복귀" 문구로 식별 — 바꾸면 잠금도 같이 볼 것

const SEG_META: Record<SegKey, { emoji: string; label: string; desc: (days: number) => string; hot?: boolean; defaultChecked: boolean }> = {
  fresh: { emoji: "🌱", label: "새손님", desc: () => "1번 사봤어요 — 두 번째 구매가 단골의 시작", defaultChecked: false },
  loyal: { emoji: "💖", label: "단골", desc: (d) => `2번 이상 샀고 최근 ${d}일 안에도 샀어요`, defaultChecked: false },
  atRisk: { emoji: "🚨", label: "떠나려는 단골", desc: (d) => `단골이었는데 ${d}일 넘게 조용해요 — 명단에서 붙잡으세요`, hot: true, defaultChecked: true },
  gone: { emoji: "💤", label: "떠난 손님", desc: () => "1번 사고 90일 넘게 소식 없어요", defaultChecked: false },
};

const money = (n: number) => {
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만원`;
  return `${Number(n || 0).toLocaleString()}원`;
};

export default function AdminLiveLoyaltyReport() {
  const [days, setDays] = useState(45);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [seg, setSeg] = useState<SegKey>("atRisk");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [amountText, setAmountText] = useState(String(DEFAULT_POINT));
  const [noteText, setNoteText] = useState("");
  const [sending, setSending] = useState(false);
  const [topMode, setTopMode] = useState<"count" | "spend">("count");
  const { grant } = useBulkPointGrant();

  const lockSet = useMemo(() => new Set(stats?.recentComebackPhones || []), [stats]);
  const rows = stats?.lists?.[seg] || [];

  const resetChecks = (data: Stats, segment: SegKey) => {
    const lock = new Set(data.recentComebackPhones || []);
    if (SEG_META[segment].defaultChecked) {
      setChecked(new Set((data.lists?.[segment] || []).filter((c) => !lock.has(c.phone)).map((c) => c.phone)));
    } else {
      setChecked(new Set());
    }
  };

  const load = async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin-live/repurchase-stats?days=${d}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as Stats | null;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.message || `조회 실패(${res.status})`);
      setStats(json);
      resetChecks(json, seg);
    } catch (e) {
      showAdminToast("단골 리포트 조회 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(days); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const pickSeg = (k: SegKey) => {
    setSeg(k);
    if (stats) resetChecks(stats, k);
  };

  const thisMonth = stats?.monthly?.[stats.monthly.length - 1];
  const amountNum = Math.floor(Number(amountText.replace(/[^0-9]/g, "") || 0));
  // [윈백 카피 표준] 보고 싶다는 진심 + 혜택을 숫자로 + 할 일 하나(다음 방송)
  const defaultNote = `보고 싶었어요! 요즘 통 안 보이셔서 서운했잖아요 🥺 감사한 마음으로 ${amountNum.toLocaleString()}P 넣어드렸어요 — 다음 방송에서 현금처럼 바로 쓰세요. 편하게 놀러만 오셔도 좋아요 💕`;

  const doSend = async () => {
    if (!stats) return;
    if (!amountNum || amountNum <= 0) { showAdminToast("포인트 금액을 적어주세요.", "error"); return; }
    if (amountNum > 50000) { showAdminToast("1인당 5만P를 넘는 금액은 일괄로 보낼 수 없어요. 개별 지급을 사용해 주세요.", "error"); return; }
    const targets = rows.filter((c) => checked.has(c.phone) && !lockSet.has(c.phone));
    if (targets.length === 0) { showAdminToast("보낼 대상이 없습니다.", "error"); return; }
    const totalWon = amountNum * targets.length;
    if (!window.confirm(`${SEG_META[seg].emoji} ${SEG_META[seg].label} ${targets.length}명에게 ${amountNum.toLocaleString()}P씩, 총 ${totalWon.toLocaleString()}P를 지급하고 쪽지를 보냅니다.\n\n(최근 30일 안에 이미 받은 분은 자동 제외)\n\n진행할까요?`)) return;
    setSending(true);
    try {
      const result = await grant(
        targets.map((t) => ({ phone: t.phone, label: t.nick })),
        { amount: amountNum, reason: COMEBACK_REASON, adminMemo: `단골 리포트 일괄(${SEG_META[seg].label}·기준 ${days}일)`, customerVisible: true },
      );
      const message = (noteText.trim() || defaultNote).slice(0, 500);
      let noteOk = false;
      try {
        const res = await fetch("/api/admin-live/customer-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ targets: targets.map((t) => ({ phone: t.phone })), title: "💝 보고 싶었어요!", message }),
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

  const allChecked = rows.length > 0 && rows.every((c) => lockSet.has(c.phone) || checked.has(c.phone));

  return (
    <div className="space-y-4">
      {/* 상단 요약 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border border-line bg-surface-2 px-4 py-3">
        <span className="text-[13px] font-black text-ink">재구매율 <b className="text-rose-deep">{stats ? `${stats.repurchaseRatePct}%` : "…"}</b></span>
        <span className="text-[13px] font-black text-ink">단골 구매주기 <b className="text-rose-deep">{stats ? `${stats.gapDays.median}일` : "…"}</b></span>
        <span className="text-[13px] font-black text-ink">최근 30일 방송 <b className="text-rose-deep">{stats ? `${stats.broadcastCount30d}회` : "…"}</b></span>
        {thisMonth ? <span className="text-[13px] font-black text-ink">이번달 신규 {thisMonth.new}명 · 재구매 {thisMonth.repeat}명</span> : null}
        <span className="ml-auto flex items-center gap-1 text-[12px] font-bold text-ink-mute">
          기준
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] font-black text-ink">
            {DAY_CHOICES.map((d) => <option key={d} value={d}>{d}일</option>)}
          </select>
          동안 안 사면 「떠나려는 단골」
        </span>
      </div>

      {/* 카드 4장 — 전부 클릭 = 아래 명단 전환 */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {(Object.keys(SEG_META) as SegKey[]).map((k) => {
          const m = SEG_META[k];
          const active = seg === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => pickSeg(k)}
              className={`rounded-2xl border p-4 text-left transition ${active ? "border-rose-deep bg-rose-soft/40 shadow-sm" : "border-line bg-surface hover:border-rose-line"}`}
            >
              <div className="text-[13px] font-black text-ink-soft">{m.emoji} {m.label}</div>
              <div className={`mt-1 text-3xl font-black ${m.hot || active ? "text-rose-deep" : "text-ink"}`}>{(stats?.segments[k] ?? 0).toLocaleString()}<span className="ml-1 text-sm font-bold text-ink-mute">명</span></div>
              <div className="mt-1 text-[11px] font-bold leading-4 text-ink-mute">{m.desc(days)}</div>
              <div className={`mt-2 text-[11px] font-black ${active ? "text-rose-deep" : "text-ink-mute"}`}>{active ? "▾ 아래에 명단이 열려 있어요" : "누르면 명단 보기"}</div>
            </button>
          );
        })}
      </div>

      {/* 선택 세그먼트 명단 + 보내기 */}
      <div className="rounded-2xl border border-rose-line bg-surface p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-black text-ink">{SEG_META[seg].emoji} {SEG_META[seg].label} 명단 <span className="text-ink-mute">({rows.length}명)</span></span>
          <button
            type="button"
            onClick={() => {
              if (allChecked) setChecked(new Set());
              else setChecked(new Set(rows.filter((c) => !lockSet.has(c.phone)).map((c) => c.phone)));
            }}
            className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] font-black text-ink-soft"
          >{allChecked ? "전체 해제" : "전체 선택"}</button>
          <button
            type="button"
            disabled={loading || checked.size === 0}
            onClick={() => { setNoteText(""); setSendOpen(true); }}
            className="ml-auto rounded-xl bg-rose-deep px-4 py-2 text-[13px] font-black text-white disabled:opacity-40"
          >💝 선택 {checked.size}명에게 포인트+쪽지 보내기</button>
        </div>
        <div className="mb-2 text-[11px] font-bold text-ink-mute">체크된 분들에게만 갑니다 · 최근 30일 안에 이미 복귀 포인트를 받은 분은 🔒 자동 제외 · 관리자 계정은 통계에서 빠져 있어요</div>
        {loading ? <div className="py-8 text-center text-[13px] font-bold text-ink-mute">불러오는 중…</div> : null}
        {!loading && rows.length === 0 ? (
          <div className="py-8 text-center text-[13px] font-bold text-ink-mute">이 칸에는 지금 아무도 없어요 👍</div>
        ) : null}
        <div className="max-h-[320px] space-y-1 overflow-y-auto">
          {rows.map((c) => {
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
                <span className="text-[12px] font-bold text-ink-soft">{c.buys}회</span>
                <span className="w-[64px] text-right text-[12px] font-bold text-ink-soft">{money(c.spend)}</span>
                <span className="w-[86px] text-right text-[12px] font-bold text-rose-deep">{c.daysSince}일째 조용</span>
                {locked ? <span className="text-[11px] font-black text-ink-mute">🔒 이미 보냄</span> : null}
              </label>
            );
          })}
        </div>
      </div>

      {/* TOP 10 — 횟수순/금액순 전환 */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[13px] font-black text-ink">👑 우리 가게 최고 단골 TOP 10</span>
          <div className="ml-auto flex gap-1">
            <button type="button" onClick={() => setTopMode("count")} className={`rounded-lg px-2.5 py-1 text-[12px] font-black ${topMode === "count" ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}>횟수순</button>
            <button type="button" onClick={() => setTopMode("spend")} className={`rounded-lg px-2.5 py-1 text-[12px] font-black ${topMode === "spend" ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}>금액순</button>
          </div>
        </div>
        <div className="space-y-1">
          {((topMode === "count" ? stats?.topCustomers : stats?.topSpenders) || []).slice(0, 10).map((t, i) => (
            <div key={`${topMode}-${t.nick}-${t.n}`} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5">
              <span className="w-6 text-[12px] font-black text-ink-mute">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-black text-ink">{t.nick}</span>
              <span className={`text-[12px] ${topMode === "count" ? "font-black text-rose-deep" : "font-bold text-ink-soft"}`}>{t.n}회</span>
              <span className={`w-[80px] text-right text-[13px] ${topMode === "spend" ? "font-black text-rose-deep" : "font-bold text-ink-soft"}`}>{money(t.spend)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 보내기 모달 */}
      {sendOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => !sending && setSendOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-[15px] font-black text-ink">💝 {SEG_META[seg].label} {checked.size}명에게 보내기</div>
            <label className="mb-1 block text-[12px] font-black text-ink-soft">1인당 포인트</label>
            <input value={amountText} inputMode="numeric" onChange={(e) => setAmountText(e.target.value.replace(/[^0-9]/g, ""))} className="mb-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] font-black text-ink outline-none focus:border-rose-deep" />
            <div className="mb-3 text-[11px] font-bold text-ink-mute">총 {(amountNum * checked.size).toLocaleString()}P · 업계 통상 1,000~3,000P — 기본 2,000P, 금액은 자유롭게 바꾸세요</div>
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
