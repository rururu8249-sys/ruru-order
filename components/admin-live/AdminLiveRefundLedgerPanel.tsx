"use client";

// [2026-09-26] 교환·환불 장부 1단계 — 시안 ② 장부 + ③ 처리 창.
//   ⚠️ 돈 무접촉: 포인트/주문/정산 안 건드림. refund_ledger 기록만 읽고 씀(서버 라우트 경유, service_role).
//   계좌: 목록은 뒷4자리만. 전체 번호는 처리 창 열 때/이체 목록 복사 때만 서버에서 받는다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";
import {
  REFUND_STAGES,
  REFUND_KINDS,
  REFUND_METHODS,
  computeAmountFinal,
  type RefundAdjustment,
} from "@/lib/refundLedger";

type LedgerListRow = {
  id: string;
  created_at: string;
  admin_task_id?: string | null;
  order_lookup_code?: string | null;
  customer_phone?: string | null;
  nickname?: string | null;
  customer_name?: string | null;
  kind: string;
  reason?: string | null;
  product_snapshot?: Array<{ productName?: string; color?: string; size?: string; qty?: number }> | null;
  stage: string;
  next_action?: string | null;
  amount_base: number;
  adjustments?: RefundAdjustment[] | null;
  amount_final: number;
  method: string;
  account_last4?: string | null;
  transferred_at?: string | null;
  done_at?: string | null;
};

type LedgerDetail = LedgerListRow & {
  bank?: string | null;
  account_number?: string | null;
  account_holder?: string | null;
  account_hidden?: boolean;
  exchange_option?: string | null;
  reship_tracking?: string | null;
  memo?: string | null;
};

const won = (n: unknown) => `${(Math.round(Number(n)) || 0).toLocaleString("ko-KR")}원`;
const clean = (v: unknown) => String(v ?? "").trim();

function formatDateTime(value: unknown) {
  const raw = clean(value);
  if (!raw) return "-";
  const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return raw;
  const p2 = (n: number) => String(n).padStart(2, "0");
  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()] || "";
  return { line1: `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}(${wd})`, line2: `${p2(d.getHours())}:${p2(d.getMinutes())}` };
}

function productText(snapshot: LedgerListRow["product_snapshot"]) {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return "-";
  return snapshot
    .map((it) => `${clean(it.productName) || "상품"}${[clean(it.color), clean(it.size)].filter(Boolean).length ? ` (${[clean(it.color), clean(it.size)].filter(Boolean).join("/")})` : ""} ×${Math.max(1, Math.round(Number(it.qty)) || 1)}`)
    .join(", ");
}

const KIND_COLOR: Record<string, string> = { 교환: "bg-info-bg text-info-tx", 반품: "bg-warn-bg text-warn-tx", 재발송: "bg-ok-bg text-ok-tx" };
const STAGE_COLOR: Record<string, string> = {
  접수: "bg-surface-2 text-ink-soft",
  "회수 대기": "bg-warn-bg text-warn-tx",
  "도착·검수": "bg-info-bg text-info-tx",
  "처리 필요": "bg-danger-bg text-danger-tx",
  완료: "bg-ok-bg text-ok-tx",
  "거절·취소": "bg-surface-3 text-ink-mute",
};

const REFUND_GRID = "grid-cols-[36px_92px_minmax(120px,160px)_minmax(180px,1.4fr)_minmax(140px,1fr)_minmax(150px,1.2fr)_128px_120px]";

export default function AdminLiveRefundLedgerPanel({ focusTaskId }: { focusTaskId?: string }) {
  const [rows, setRows] = useState<LedgerListRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [stage, setStage] = useState<string>("");
  const [kind, setKind] = useState<string>("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<LedgerDetail | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stage) params.set("stage", stage);
      if (kind) params.set("kind", kind);
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
      if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
      const res = await fetch(`/api/admin-live/refund-ledger?${params.toString()}`, { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (!payload?.ok) {
        showAdminToast("장부 불러오기 실패\n" + (payload?.message || "알 수 없는 오류"), "error");
        setRows([]); setCounts({}); setTotal(0);
        return;
      }
      setRows(payload.items || []);
      setCounts(payload.counts || {});
      setTotal(payload.total || 0);
    } finally {
      setLoading(false);
    }
  }, [stage, kind, q, from, to]);

  useEffect(() => { void load(); }, [load]);

  // 고객이슈 「장부에서 보기」로 넘어온 경우: 그 admin_task_id 행을 찾아 처리 창 열기(한 번만)
  const focusHandled = useRef("");
  useEffect(() => {
    const fid = clean(focusTaskId);
    if (!fid || focusHandled.current === fid || rows.length === 0) return;
    const hit = rows.find((r) => clean(r.admin_task_id) === fid);
    if (hit) { focusHandled.current = fid; void openProcess(hit.id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTaskId, rows]);

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const selRefundTotal = selectedRows.reduce((s, r) => s + (Math.round(Number(r.amount_final)) || 0), 0);
  const selBankCount = selectedRows.filter((r) => r.method === "계좌이체").length;
  const selPointCount = selectedRows.filter((r) => r.method === "포인트").length;

  const toggleSel = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pageIds = rows.map((r) => r.id);
  const allSel = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected((prev) => { const n = new Set(prev); if (allSel) pageIds.forEach((id) => n.delete(id)); else pageIds.forEach((id) => n.add(id)); return n; });

  const openProcess = async (id: string) => {
    try {
      const res = await fetch(`/api/admin-live/refund-ledger?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (!payload?.ok) { showAdminToast("항목 불러오기 실패\n" + (payload?.message || ""), "error"); return; }
      setEditing(payload.item as LedgerDetail);
      setModalOpen(true);
    } catch { showAdminToast("항목 불러오기 실패", "error"); }
  };

  const openNew = () => {
    setEditing({ id: "", created_at: "", kind: "반품", stage: "접수", amount_base: 0, amount_final: 0, method: "없음", adjustments: [] });
    setModalOpen(true);
  };

  // 이체 목록 복사 — 선택 건의 «전체 계좌번호»를 이때만 서버에서 받아서 만든다.
  const copyTransferList = async () => {
    const targets = selectedRows.filter((r) => r.method === "계좌이체");
    if (targets.length === 0) { showAdminToast("계좌이체 방법인 선택 건이 없어요."); return; }
    const lines: string[] = [];
    for (const r of targets) {
      const res = await fetch(`/api/admin-live/refund-ledger?id=${encodeURIComponent(r.id)}`, { cache: "no-store" });
      const p = await res.json().catch(() => null);
      const d = p?.ok ? (p.item as LedgerDetail) : null;
      const bank = clean(d?.bank);
      const acct = clean(d?.account_number);
      const holder = clean(d?.account_holder) || clean(r.customer_name) || clean(r.nickname);
      lines.push([bank, acct, holder, won(r.amount_final)].filter(Boolean).join(" "));
    }
    const text = lines.join("\n");
    try { await navigator.clipboard.writeText(text); showAdminToast(`이체 목록 ${targets.length}건 복사했어요 (은행 계좌 예금주 금액)`, "success"); }
    catch { showAdminToast("복사 실패 — 아래 내용을 직접 복사하세요:\n\n" + text, "warning"); }
  };

  const downloadExcel = () => {
    // 계좌는 뒷4자리만. CSV(BOM)로 저장 — 엑셀에서 열림.
    const header = ["접수일", "고객", "전화(뒷4)", "구분", "단계", "상품", "사유", "최종환불액", "방법", "계좌뒷4", "이체일", "완료일"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = rows.map((r) => {
      const dt = formatDateTime(r.created_at);
      const created = typeof dt === "string" ? dt : `${dt.line1} ${dt.line2}`;
      const phone4 = clean(r.customer_phone).slice(-4);
      return [created, clean(r.nickname) || clean(r.customer_name), phone4, r.kind, r.stage, productText(r.product_snapshot), clean(r.reason).replace(/\n/g, " "), r.amount_final, r.method, clean(r.account_last4), clean(r.transferred_at), clean(r.done_at)].map(esc).join(",");
    });
    const csv = "﻿" + [header.map(esc).join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `교환환불장부_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      {/* 단계 탭 + 건수 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[["", "전체", total] as const, ...REFUND_STAGES.map((s) => [s, s, counts[s] || 0] as const)].map(([key, label, n]) => {
          const on = stage === key;
          return (
            <button key={key || "all"} type="button" onClick={() => setStage(key)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-black transition ${on ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft hover:bg-surface-2"}`}>
              {label} <span className={on ? "text-white/90" : "text-ink-mute"}>{n}</span>
            </button>
          );
        })}
        <button type="button" onClick={openNew} className="ml-auto rounded-lg bg-rose-deep px-3 py-1.5 text-[12px] font-black text-white">+ 교환·환불 접수</button>
      </div>

      {/* 검색·구분·기간 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉네임 / 이름 / 전화 / 주문번호 검색"
          className="h-10 min-w-[200px] flex-1 rounded-xl border border-line bg-surface px-3 text-[13px] font-black text-ink outline-none focus-visible:border-rose-deep focus-visible:ring-2 focus-visible:ring-rose-deep" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 shrink-0 rounded-xl border border-line bg-surface px-3 text-[13px] font-black text-ink outline-none focus-visible:ring-2 focus-visible:ring-rose-deep">
          <option value="">구분: 전체</option>
          {REFUND_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 shrink-0 rounded-xl border border-line bg-surface px-2 text-[12px] font-black text-ink outline-none focus-visible:ring-2 focus-visible:ring-rose-deep" />
        <span className="text-ink-mute">~</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 shrink-0 rounded-xl border border-line bg-surface px-2 text-[12px] font-black text-ink outline-none focus-visible:ring-2 focus-visible:ring-rose-deep" />
        {(q || kind || from || to || stage) ? (
          <button type="button" onClick={() => { setQ(""); setKind(""); setFrom(""); setTo(""); setStage(""); }} className="h-10 shrink-0 rounded-xl border border-line bg-surface px-3 text-[13px] font-black text-ink-soft hover:bg-surface-2">✕ 초기화</button>
        ) : null}
      </div>

      {/* 선택 작업 바 */}
      {selected.size > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-rose-line bg-rose-soft px-3 py-2 text-[12px] font-black">
          <span className="text-rose-deep">{selected.size}건 선택 · 환불 합계 {won(selRefundTotal)}</span>
          <span className="text-ink-soft">계좌이체 {selBankCount} · 포인트 {selPointCount}</span>
          <button type="button" onClick={() => setSelected(new Set())} className="h-8 rounded-lg px-2 text-[11px] text-ink-soft hover:bg-surface">선택 해제</button>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={copyTransferList} className="h-8 rounded-lg border border-rose-line bg-surface px-3 text-[11px] font-black text-rose-deep hover:bg-rose-soft">📋 이체 목록 복사</button>
            <button type="button" onClick={downloadExcel} className="h-8 rounded-lg border border-line bg-surface px-3 text-[11px] font-black text-ink-soft hover:bg-surface-2">⬇ 엑셀 다운로드</button>
          </div>
        </div>
      ) : null}

      {/* 표 */}
      <div className="mt-3 overflow-x-auto rounded-xl border border-line">
        <div className="min-w-[1000px]">
          <div className={`sticky top-0 z-10 grid ${REFUND_GRID} items-center gap-x-3 border-b border-line bg-surface-2 px-3 py-2 text-[11px] font-black text-ink-mute`}>
            <label className="flex items-center justify-center"><input type="checkbox" checked={allSel} onChange={toggleAll} className="h-4 w-4 accent-rose-deep" aria-label="전체 선택" /></label>
            <span>접수일</span>
            <span>고객</span>
            <span>상품 · 주문번호</span>
            <span>구분 · 사유</span>
            <span>진행 + 다음 할 일</span>
            <span className="text-right">처리 결과</span>
            <span>환불 계좌</span>
          </div>
          {loading ? (
            <div className="bg-surface-2 p-6 text-center text-sm font-black text-ink-mute">불러오는 중…</div>
          ) : rows.length === 0 ? (
            <div className="bg-surface-2 p-6 text-center text-sm font-black text-ink-mute">해당하는 교환·환불 건이 없습니다.</div>
          ) : (
            rows.map((r) => {
              const dt = formatDateTime(r.created_at);
              return (
                <div key={r.id} className={`relative grid ${REFUND_GRID} items-center gap-x-3 border-b border-line px-3 py-2.5 text-[12px] transition-colors hover:bg-rose-soft/30`}>
                  <label className="flex items-center justify-center"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} className="h-4 w-4 accent-rose-deep" /></label>
                  <div className="text-[11px] leading-tight text-ink-soft">
                    {typeof dt === "string" ? dt : (<><div>{dt.line1}</div><div className="text-ink-mute">{dt.line2}</div></>)}
                  </div>
                  <button type="button" onClick={() => openProcess(r.id)} className="min-w-0 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-rose-deep">
                    <div className="truncate text-[13px] font-black text-ink">{clean(r.nickname) || "—"}</div>
                    {r.customer_name ? <div className="truncate text-[11px] text-ink-mute">{r.customer_name}</div> : null}
                  </button>
                  <button type="button" onClick={() => openProcess(r.id)} className="min-w-0 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-rose-deep">
                    <div className="truncate text-[12px] font-bold text-ink">{productText(r.product_snapshot)}</div>
                    {r.order_lookup_code ? <div className="truncate text-[11px] text-ink-mute">{r.order_lookup_code}</div> : null}
                  </button>
                  <div className="min-w-0">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-black ${KIND_COLOR[r.kind] || "bg-surface-2 text-ink-soft"}`}>{r.kind}</span>
                    <div className="truncate text-[11px] text-ink-soft" title={clean(r.reason)}>{clean(r.reason).split("\n")[0] || "-"}</div>
                  </div>
                  <div className="min-w-0">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-black ${STAGE_COLOR[r.stage] || "bg-surface-2 text-ink-soft"}`}>{r.stage}</span>
                    {r.next_action ? <div className="truncate text-[11px] text-ink-mute" title={clean(r.next_action)}>{clean(r.next_action)}</div> : null}
                  </div>
                  <div className="text-right">
                    <div className="font-black text-ink">{won(r.amount_final)}</div>
                    <div className="text-[11px] text-ink-mute">{r.method}{r.transferred_at ? " · 이체함" : ""}{r.done_at ? " · 완료" : ""}</div>
                  </div>
                  <div className="min-w-0 text-[11px] text-ink-soft">
                    {r.method === "계좌이체" ? (clean(r.account_last4) ? `••••${r.account_last4}` : "계좌 미입력") : "-"}
                    <div><button type="button" onClick={() => openProcess(r.id)} className="text-[11px] font-black text-rose-deep">처리 ›</button></div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="mt-2 text-[11px] font-black text-ink-mute">표시 {rows.length}건 / 전체 {total}건</div>

      {modalOpen && editing ? (
        <RefundProcessModal item={editing} onClose={() => { setModalOpen(false); setEditing(null); }} onSaved={() => { setModalOpen(false); setEditing(null); void load(); }} />
      ) : null}
    </div>
  );
}

// ── 시안 ③ 처리 창 ──
function RefundProcessModal({ item, onClose, onSaved }: { item: LedgerDetail; onClose: () => void; onSaved: () => void }) {
  const [stage, setStage] = useState(item.stage || "접수");
  const [kind] = useState(item.kind || "반품");
  const [nextAction, setNextAction] = useState(clean(item.next_action));
  const [amountBase, setAmountBase] = useState(Math.round(Number(item.amount_base)) || 0);
  const [adjustments, setAdjustments] = useState<RefundAdjustment[]>(Array.isArray(item.adjustments) ? item.adjustments : []);
  const [method, setMethod] = useState(item.method || "없음");
  const [bank, setBank] = useState(clean(item.bank));
  const [account, setAccount] = useState(clean(item.account_number));
  const [holder, setHolder] = useState(clean(item.account_holder) || clean(item.customer_name) || clean(item.nickname));
  const [memo, setMemo] = useState(clean(item.memo));
  const [saving, setSaving] = useState(false);

  const amountFinal = computeAmountFinal(amountBase, adjustments); // 표시용(저장은 서버가 재계산)

  const patch = async (extra: Record<string, unknown>) => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        id: item.id || undefined, stage, kind, next_action: nextAction,
        amount_base: amountBase, adjustments, method,
        bank, account_number: account, account_holder: holder, memo,
        ...extra,
      };
      const isNew = !item.id;
      const res = await fetch("/api/admin-live/refund-ledger", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!payload?.ok) { showAdminToast("저장 실패\n" + (payload?.message || ""), "error"); return; }
      showAdminToast("저장했습니다.", "success");
      onSaved();
    } finally { setSaving(false); }
  };

  const copyTransferInfo = async () => {
    const text = [bank, account, holder, won(amountFinal)].filter(Boolean).join(" ");
    try { await navigator.clipboard.writeText(text); showAdminToast("이체 정보 복사했어요", "success"); }
    catch { showAdminToast("복사 실패:\n" + text, "warning"); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-black text-ink">{item.id ? "교환·환불 처리" : "교환·환불 접수"} · {kind}</h3>
          <button type="button" onClick={onClose} className="rounded-full px-2 text-lg font-black text-ink-mute hover:bg-surface-2">✕</button>
        </div>

        {/* 단계 버튼 */}
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-black text-ink-mute">단계</div>
          <div className="flex flex-wrap gap-1.5">
            {REFUND_STAGES.map((s) => (
              <button key={s} type="button" onClick={() => setStage(s)} className={`rounded-lg px-2.5 py-1 text-[12px] font-black transition ${stage === s ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft hover:bg-surface-2"}`}>{s}</button>
            ))}
          </div>
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="다음 할 일 메모(예: 회수 택배 예약)" className="mt-2 h-9 w-full rounded-lg border border-line bg-surface px-2 text-[12px] font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-rose-deep" />
        </div>

        {/* 금액 줄 */}
        <div className="mb-3 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between text-[12px] font-black text-ink-soft">
            <span>상품 금액</span>
            <input type="number" value={amountBase} onChange={(e) => setAmountBase(Math.max(0, Math.round(Number(e.target.value)) || 0))} className="h-8 w-32 rounded-lg border border-line bg-surface px-2 text-right text-[12px] font-black text-ink outline-none focus-visible:ring-2 focus-visible:ring-rose-deep" />
          </div>
          {adjustments.map((a, i) => (
            <div key={i} className="mt-2 flex items-center gap-1.5">
              <input value={a.label} onChange={(e) => setAdjustments((prev) => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="항목(예: 배송비 차감)" className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-[12px] font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-rose-deep" />
              <input type="number" value={a.amount} onChange={(e) => setAdjustments((prev) => prev.map((x, j) => j === i ? { ...x, amount: Math.round(Number(e.target.value)) || 0 } : x))} className="h-8 w-28 rounded-lg border border-line bg-surface px-2 text-right text-[12px] font-black text-ink outline-none focus-visible:ring-2 focus-visible:ring-rose-deep" />
              <button type="button" onClick={() => setAdjustments((prev) => prev.filter((_, j) => j !== i))} className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-black text-danger-tx hover:bg-danger-bg">삭제</button>
            </div>
          ))}
          <button type="button" onClick={() => setAdjustments((prev) => [...prev, { label: "", amount: 0 }])} className="mt-2 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-black text-ink-soft hover:bg-surface-2">+ 금액 줄 추가 (차감은 - 로 입력)</button>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-[13px] font-black">
            <span className="text-ink">최종 환불액</span>
            <span className="text-rose-deep">{won(amountFinal)}</span>
          </div>
        </div>

        {/* 방법 */}
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-black text-ink-mute">환불 방법</div>
          <div className="flex flex-wrap gap-1.5">
            {REFUND_METHODS.map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)} className={`rounded-lg px-2.5 py-1 text-[12px] font-black transition ${method === m ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft hover:bg-surface-2"}`}>{m}</button>
            ))}
          </div>
        </div>

        {method === "계좌이체" ? (
          <div className="mb-3 rounded-xl border border-line p-3">
            <div className="flex flex-wrap gap-2">
              <input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="은행" className="h-9 w-28 rounded-lg border border-line bg-surface px-2 text-[12px] font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-rose-deep" />
              <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="계좌번호(숫자)" inputMode="numeric" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-[12px] font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-rose-deep" />
              <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="예금주" className="h-9 w-24 rounded-lg border border-line bg-surface px-2 text-[12px] font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-rose-deep" />
            </div>
            {item.account_hidden ? <div className="mt-1 text-[11px] font-bold text-ink-mute">완료 후 30일이 지나 계좌번호는 가려졌습니다(은행·예금주는 유지).</div> : null}
            <button type="button" onClick={copyTransferInfo} className="mt-2 rounded-lg border border-rose-line bg-surface px-3 py-1 text-[11px] font-black text-rose-deep hover:bg-rose-soft">📋 이체 정보 복사</button>
          </div>
        ) : null}

        {method === "포인트" ? (
          <div className="mb-3 rounded-xl border border-warn-tx/40 bg-warn-bg px-3 py-2 text-[11px] font-bold text-warn-tx">
            ⚠️ 포인트 지급은 3단계에서 연결됩니다. 지금은 포인트 메뉴에서 직접 지급한 뒤 여기에 기록만 하세요(이 창은 포인트를 움직이지 않습니다).
          </div>
        ) : null}

        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" rows={2} className="mb-3 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px] font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-rose-deep" />

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={saving} onClick={() => patch({})} className="h-10 rounded-xl border border-line bg-surface px-4 text-[13px] font-black text-ink-soft hover:bg-surface-2 disabled:opacity-50">저장</button>
          {method === "계좌이체" ? (
            <button type="button" disabled={saving} onClick={() => patch({ mark_transferred: true, mark_done: true, stage: "완료" })} className="ml-auto h-10 rounded-xl bg-rose-deep px-4 text-[13px] font-black text-white disabled:opacity-50">이체했어요 · 환불완료로 저장</button>
          ) : (
            <button type="button" disabled={saving} onClick={() => patch({ mark_done: true, stage: "완료" })} className="ml-auto h-10 rounded-xl bg-rose-deep px-4 text-[13px] font-black text-white disabled:opacity-50">환불완료로 저장</button>
          )}
        </div>
      </div>
    </div>
  );
}
