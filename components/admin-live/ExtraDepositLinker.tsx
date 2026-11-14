"use client";
// [2026-11-15] 주문상세 「부족해요」 칸 — 나중에 들어온 차액 입금을 이 주문에 붙이기(입금확인 취소 없이).
//   서버 /api/admin-live/order-extra-deposit 가 입금 연결 칸만 쓴다. 주문 상태·금액은 그대로.
import { useCallback, useEffect, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";

type Cand = { id: number; name: string; amount: number; at: string; time?: string; nameMatch: boolean; exact: boolean };
type Info = { total: number; linkedSum: number; shortage: number; block: string | null; extras: { id: number; name: string; amount: number }[]; candidates: Cand[] };

const won = (v: number) => `${Number(v || 0).toLocaleString("ko-KR")}원`;
// 입금 날짜(created_at) + 은행 시각(deposited_time, 시각만 오는 경우) — 「11.14 11:04」
const when = (s: string, time?: string) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return time || "";
  const md = d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }).replace(/\s/g, "").replace(/\.$/, "");
  const hm = time || d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${md} ${hm}`;
};

export default function ExtraDepositLinker({ groupId, nickname, mode, onChanged }: { groupId: string; nickname: string; mode: "short" | "extras"; onChanged: () => void | Promise<void> }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin-live/order-extra-deposit?groupId=${encodeURIComponent(groupId)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.ok) {
        setInfo(json);
        // 이름 같고 금액이 부족액과 같은 입금이 딱 하나면 미리 체크
        const exact = (json.candidates as Cand[]).filter((c) => c.nameMatch && c.exact);
        setSel(exact.length === 1 ? new Set([exact[0].id]) : new Set());
      } else setInfo(null);
    } catch { setInfo(null); }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  if (!info) return null;

  const extras = info.extras ?? [];
  const unlink = async (id: number, amount: number) => {
    if (!(await showAdminConfirm(`붙여 둔 입금 ${won(amount)}을 이 주문에서 뗄까요?\n입금은 다시 '미확인'으로 돌아가요. 주문 상태는 그대로예요.`, { title: "추가 입금 연결 취소", confirmText: "떼기" }))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin-live/order-extra-deposit", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ groupId, depositIds: [id], action: "unlink" }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { showAdminToast("연결 취소 실패\n\n" + (json?.message || `요청 실패(${res.status})`), "error"); return; }
      showAdminToast("추가 입금 연결을 취소했어요.", "success");
      await Promise.all([load(), onChanged()]);
    } finally { setBusy(false); }
  };

  const extrasList = extras.length ? (
    <div className="space-y-1">
      {extras.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-2 text-[12px] font-semibold text-ink-soft">
          <span>추가 입금 {e.name} {won(e.amount)} 붙임</span>
          <button type="button" disabled={busy} onClick={() => void unlink(e.id, e.amount)} className="h-8 rounded-lg px-2 text-[12px] font-semibold text-danger-tx hover:bg-danger-bg disabled:opacity-50">연결 취소</button>
        </div>
      ))}
    </div>
  ) : null;

  if (mode === "extras") return extrasList;

  if (info.block) return <div className="text-[12px] font-semibold text-danger-tx">{info.block}</div>;

  const cands = info.candidates ?? [];
  const named = cands.filter((c) => c.nameMatch);
  const list = showAll ? cands : (named.length ? named : cands).slice(0, 8);
  const selSum = cands.filter((c) => sel.has(c.id)).reduce((s, c) => s + c.amount, 0);
  const after = info.linkedSum + selSum;
  const diff = after - info.total;

  const link = async () => {
    if (!sel.size || busy) return;
    const result = diff === 0 ? "딱 맞아요" : diff < 0 ? `아직 ${won(-diff)} 부족해요` : `${won(diff)} 더 받아요(주문상세에서 포인트로 돌려줄 수 있어요)`;
    const ok = await showAdminConfirm(
      `${nickname}님 주문에 입금 ${won(selSum)}을 붙일까요?\n\n받은 돈 ${won(info.linkedSum)} + ${won(selSum)} = ${won(after)}\n주문 금액 ${won(info.total)} → ${result}\n\n주문 상태(입금확인)는 그대로예요.`,
      { title: "추가 입금 연결", confirmText: "붙이기" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin-live/order-extra-deposit", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ groupId, depositIds: [...sel], selectedTotal: selSum }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { showAdminToast("추가 입금 연결 실패\n\n" + (json?.message || `요청 실패(${res.status})`), "error"); await load(); return; }
      showAdminToast(json.kind === "exact" ? "입금을 붙였어요. 딱 맞아요." : "입금을 붙였어요.", "success");
      setOpen(false);
      await Promise.all([load(), onChanged()]);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      {extrasList}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="h-10 w-full rounded-lg border border-line bg-surface text-[14px] font-bold text-ink hover:bg-surface-2">
          입금이 들어왔어요 · 추가 입금 연결
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-line bg-surface p-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-bold text-ink">붙일 입금 고르기</div>
            <button type="button" onClick={() => setOpen(false)} className="h-8 px-2 text-[12px] font-semibold text-ink-mute">닫기</button>
          </div>
          {list.length === 0 ? (
            <div className="text-[12px] font-semibold text-ink-mute">연결 안 된 입금이 없어요(최근 45일). 입금이 들어오면 다시 열어 주세요.</div>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {list.map((c) => {
                const on = sel.has(c.id);
                return (
                  <label key={c.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 ${on ? "bg-surface-2" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => setSel((p) => { const n = new Set(p); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{c.name || "(이름 없음)"}</span>
                    {c.nameMatch && c.exact ? <span className="text-[12px] font-semibold text-ok-tx">딱 맞음</span> : null}
                    <span className="text-[12px] text-ink-mute">{when(c.at, c.time)}</span>
                    <span className="w-20 text-right text-[13px] font-bold tabular-nums text-ink">{won(c.amount)}</span>
                  </label>
                );
              })}
            </div>
          )}
          {!showAll && cands.length > list.length ? (
            <button type="button" onClick={() => setShowAll(true)} className="h-8 text-[12px] font-semibold text-ink-soft underline">다른 이름 입금도 보기 ({cands.length}건)</button>
          ) : null}
          {sel.size ? (
            <div className="text-[12px] font-semibold text-ink-soft">
              받은 돈 {won(info.linkedSum)} + {won(selSum)} = {won(after)} · {diff === 0 ? "딱 맞아요" : diff < 0 ? `아직 ${won(-diff)} 부족` : `${won(diff)} 더 받음`}
            </div>
          ) : null}
          <button type="button" disabled={!sel.size || busy} onClick={() => void link()} className="h-10 w-full rounded-lg bg-ink text-[14px] font-bold text-white disabled:bg-surface-3 disabled:text-ink-mute">
            {busy ? "처리 중…" : sel.size ? `${won(selSum)} 이 주문에 붙이기` : "입금을 골라 주세요"}
          </button>
        </div>
      )}
    </div>
  );
}
