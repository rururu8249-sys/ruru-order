"use client";

// [2026-09-26] 교환·환불 장부 1단계 — 시안 ② 장부 + ③ 처리 창.
//   ⚠️ 돈 무접촉: 포인트/주문/정산 안 건드림. refund_ledger 기록만 읽고 씀(서버 라우트 경유, service_role).
//   계좌: 목록은 뒷4자리만. 전체 번호는 처리 창 열 때/이체 목록 복사 때만 서버에서 받는다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { splitIssueBody } from "@/lib/issueBodyMeta";
import { parseBankAccount, bankDisplayName, isExcludedHolder } from "@/lib/parseBankAccount";
import {
  REFUND_STAGES,
  REFUND_KINDS,
  REASON_CHIPS,
  computeAmountFinal,
  computeRefundBase,
  stageDisplay,
  formatComma,
  parseAmountInput,
  type RefundLineSel,
  type RefundAdjustment,
} from "@/lib/refundLedger";

// [2026-09-26] 은행 select 목록
const BANK_OPTIONS = ["국민", "신한", "농협", "우리", "하나", "기업", "카카오뱅크", "토스뱅크", "케이뱅크", "새마을", "우체국", "수협", "SC제일", "부산", "대구", "경남", "광주", "전북", "제주", "신협", "씨티", "산업", "기타"] as const;

export type LedgerListRow = {
  id: string;
  created_at: string;
  admin_task_id?: string | null;
  order_lookup_code?: string | null;
  customer_phone?: string | null;
  nickname?: string | null;
  customer_name?: string | null;
  kind: string;
  reason?: string | null;
  product_snapshot?: Array<{ productId?: string; productName?: string; color?: string; size?: string; qty?: number }> | null;
  stage: string;
  next_action?: string | null;
  amount_base: number;
  adjustments?: RefundAdjustment[] | null;
  amount_final: number;
  method: string;
  bank?: string | null;
  account_last4?: string | null;
  account_holder?: string | null;
  transferred_at?: string | null;
  done_at?: string | null;
};

export type LedgerDetail = LedgerListRow & {
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
// [2026-09-26] 이전 초판이 reason 에 고객이슈 머리말(자동날짜/이슈유형/닉네임…)을 통째로 넣은 건 방어 —
//   화면·엑셀엔 «메모 본문»만 보인다. (DB 값은 안 건드림. fix_reason SQL 실행 후엔 이미 본문만 남음)
const reasonBody = (v: unknown) => { const memo = splitIssueBody(v).memo; return memo || clean(v); };

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

// [2026-09-26] 주문일 표기 "YYYY.MM.DD(요일)" (formatDateTime 재사용)
const dateWithDow = (v: unknown) => { const dt = formatDateTime(v); return typeof dt === "string" ? dt : dt.line1; };

// 복사 한 줄: 주문일 · 상품(옵션)×수량 · 사유 · 환불액 · 은행전체이름 계좌번호 · 예금주
function buildCopyLine(r: LedgerListRow, detail: LedgerDetail | null, orderDate: string) {
  const dateStr = dateWithDow(orderDate || r.created_at);
  const product = productText(r.product_snapshot);
  const reason = reasonBody(r.reason).split("\n")[0] || "-";
  const bank = bankDisplayName(clean(detail?.bank) || clean(r.bank));
  const acct = clean(detail?.account_number);
  const holder = clean(detail?.account_holder) || clean(r.account_holder) || clean(r.customer_name) || clean(r.nickname) || "-";
  const acctPart = [bank, acct].filter(Boolean).join(" ") || "-";
  return [dateStr, product, reason, won(r.amount_final), acctPart, holder].map((x) => x || "-").join(" · ");
}

// 주문일 묶음 조회(order-lines 재사용, 60개씩). 행마다 요청 금지.
async function fetchOrderDates(codes: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const uniq = Array.from(new Set(codes.map((c) => clean(c)).filter(Boolean)));
  for (let i = 0; i < uniq.length; i += 60) {
    const chunk = uniq.slice(i, i + 60);
    try {
      const res = await fetch(`/api/admin-live/order-lines?codes=${chunk.map(encodeURIComponent).join(",")}`, { cache: "no-store" });
      const p = await res.json().catch(() => null);
      if (p?.ok && p.byCode) for (const [code, e] of Object.entries(p.byCode as Record<string, { orderDate?: string }>)) out[code] = clean(e?.orderDate);
    } catch { /* 무시 */ }
  }
  return out;
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

  // 이체 목록 복사 — 선택 건의 «전체 계좌번호»(copyIds 1회) + 주문일(order-lines 묶음)로 통일 형식.
  const copyTransferList = async () => {
    const targets = selectedRows.filter((r) => r.method === "계좌이체");
    if (targets.length === 0) { showAdminToast("계좌이체 방법인 선택 건이 없어요."); return; }
    const detailById: Record<string, LedgerDetail> = {};
    try {
      const res = await fetch(`/api/admin-live/refund-ledger?copyIds=${targets.map((r) => encodeURIComponent(r.id)).join(",")}`, { cache: "no-store" });
      const p = await res.json().catch(() => null);
      if (p?.ok) for (const d of (p.items as LedgerDetail[]) || []) detailById[clean(d.id)] = d;
    } catch { /* 실패해도 뒷4자리 없는 대로 만든다 */ }
    const orderDateByCode = await fetchOrderDates(targets.map((r) => clean(r.order_lookup_code)));
    const text = targets
      .map((r) => buildCopyLine(r, detailById[clean(r.id)] || null, orderDateByCode[clean(r.order_lookup_code)] || ""))
      .join("\n");
    try { await navigator.clipboard.writeText(text); showAdminToast(`이체 목록 ${targets.length}건 복사했어요`, "success"); }
    catch { showAdminToast("복사 실패 — 아래 내용을 직접 복사하세요:\n\n" + text, "warning"); }
  };

  const downloadExcel = async () => {
    // 계좌는 뒷4자리만(보안). 주문일은 order-lines 묶음. CSV(BOM)로 저장.
    const orderDateByCode = await fetchOrderDates(rows.map((r) => clean(r.order_lookup_code)));
    const header = ["주문일", "상품", "사유", "환불액", "은행", "계좌(뒤4)", "예금주", "닉네임", "단계"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = rows.map((r) => {
      const dateStr = dateWithDow(orderDateByCode[clean(r.order_lookup_code)] || r.created_at);
      const holder = clean(r.account_holder) || clean(r.customer_name) || clean(r.nickname);
      return [dateStr, productText(r.product_snapshot), reasonBody(r.reason).replace(/\n/g, " "), r.amount_final, bankDisplayName(clean(r.bank)), clean(r.account_last4), holder, clean(r.nickname), stageDisplay(r.stage, r.kind)].map(esc).join(",");
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
                    <div className="truncate text-[11px] text-ink-soft" title={reasonBody(r.reason)}>{reasonBody(r.reason).split("\n")[0] || "-"}</div>
                  </div>
                  <div className="min-w-0">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-black ${STAGE_COLOR[r.stage] || "bg-surface-2 text-ink-soft"}`}>{stageDisplay(r.stage, r.kind)}</span>
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
export function RefundProcessModal({ item, onClose, onSaved, onCompleted }: { item: LedgerDetail; onClose: () => void; onSaved: () => void; onCompleted?: (taskId: string) => Promise<boolean> }) {
  const orderCode = clean(item.order_lookup_code);
  // 교환→환불 전환(item 12). 저장 눌러야 반영.
  const [kindOverride, setKindOverride] = useState<string>("");
  const kind = kindOverride || item.kind || "반품";
  const isExchange = kind === "교환";

  // [5차] 상태 칩 폐지 — stage 는 저장값 유지(완료 버튼만 stage 를 명시적으로 바꾼다)
  const [stage] = useState(item.stage || "접수");
  const [method, setMethod] = useState(item.method && item.method !== "없음" ? item.method : (isExchange ? "교환재발송" : "계좌이체"));
  const [exchangeOption, setExchangeOption] = useState(clean(item.exchange_option));
  const [reshipTracking, setReshipTracking] = useState(clean(item.reship_tracking));
  const [memo, setMemo] = useState(clean(item.memo));
  const [saving, setSaving] = useState(false);

  // 계좌 — 저장된 예금주가 제외 단어(입니다 등)면 열 때 확인 안내 + 편집 펼침(자동 수정 금지)
  const holderExcluded = isExcludedHolder(clean(item.account_holder));
  const [bank, setBank] = useState(clean(item.bank));
  const [account, setAccount] = useState(clean(item.account_number));
  const [holder, setHolder] = useState(clean(item.account_holder) || clean(item.customer_name) || clean(item.nickname));
  const [paste, setPaste] = useState("");
  const [acctEdit, setAcctEdit] = useState(holderExcluded);
  const [acctMissing, setAcctMissing] = useState<string[]>(holderExcluded ? ["holder"] : []);

  // 반품 사유(reason 필드) — 칩 하나 선택. 저장된 값이 칩이면 그 칩, 짧은 텍스트면 기타, 메모 통째 같은 긴 값이면 비움.
  const loadedReason = clean(item.reason);
  const isLongReason = loadedReason.length > 20 || loadedReason.includes("\n");
  const initReasonChip = (REASON_CHIPS as readonly string[]).includes(loadedReason)
    ? loadedReason
    : (loadedReason && !isLongReason ? "기타" : "");
  const [reasonChip, setReasonChip] = useState(initReasonChip);
  const [reasonEtc, setReasonEtc] = useState(initReasonChip === "기타" ? loadedReason : "");
  const [reasonDirty, setReasonDirty] = useState(false);
  const reasonVal = reasonChip === "기타" ? reasonEtc.trim() : reasonChip;

  // 차감 — 신규는 금액칸 1개. 기존 조정줄이 1개(차감)면 그 줄을 금액칸으로 불러와 편집(별도 줄 없음). 2개↑면 목록+입력.
  const initAdjs = (Array.isArray(item.adjustments) ? item.adjustments : [])
    .map((x) => ({ label: clean(x.label), amount: Math.round(Number(x.amount)) || 0 }))
    .filter((x) => x.label || x.amount !== 0);
  const singleAdj = initAdjs.length === 1 && initAdjs[0].amount < 0 ? initAdjs[0] : null;
  const [keptAdj, setKeptAdj] = useState<RefundAdjustment[]>(singleAdj ? [] : initAdjs);
  const [deductAmount, setDeductAmount] = useState(singleAdj ? Math.abs(singleAdj.amount) : 0);
  const [deductLabel] = useState(singleAdj ? clean(singleAdj.label) : ""); // 기존 저장 라벨 유지

  // 돌려받을 상품
  type OrderLineRow = { id: string; product_id: string; product_name: string; color: string; size: string; qty: number; unit: number; lineTotal: number; photo: string };
  const [lines, setLines] = useState<OrderLineRow[]>([]);
  const [linesLoaded, setLinesLoaded] = useState(false);
  const [shippingFee, setShippingFee] = useState(0);
  const [pointUsed, setPointUsed] = useState(0);
  const [orderDate, setOrderDate] = useState("");
  const [sel, setSel] = useState<Record<string, number>>({});
  const [includeShipping, setIncludeShipping] = useState(false);
  const [manualBase, setManualBase] = useState(Math.round(Number(item.amount_base)) || 0);
  const [matchAccepted, setMatchAccepted] = useState(false);

  const [dupWarn, setDupWarn] = useState<Array<{ amount_final: number; stage: string; created_at: string }>>([]);

  useEffect(() => {
    if (!orderCode) { setLinesLoaded(true); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin-live/order-lines?codes=${encodeURIComponent(orderCode)}`, { cache: "no-store" });
        const p = await res.json().catch(() => null);
        if (!alive) return;
        const entry = p?.ok ? p.byCode?.[orderCode] : null;
        const got: OrderLineRow[] = entry?.lines || [];
        setLines(got);
        setShippingFee(Math.max(0, Math.round(Number(entry?.shippingFee)) || 0));
        setPointUsed(Math.max(0, Math.round(Number(entry?.pointUsed)) || 0));
        setOrderDate(clean(entry?.orderDate));
        const targetQty: Record<string, number> = {};
        for (const s of (item.product_snapshot || [])) {
          const pid = clean((s as { productId?: unknown }).productId);
          if (pid) targetQty[pid] = Math.max(1, Math.round(Number(s.qty)) || 1);
        }
        const hasTarget = Object.keys(targetQty).length > 0;
        const init: Record<string, number> = {};
        for (const l of got) {
          if (got.length === 1) init[l.id] = l.qty; // 1개면 항상 포함
          else init[l.id] = hasTarget ? (targetQty[l.product_id] ? Math.min(targetQty[l.product_id], l.qty) : 0) : l.qty;
        }
        setSel(init);
        setLinesLoaded(true);
      } catch { if (alive) setLinesLoaded(true); }
    })();
    // 같은 주문 다른 환불 기록 경고
    (async () => {
      try {
        const res = await fetch(`/api/admin-live/refund-ledger?orderCode=${encodeURIComponent(orderCode)}`, { cache: "no-store" });
        const p = await res.json().catch(() => null);
        if (!alive || !p?.ok) return;
        const others = ((p.items || []) as Array<Record<string, unknown>>).filter((r) => {
          if (item.id && clean(r.id) === clean(item.id)) return false;
          if (!item.id && item.admin_task_id && clean(r.admin_task_id) === clean(item.admin_task_id)) return false;
          return true;
        });
        setDupWarn(others.map((r) => ({ amount_final: Number(r.amount_final) || 0, stage: String(r.stage ?? ""), created_at: String(r.created_at ?? "") })));
      } catch { /* 무시 */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderCode]);

  const matchFailed = linesLoaded && lines.length === 0;
  const selList: RefundLineSel[] = lines.map((l) => ({ lineTotal: l.lineTotal, qty: l.qty, unit: l.unit, selectedQty: sel[l.id] || 0 }));
  const autoBase = computeRefundBase(selList, includeShipping, shippingFee);
  const savedBase = item.id ? (Math.round(Number(item.amount_base)) || 0) : null;
  const baseMismatch = !matchFailed && savedBase !== null && !matchAccepted && savedBase !== autoBase;
  const amountBase = matchFailed ? manualBase : (baseMismatch ? (savedBase as number) : autoBase);

  const deductFinalLabel = deductLabel || (reasonVal ? `${reasonVal} 차감` : "차감");
  const finalAdj: RefundAdjustment[] = [...keptAdj, ...(deductAmount > 0 ? [{ label: deductFinalLabel, amount: -deductAmount }] : [])];
  const amountFinal = computeAmountFinal(amountBase, finalAdj);
  const deductTotal = finalAdj.filter((a) => a.amount < 0).reduce((s, a) => s - a.amount, 0);
  const formula = deductTotal > 0 ? `${formatComma(amountBase)} − ${formatComma(deductTotal)}` : "";

  const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select();
  const setQty = (id: string, q: number, max: number) => setSel((prev) => ({ ...prev, [id]: Math.max(0, Math.min(q, max)) }));

  const applyPaste = (raw: string) => {
    setPaste(raw);
    const r = parseBankAccount(raw);
    if (r.bank) setBank(r.bank);
    if (r.account) setAccount(r.account);
    if (r.holder) setHolder(r.holder);
    setAcctMissing(r.missing);
    if (r.missing.length > 0 && (r.bank || r.account || r.holder)) setAcctEdit(true); // 일부만 인식 → 펼쳐서 보정
  };

  // reason 저장: 사용자가 사유를 건드렸을 때만 새 값으로. 안 건드리면 신규는 이슈 메모, 기존은 유지(미전송).
  const reasonToSend = reasonDirty ? reasonVal : (item.id ? undefined : clean(item.reason));

  // 창을 닫지 않고 저장만 — 성공 여부 반환.
  const doPatch = async (extra: Record<string, unknown>): Promise<boolean> => {
    setSaving(true);
    try {
      const snapshot = matchFailed
        ? (item.product_snapshot ?? [])
        : lines.filter((l) => (sel[l.id] || 0) > 0).map((l) => ({ productId: l.product_id, productName: l.product_name, color: l.color, size: l.size, qty: sel[l.id] || 0 }));
      const body: Record<string, unknown> = {
        id: item.id || undefined,
        admin_task_id: item.admin_task_id || undefined,
        stage, kind, method,
        amount_base: amountBase, adjustments: finalAdj,
        bank, account_number: account, account_holder: holder,
        exchange_option: exchangeOption, reship_tracking: reshipTracking, memo,
        product_snapshot: snapshot,
        ...(reasonToSend !== undefined ? { reason: reasonToSend } : {}),
        ...(item.id ? {} : {
          nickname: clean(item.nickname), customer_name: clean(item.customer_name),
          customer_phone: clean(item.customer_phone), order_lookup_code: orderCode,
          next_action: clean(item.next_action),
        }),
        ...extra,
      };
      const res = await fetch("/api/admin-live/refund-ledger", {
        method: item.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!payload?.ok) { showAdminToast("저장 실패\n" + (payload?.message || ""), "error"); return false; }
      return true;
    } finally { setSaving(false); }
  };

  // 저장만(이체 전) — 창 닫고 목록 새로고침.
  const saveOnly = async () => {
    if (await doPatch({})) { showAdminToast("저장했습니다.", "success"); onSaved(); }
  };

  // 완료 — 모달 안 확인 → 기록 저장 → 이슈 해결완료 연동(부수효과 없는 상태변경만).
  const complete = async (extra: Record<string, unknown>, confirmMsg: string) => {
    const ok = await showAdminConfirm(confirmMsg, { title: isExchange ? "재발송 완료" : "환불 완료", confirmText: "네", cancelText: "취소", tone: "info" });
    if (!ok) return;
    const saved = await doPatch(extra);
    if (!saved) return;
    const taskId = clean(item.admin_task_id);
    if (taskId && onCompleted) {
      const resolved = await onCompleted(taskId).catch(() => false);
      showAdminToast(resolved ? "환불 기록 저장 + 이슈 해결완료로 넘겼어요." : "환불 기록은 저장됐어요. 이슈 해결완료는 목록에서 눌러주세요.", resolved ? "success" : "warning");
    } else {
      showAdminToast("저장했습니다.", "success");
    }
    onSaved();
  };

  const copyTransferInfo = async () => {
    // 통일 한 줄: 주문일 · 상품(옵션)×수량 · 사유 · 환불액 · 은행전체이름 계좌번호 · 예금주
    const dateStr = dateWithDow(orderDate || item.created_at);
    const product = matchFailed
      ? productText(item.product_snapshot)
      : productText(lines.filter((l) => (sel[l.id] || 0) > 0).map((l) => ({ productName: l.product_name, color: l.color, size: l.size, qty: sel[l.id] || 0 })));
    const reason = reasonVal || reasonBody(item.reason).split("\n")[0] || "-";
    const acctPart = [bankDisplayName(bank), account].filter(Boolean).join(" ") || "-";
    const line = [dateStr, product || "-", reason, won(amountFinal), acctPart, holder || "-"].map((x) => x || "-").join(" · ");
    try { await navigator.clipboard.writeText(line); showAdminToast("이체 정보 복사했어요", "success"); }
    catch { showAdminToast("복사 실패:\n" + line, "warning"); }
  };

  const memoFull = clean(item.reason);
  const memoFirst = memoFull.split("\n")[0] || "";
  const nextActionSaved = clean(item.next_action);
  const INPUT = "h-11 rounded-lg border border-line bg-surface px-3 text-[16px] font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-rose-deep";
  // [5차] 헤더 아래 회색 안내 — 돈이 여기서 안 나간다는 것을 명확히.
  const headerNotice = isExchange
    ? ""
    : method === "포인트"
      ? "포인트는 아직 자동 지급되지 않아요. 지급 후 [지급했어요]를 누르세요."
      : method === "계좌이체"
        ? "여기서 돈이 나가지 않아요. 은행 앱에서 보낸 뒤 [이체했어요]를 누르세요."
        : "";

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[94vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {/* 1. 헤더 */}
        <div className="flex items-start justify-between gap-2 border-b border-line px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-ink">{isExchange ? "교환하기" : "환불하기"}</h3>
            {headerNotice ? <div className="mt-1 text-[13px] leading-5 text-ink-mute">{headerNotice}</div> : null}
            <div className="mt-1 text-[13px] leading-5 text-ink-soft">
              <div className="truncate font-black text-ink">{clean(item.nickname) || "—"}{clean(item.customer_name) ? ` · ${clean(item.customer_name)}` : ""}{orderCode ? ` · ${orderCode}` : ""}</div>
              {memoFirst ? <div className="truncate text-ink-mute">💬 {memoFirst}</div> : null}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 rounded-full px-2 text-lg font-black text-ink-mute hover:bg-surface-2">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {dupWarn.length > 0 ? (
            <div className="mb-3 rounded-lg border border-warn-tx/40 bg-warn-bg px-3 py-2 text-[13px] font-bold text-warn-tx">
              같은 주문에 다른 환불 기록이 있어요: {dupWarn.map((d) => `${won(d.amount_final)} · ${d.stage}${(() => { const t = new Date(d.created_at); return Number.isNaN(t.getTime()) ? "" : ` (${t.getMonth() + 1}/${t.getDate()} 이슈)`; })()}`).join(", ")}
            </div>
          ) : null}

          {/* 2. 상품 */}
          <div className="mb-3">
            <div className="mb-1 text-[13px] font-black text-ink-mute">{isExchange ? "교환 대상 상품" : "돌려받을 상품"}</div>
            {!linesLoaded ? (
              <div className="rounded-xl border border-line p-4 text-center text-[13px] font-bold text-ink-mute">주문 상품 불러오는 중…</div>
            ) : matchFailed ? (
              isExchange ? (
                <div className="rounded-xl border border-line p-3 text-[14px] font-bold text-ink">{productText(item.product_snapshot)}</div>
              ) : (
                <div className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-black text-ink-soft">상품 금액</span>
                    <input inputMode="numeric" value={formatComma(manualBase)} onFocus={selectOnFocus} onChange={(e) => setManualBase(parseAmountInput(e.target.value))} className={`w-36 text-right ${INPUT}`} />
                  </div>
                  <div className="mt-1 text-[13px] text-ink-mute">주문 상품을 못 찾아 직접 입력합니다.</div>
                </div>
              )
            ) : (
              <div className="rounded-xl border border-line">
                {lines.map((l) => {
                  const picked = sel[l.id] || 0;
                  const on = lines.length === 1 ? true : picked > 0;
                  return (
                    <div key={l.id} className="flex items-center gap-2 border-b border-line px-2 py-2 last:border-b-0">
                      {lines.length > 1 ? (
                        <button type="button" onClick={() => setQty(l.id, on ? 0 : l.qty, l.qty)} aria-label="선택" className="flex h-11 w-11 shrink-0 items-center justify-center">
                          <span className={`flex h-5 w-5 items-center justify-center rounded border text-[13px] ${on ? "border-rose-deep bg-rose-deep text-white" : "border-line bg-surface text-transparent"}`}>✓</span>
                        </button>
                      ) : null}
                      {l.photo ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={l.photo} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover" loading="lazy" />
                      ) : <span className="h-10 w-10 shrink-0 rounded-lg border border-line bg-surface-2" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-bold text-ink">{l.product_name}</div>
                        <div className="truncate text-[13px] text-ink-mute">{[l.color, l.size].filter(Boolean).join("/")}{[l.color, l.size].filter(Boolean).length ? " · " : ""}{formatComma(l.unit)}원 × {l.qty}</div>
                      </div>
                      {lines.length > 1 && l.qty > 1 && on ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <button type="button" onClick={() => setQty(l.id, picked - 1, l.qty)} className="h-8 w-8 rounded-lg border border-line text-[14px] font-black text-ink-soft">−</button>
                          <span className="w-6 text-center text-[14px] font-black text-ink">{picked}</span>
                          <button type="button" onClick={() => setQty(l.id, picked + 1, l.qty)} className="h-8 w-8 rounded-lg border border-line text-[14px] font-black text-ink-soft">+</button>
                        </div>
                      ) : null}
                      <div className="w-20 shrink-0 text-right text-[14px] font-black text-ink">{formatComma(on ? (picked === l.qty || lines.length === 1 ? l.lineTotal : l.unit * picked) : 0)}원</div>
                    </div>
                  );
                })}
                {!isExchange && shippingFee > 0 ? (
                  <label className="flex items-center gap-2 px-2 py-2 text-[13px] font-bold text-ink-soft">
                    <input type="checkbox" checked={includeShipping} onChange={(e) => setIncludeShipping(e.target.checked)} className="h-5 w-5 accent-rose-deep" />
                    배송비도 환불 <span className="text-ink-mute">({formatComma(shippingFee)}원)</span>
                  </label>
                ) : null}
              </div>
            )}
            {baseMismatch ? (
              <div className="mt-2 rounded-lg border border-warn-tx/40 bg-warn-bg px-3 py-2 text-[13px] font-bold text-warn-tx">
                저장된 상품 금액 {formatComma(savedBase)}원이 주문 금액 {formatComma(autoBase)}원과 달라요.
                <button type="button" onClick={() => setMatchAccepted(true)} className="ml-1 rounded border border-warn-tx/50 px-2 py-0.5 text-[13px] font-black text-warn-tx hover:bg-warn-bg">주문 금액으로 맞추기</button>
              </div>
            ) : null}
            {!isExchange && pointUsed > 0 ? (
              <div className="mt-2 rounded-lg border border-warn-tx/40 bg-warn-bg px-3 py-2 text-[13px] font-bold text-warn-tx">
                이 주문은 포인트 {formatComma(pointUsed)}원 사용 — 환불액 확인 필요 (자동 차감하지 않아요)
              </div>
            ) : null}
          </div>

          {/* 2-1. 사유 (reason 필드) */}
          <div className="mb-3">
            <div className="mb-1 text-[13px] font-black text-ink-mute">{isExchange ? "교환 사유" : "사유"}</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {REASON_CHIPS.map((c) => (
                <button key={c} type="button"
                  onClick={() => { setReasonChip(reasonChip === c ? "" : c); setReasonDirty(true); }}
                  className={`rounded-full px-3 py-1.5 text-[14px] font-black transition ${reasonChip === c ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft hover:bg-surface-2"}`}>{c}</button>
              ))}
              {reasonChip === "기타" ? (
                <input value={reasonEtc} onChange={(e) => { setReasonEtc(e.target.value); setReasonDirty(true); }} placeholder="사유 입력" className={`w-40 ${INPUT}`} maxLength={40} />
              ) : null}
            </div>
          </div>

          {!isExchange ? (
            <>
              {/* 3. 차감 */}
              <div className="mb-3">
                <div className="mb-1 text-[13px] font-black text-ink-mute">차감</div>
                {keptAdj.length > 0 ? (
                  <div className="mb-1 space-y-1">
                    {keptAdj.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1 text-[13px]">
                        <span className={`shrink-0 rounded px-1.5 py-0.5 font-black ${a.amount < 0 ? "bg-danger-bg text-danger-tx" : "bg-ok-bg text-ok-tx"}`}>{a.label || (a.amount < 0 ? "차감" : "추가")}</span>
                        <span className="min-w-0 flex-1 text-right font-black text-ink">{a.amount < 0 ? "−" : "+"}{formatComma(Math.abs(a.amount))}원</span>
                        <button type="button" onClick={() => setKeptAdj((prev) => prev.filter((_, j) => j !== i))} aria-label="삭제" className="shrink-0 rounded px-2 py-1 font-black text-danger-tx hover:bg-danger-bg">삭제</button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5">
                  <input inputMode="numeric" value={formatComma(deductAmount)} onFocus={selectOnFocus} onChange={(e) => setDeductAmount(parseAmountInput(e.target.value))} placeholder="차감 금액" className={`w-32 text-right ${INPUT}`} />
                  <span className="text-[13px] text-ink-mute">원 차감{deductAmount > 0 ? ` · ${deductFinalLabel}` : ""}</span>
                </div>
              </div>

              {/* 4. 환불할 금액 */}
              <div className="mb-3 rounded-xl border border-rose-line bg-rose-soft/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-black text-ink">환불할 금액</span>
                  <span className="text-[22px] font-black text-rose-deep">{won(amountFinal)}</span>
                </div>
                {formula ? <div className="mt-0.5 text-right text-[13px] font-bold text-ink-mute">{formula} = {won(amountFinal)}</div> : null}
              </div>

              {/* 5·6. 방법·계좌 */}
              <div className="mb-3">
                {method === "계좌이체" ? (
                  <div className="rounded-xl border border-line p-3">
                    {holderExcluded ? (
                      <div className="mb-2 rounded-lg border border-warn-tx/40 bg-warn-bg px-3 py-2 text-[13px] font-bold text-warn-tx">예금주가 &lsquo;{clean(item.account_holder)}&rsquo;로 저장돼 있어요. 확인해 주세요.</div>
                    ) : null}
                    {item.account_hidden ? (
                      <div className="text-[14px] font-bold text-ink">{[bankDisplayName(bank), holder].filter(Boolean).join(" · ")}<div className="mt-1 text-[13px] font-bold text-ink-mute">완료 후 30일이 지나 계좌번호는 가려졌습니다(은행·예금주는 유지).</div></div>
                    ) : !(acctEdit || !account) ? (
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{[bankDisplayName(bank), account, holder].filter(Boolean).join(" · ") || "계좌 정보를 붙여넣으세요"}</span>
                        <button type="button" onClick={() => setAcctEdit(true)} className="shrink-0 text-[14px] font-black text-ink-soft underline">수정</button>
                        <button type="button" onClick={copyTransferInfo} className="shrink-0 rounded-lg border border-rose-line bg-surface px-2 py-1 text-[14px] font-black text-rose-deep hover:bg-rose-soft">📋 복사</button>
                      </div>
                    ) : (
                      <>
                        <input value={paste} onChange={(e) => applyPaste(e.target.value)} onPaste={(e) => applyPaste(e.clipboardData.getData("text"))} placeholder="계좌 정보 붙여넣기 (예: 국민은행 123456 01 234567 홍길동)" className={`w-full ${INPUT}`} />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <select value={BANK_OPTIONS.includes(bank as typeof BANK_OPTIONS[number]) ? bank : (bank ? "기타" : "")} onChange={(e) => setBank(e.target.value === "기타" ? "" : e.target.value)} className={`w-32 ${INPUT} ${acctMissing.includes("bank") ? "ring-2 ring-warn-tx" : ""}`}>
                            <option value="">은행</option>
                            {BANK_OPTIONS.map((b) => <option key={b} value={b}>{bankDisplayName(b)}</option>)}
                          </select>
                          <input value={account} onChange={(e) => setAccount(e.target.value.replace(/[^0-9]/g, ""))} onFocus={selectOnFocus} placeholder="계좌번호(숫자)" inputMode="numeric" className={`min-w-0 flex-1 ${INPUT} ${acctMissing.includes("account") ? "ring-2 ring-warn-tx" : ""}`} />
                          <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="예금주" className={`w-24 ${INPUT} ${acctMissing.includes("holder") || holderExcluded ? "ring-2 ring-warn-tx" : ""}`} />
                        </div>
                        {account ? <button type="button" onClick={copyTransferInfo} className="mt-2 rounded-lg border border-rose-line bg-surface px-2 py-1 text-[14px] font-black text-rose-deep hover:bg-rose-soft">📋 복사</button> : null}
                      </>
                    )}
                  </div>
                ) : method === "포인트" ? (
                  <div className="rounded-xl border border-warn-tx/40 bg-warn-bg px-3 py-2 text-[13px] font-bold text-warn-tx">포인트 지급 버튼은 다음 작업에서 연결돼요. 지금은 기록만 저장돼요.</div>
                ) : (
                  <div className="rounded-xl border border-line px-3 py-2 text-[13px] font-bold text-ink-mute">환불 없이 종료합니다(금액 이동 없음).</div>
                )}
                <div className="mt-1 flex gap-3 text-[13px] font-bold text-ink-mute">
                  {method !== "계좌이체" ? <button type="button" onClick={() => setMethod("계좌이체")} className="underline">계좌이체로 돌아가기</button> : (
                    <>
                      <button type="button" onClick={() => setMethod("포인트")} className="underline">포인트로 환불</button>
                      <button type="button" onClick={() => setMethod("없음")} className="underline">환불 없이 종료</button>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* 교환: 바꿀 옵션·송장(한 번만) */
            <div className="mb-3 rounded-xl border border-line p-3">
              <div className="text-[13px] font-black text-ink-soft">바꿀 옵션</div>
              <input value={exchangeOption} onChange={(e) => setExchangeOption(e.target.value)} placeholder="예: XL → 2XL" className={`mt-1 w-full ${INPUT}`} />
              <div className="mt-2 text-[13px] font-black text-ink-soft">재발송 송장번호</div>
              <input inputMode="numeric" value={reshipTracking} onChange={(e) => setReshipTracking(e.target.value)} placeholder="재발송 택배 송장번호" className={`mt-1 w-full ${INPUT}`} />
            </div>
          )}

          {/* 8. 메모 (상태 칩은 5차에서 폐지 — stage 는 저장값 그대로 유지) */}
          {nextActionSaved ? <div className="mb-1 text-[13px] text-ink-mute">다음 할 일: {nextActionSaved}</div> : null}
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" className={`w-full ${INPUT}`} />

          {isExchange ? (
            <button type="button" onClick={() => { setKindOverride("반품"); setMethod("계좌이체"); }} className="mt-3 text-[13px] font-bold text-ink-mute underline">재고 없으면 → 환불로 바꾸기</button>
          ) : null}
        </div>

        {/* 9. 하단 고정 — 왼쪽 「저장만」 / 오른쪽 완료 → 해결완료 */}
        <div className="flex items-center gap-2 border-t border-line px-5 py-3">
          <button type="button" disabled={saving} onClick={saveOnly} className="h-12 rounded-xl border border-line bg-surface px-4 text-[14px] font-black text-ink-soft hover:bg-surface-2 disabled:opacity-50">저장만</button>
          {isExchange ? (
            <button type="button" disabled={saving} onClick={() => complete({ mark_done: true, stage: "완료" }, "재발송 완료로 기록하고 해결완료로 넘길까요?")} className="ml-auto h-12 rounded-xl bg-rose-deep px-4 text-[14px] font-black text-white disabled:opacity-50">재발송했어요 → 해결완료</button>
          ) : method === "계좌이체" ? (
            <button type="button" disabled={saving} onClick={() => complete({ mark_transferred: true, mark_done: true, stage: "완료" }, `${won(amountFinal)} 이체 완료로 기록하고 해결완료로 넘길까요?`)} className="ml-auto h-12 rounded-xl bg-rose-deep px-4 text-[14px] font-black text-white disabled:opacity-50">이체했어요 → 해결완료</button>
          ) : method === "포인트" ? (
            <button type="button" disabled={saving} onClick={() => complete({ mark_done: true, stage: "완료" }, "포인트 지급 완료로 기록하고 해결완료로 넘길까요?")} className="ml-auto h-12 rounded-xl bg-rose-deep px-4 text-[14px] font-black text-white disabled:opacity-50">지급했어요 → 해결완료</button>
          ) : (
            <button type="button" disabled={saving} onClick={() => complete({ mark_done: true, stage: "거절·취소" }, "환불 없이 해결완료로 넘길까요?")} className="ml-auto h-12 rounded-xl bg-rose-deep px-4 text-[14px] font-black text-white disabled:opacity-50">환불 없이 해결완료</button>
          )}
        </div>
      </div>
    </div>
  );
}
