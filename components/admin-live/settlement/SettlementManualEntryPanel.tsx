"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";
import type { SettlementBroadcastOption, SettlementManualEntry, SettlementManualEntryType } from "./settlementTypes";
import SettlementManualEntryDetailModal, { type SettlementManualEntryLog } from "./SettlementManualEntryDetailModal";
import { formatMoneyInput, manualEntryBroadcastKey, manualEntryDateKey, manualEntryLabel, toNumber, won } from "./settlementUtils";

const PAGE_SIZE_OPTIONS = [5, 10, 20];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function entryTypeLabel(value: SettlementManualEntryType) {
  return value === "income" ? "추가 정산 수익" : "창고/기타 지출";
}

function entryTypeTone(value: SettlementManualEntryType) {
  return value === "income" ? "text-info-tx bg-info-bg border-line" : "text-[var(--color-cardpay)] bg-[var(--color-cardpay)]/12 border-[var(--color-cardpay)]/30";
}

function getVisiblePages(currentPage: number, pageCount: number) {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);

  let start = Math.max(1, currentPage - 2);
  let end = Math.min(pageCount, start + 4);

  if (end - start < 4) start = Math.max(1, end - 4);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

type Props = {
  entries: SettlementManualEntry[];
  broadcastOptions: SettlementBroadcastOption[];
  loading: boolean;
  tableReady: boolean;
  onChanged: () => void;
  /** [2026-09-08] 정산 화면에서 «지금 고른» 방송 키 — 열자마자 이 방송으로 채운다 */
  presetBroadcastKey?: string;
  /** [2026-09-08] 그 방송의 날짜(없으면 기간 종료일). 오늘로 잘못 저장되던 것 방지 */
  presetDate?: string;
  /** 위 정산 화면이 지금 보고 있는 조건 설명 (화면에 그대로 표시) */
  presetLabel?: string;
};

export default function SettlementManualEntryPanel({
  entries,
  broadcastOptions,
  loading,
  tableReady,
  onChanged,
  presetBroadcastKey = "",
  presetDate = "",
  presetLabel = "",
}: Props) {
  const [entryType, setEntryType] = useState<SettlementManualEntryType>("expense");
  // ⚠ 기본값이 «오늘»이면 지난 방송을 골라놓고 입력할 때 날짜가 어긋난다 → 고른 방송 날짜 우선.
  const [entryDate, setEntryDate] = useState(presetDate || todayKey());
  const [broadcastKey, setBroadcastKey] = useState(presetBroadcastKey);
  const [title, setTitle] = useState("창고정산");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);
  const [detailEntry, setDetailEntry] = useState<SettlementManualEntry | null>(null);
  const [detailLogs, setDetailLogs] = useState<SettlementManualEntryLog[]>([]);
  const [detailLogsLoading, setDetailLogsLoading] = useState(false);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const dateCompare = String(b.entry_date || "").localeCompare(String(a.entry_date || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  }, [entries]);

  const pageCount = Math.max(1, Math.ceil(sortedEntries.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const visibleEntries = sortedEntries.slice(startIndex, startIndex + pageSize);
  const visiblePages = getVisiblePages(safePage, pageCount);

  const selectedBroadcast = broadcastOptions.find((option) => option.key === broadcastKey) || null;

  const resetForm = () => {
    setEntryType("expense");
    // 저장 후에도 «고른 방송» 기준을 유지 — 연속 입력할 때 매번 날짜를 다시 고치지 않게
    setEntryDate(presetDate || todayKey());
    setBroadcastKey(presetBroadcastKey);
    setTitle("창고정산");
    setAmount("");
    setMemo("");
    setEditingId("");
  };

  const startEdit = (entry: SettlementManualEntry) => {
    setEditingId(String(entry.id || ""));
    setEntryType(entry.entry_type);
    setEntryDate(manualEntryDateKey(entry) || todayKey());
    setBroadcastKey(String(entry.broadcast_key || ""));
    setTitle(String(entry.title || ""));
    setAmount(formatMoneyInput(String(entry.amount || "")));
    setMemo(String(entry.memo || ""));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveEntry = async () => {
    if (!tableReady) {
      showAdminToast("정산 추가 입력 저장 준비가 안 되어 있습니다. 개발자에게 알려주세요. (settlement_manual_entries 표 없음)", "error");
      return;
    }

    const cleanTitle = title.trim();
    const nextAmount = Math.round(toNumber(amount));

    if (!cleanTitle) {
      showAdminToast("제목을 입력해주세요.", "error");
      return;
    }

    if (!entryDate) {
      showAdminToast("날짜를 선택해주세요.", "error");
      return;
    }

    if (nextAmount <= 0) {
      showAdminToast("금액을 입력해주세요.", "error");
      return;
    }

    const nextBroadcastKey = broadcastKey || `date:${entryDate}`;
    const nextBroadcastLabel = selectedBroadcast?.label || `${entryDate} · 정산추가`;

    const payload = {
      entry_type: entryType,
      title: cleanTitle,
      amount: nextAmount,
      memo: memo.trim() || null,
      entry_date: entryDate,
      broadcast_key: nextBroadcastKey,
      broadcast_label: nextBroadcastLabel,
      is_active: true,
      deleted_at: null,
    };

    setSaving(true);

    try {
      const originalEntry = editingId ? entries.find((entry) => String(entry.id || "") === editingId) || null : null;

      const query = editingId
        ? supabase.from("settlement_manual_entries").update(payload).eq("id", editingId).select("*").single()
        : supabase.from("settlement_manual_entries").insert(payload).select("*").single();

      const { data: savedEntry, error } = await query;

      if (error) {
        showAdminToast("정산 추가 입력 저장 실패\n\n" + error.message, "error");
        return;
      }

      await writeEntryLog({
        entryId: savedEntry?.id,
        action: editingId ? "update" : "create",
        beforeValue: originalEntry,
        afterValue: savedEntry,
        memo: editingId ? "정산 추가 입력 수정" : "정산 추가 신규 입력",
      });

      showAdminToast(editingId ? "추가 정산 내역을 수정했습니다." : "추가 정산 내역을 추가했습니다.", "success");
      resetForm();
      closeDetail();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const deactivateEntry = async (entry: SettlementManualEntry) => {
    if (!entry.id) return;

    const ok = await showAdminConfirm("이 추가 정산 내역을 목록에서 삭제 처리할까요?\n완전삭제가 아니라 비활성 처리됩니다.", { title: "추가 정산 내역 삭제", confirmText: "삭제", cancelText: "취소", tone: "danger" });
    if (!ok) return;

    setSaving(true);

    try {
      const deletedAt = new Date().toISOString();
      const afterValue = {
        ...entry,
        is_active: false,
        deleted_at: deletedAt,
      };

      const { error } = await supabase
        .from("settlement_manual_entries")
        .update({
          is_active: false,
          deleted_at: deletedAt,
        })
        .eq("id", entry.id);

      if (error) {
        showAdminToast("추가 정산 내역 삭제 처리 실패\n\n" + error.message, "error");
        return;
      }

      await writeEntryLog({
        entryId: entry.id,
        action: "delete",
        beforeValue: entry,
        afterValue,
        memo: "정산 추가 입력 삭제 처리",
      });

      showAdminToast("추가 정산 내역을 삭제 처리했습니다.", "success");
      closeDetail();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const writeEntryLog = async ({
    entryId,
    action,
    beforeValue,
    afterValue,
    memo: logMemo,
  }: {
    entryId?: string | null;
    action: SettlementManualEntryLog["action"];
    beforeValue?: any;
    afterValue?: any;
    memo?: string;
  }) => {
    if (!entryId) return;

    try {
      await supabase.from("settlement_manual_entry_logs").insert({
        entry_id: entryId,
        action,
        before_value: beforeValue || null,
        after_value: afterValue || null,
        memo: logMemo || null,
      });
    } catch (error) {
      console.warn("settlement manual entry log skipped", error);
    }
  };

  const openDetail = async (entry: SettlementManualEntry) => {
    setDetailEntry(entry);
    setDetailLogs([]);
    setDetailLogsLoading(true);

    try {
      if (!entry.id) return;

      const { data, error } = await supabase
        .from("settlement_manual_entry_logs")
        .select("*")
        .eq("entry_id", entry.id)
        .order("created_at", { ascending: false });

      if (!error) {
        setDetailLogs((data || []) as SettlementManualEntryLog[]);
      }
    } finally {
      setDetailLogsLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailEntry(null);
    setDetailLogs([]);
    setDetailLogsLoading(false);
  };

  const totalIncome = entries.filter((entry) => entry.entry_type === "income").reduce((sum, entry) => sum + toNumber(entry.amount), 0);
  const totalExpense = entries.filter((entry) => entry.entry_type === "expense").reduce((sum, entry) => sum + toNumber(entry.amount), 0);

  return (
    // [2026-09-08] 드로어 안 세로 2단: 위=입력칸(고정) / 아래=최근 내역(남는 세로 전부, 표만 스크롤).
    //   예전엔 카드 3겹을 한 스크롤에 넣어 빈 표 아래에 세로가 남아돌고 가로 스크롤바까지 생겼다.
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── 합계 띠 ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-5 py-2.5">
        <span className="rounded-full bg-ok-bg px-3 py-1.5 text-xs font-black text-ok-tx">
          추가 수익 +{won(totalIncome)}
        </span>
        <span className="rounded-full bg-warn-bg px-3 py-1.5 text-xs font-black text-warn-tx">
          창고·기타 지출 −{won(totalExpense)}
        </span>
        <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-black text-ink">
          합계 {totalIncome - totalExpense < 0 ? "−" : "+"}{won(Math.abs(totalIncome - totalExpense))}
        </span>
        <span className="ml-auto text-[11px] font-bold text-ink-mute">{presetLabel || "위 정산 화면의 기간·방송 조건 기준"}</span>
      </div>

      {/* ── 위: 입력칸 (고정) ── */}
      <div className="w-full max-w-[900px] shrink-0 border-b border-line px-5 py-4">
        {!tableReady ? (
          <div className="mb-3 rounded-xl border border-warn-tx/30 bg-warn-bg px-4 py-3 text-sm font-bold leading-6 text-warn-tx">
            정산 추가 입력을 저장할 준비가 아직 안 되어 있습니다. 개발자에게 알려주세요.
            <span className="ml-1 text-xs font-bold opacity-75">(settlement_manual_entries 표 없음 — docs/인수인계_관리자설정.md)</span>
          </div>
        ) : null}

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[168px_190px_200px]">
            <label className="grid gap-1">
              <span className="text-xs font-black text-ink-soft">구분</span>
              <select
                value={entryType}
                onChange={(event) => {
                  const nextType = event.target.value as SettlementManualEntryType;
                  setEntryType(nextType);
                  setTitle(nextType === "income" ? "방송외입금" : "창고정산");
                }}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-black text-ink outline-none focus:border-rose-deep"
              >
                <option value="expense">창고/기타 지출</option>
                <option value="income">추가 정산 수익</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-black text-ink-soft">날짜</span>
              <input
                type="date"
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-black text-ink outline-none focus:border-rose-deep"
              />
              {presetDate && entryDate !== presetDate ? (
                <button
                  type="button"
                  onClick={() => setEntryDate(presetDate)}
                  className="justify-self-start rounded-lg border border-warn-tx/35 bg-warn-bg px-2 py-0.5 text-[11px] font-black text-warn-tx"
                >
                  ↺ 고른 방송 날짜({presetDate})로
                </button>
              ) : null}
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-black text-ink-soft">금액</span>
              <div className="relative">
                <input
                  value={amount}
                  onChange={(event) => setAmount(formatMoneyInput(event.target.value))}
                  placeholder="0"
                  inputMode="numeric"
                  className="h-10 w-full rounded-xl border border-line bg-surface px-3 pr-9 text-right text-sm font-black tabular-nums text-ink outline-none focus:border-rose-deep"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-ink-mute">원</span>
              </div>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,360px)_minmax(0,360px)]">
            <label className="grid gap-1">
              <span className="text-xs font-black text-ink-soft">제목</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="창고정산, 택배비, 방송외입금, 기타수익"
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-black text-ink outline-none focus:border-rose-deep"
              />
              <span className="mt-0.5 flex flex-wrap gap-1.5">
                {(entryType === "income" ? ["방송외입금", "기타수익"] : ["창고정산", "택배비", "알바비", "사입비", "기타지출"]).map((quickTitle) => (
                  <button
                    key={quickTitle}
                    type="button"
                    onClick={() => setTitle(quickTitle)}
                    className={
                      title === quickTitle
                        ? "rounded-full bg-rose-deep px-2.5 py-1 text-[11px] font-black text-white"
                        : "rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-black text-ink-soft transition hover:bg-surface-2"
                    }
                  >
                    {quickTitle}
                  </button>
                ))}
              </span>
            </label>

            <div className="grid content-start gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-black text-ink-soft">연결 방송</span>
                <select
                  value={broadcastKey}
                  onChange={(event) => setBroadcastKey(event.target.value)}
                  className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-black text-ink outline-none focus:border-rose-deep"
                >
                  <option value="">날짜 기준 자동 연결</option>
                  {broadcastOptions.slice(0, 120).map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-xs font-black text-ink-soft">메모 <span className="font-bold text-ink-mute">(선택)</span></span>
                <input
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="무슨 수익/지출인지 한 줄로"
                  className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-rose-deep"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveEntry}
              disabled={saving || !tableReady}
              className="h-11 min-w-[170px] rounded-xl bg-rose-deep px-5 text-sm font-black text-white shadow-sm transition hover:opacity-90 active:scale-[0.99] disabled:cursor-wait disabled:opacity-45"
            >
              {saving ? "반영중..." : editingId ? "수정 저장" : "정산에 반영하기"}
            </button>

            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="h-11 rounded-xl border border-line bg-surface px-4 text-sm font-black text-ink-soft transition hover:bg-surface-2"
              >
                수정 취소
              </button>
            ) : null}

            <span className="text-xs font-bold text-ink-mute">주문서는 그대로 두고 정산 숫자에만 더해집니다.</span>
          </div>
        </div>
      </div>

      {/* ── 아래: 최근 내역 (남는 세로 전부) ── */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-surface-2 px-5 py-2.5">
          <div className="text-sm font-black text-ink">
            최근 추가 정산 내역 <span className="text-ink-mute">{entries.length.toLocaleString()}건</span>
          </div>
          {entries.length > 0 ? (
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="h-8 rounded-xl border border-line bg-surface px-2 text-xs font-black text-ink"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}개 보기
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-full min-h-[160px] items-center justify-center text-sm font-bold text-ink-mute">불러오는 중...</div>
          ) : visibleEntries.length === 0 ? (
            // [수정] 빈 상태를 표 안에 넣으면 min-w 때문에 «빈 화면에도 가로 스크롤바»가 생겼다 → 표 밖으로 뺀다.
            <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-1 px-6 text-center">
              <div className="text-sm font-black text-ink-soft">아직 추가한 정산 내역이 없습니다.</div>
              <div className="text-xs font-bold text-ink-mute">위에서 구분·날짜·금액을 넣고 「정산에 반영하기」를 누르면 여기에 쌓입니다.</div>
            </div>
          ) : (
            <table className="w-full min-w-[720px] border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface text-xs font-black text-ink-soft">
                  <th className="border-b border-line px-3 py-2.5 text-left">날짜/방송</th>
                  <th className="border-b border-line px-3 py-2.5 text-left">구분</th>
                  <th className="border-b border-line px-3 py-2.5 text-left">제목</th>
                  <th className="border-b border-line px-3 py-2.5 text-right">금액</th>
                  <th className="border-b border-line px-3 py-2.5 text-left">메모</th>
                  <th className="border-b border-line px-3 py-2.5 text-right">관리</th>
                </tr>
              </thead>

              <tbody>
                {visibleEntries.map((entry) => (
                  <tr key={entry.id} className="transition hover:bg-surface-2">
                    <td className="border-b border-line-soft px-3 py-2.5">
                      <div className="text-sm font-black text-ink">{manualEntryDateKey(entry) || "-"}</div>
                      <div className="mt-0.5 max-w-[220px] truncate text-xs font-bold text-ink-mute">
                        {entry.broadcast_label || manualEntryLabel(entry)}
                      </div>
                    </td>
                    <td className="border-b border-line-soft px-3 py-2.5">
                      <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-black ${entryTypeTone(entry.entry_type)}`}>
                        {entryTypeLabel(entry.entry_type)}
                      </span>
                    </td>
                    <td className="border-b border-line-soft px-3 py-2.5 text-sm font-black text-ink">{entry.title}</td>
                    <td className={`border-b border-line-soft px-3 py-2.5 text-right text-sm font-black tabular-nums ${entry.entry_type === "expense" ? "text-warn-tx" : "text-ok-tx"}`}>
                      {entry.entry_type === "expense" ? "−" : "+"}
                      {won(entry.amount)}
                    </td>
                    <td className="border-b border-line-soft px-3 py-2.5">
                      <div className="max-w-[220px] truncate text-xs font-bold text-ink-soft">{entry.memo || "-"}</div>
                    </td>
                    <td className="border-b border-line-soft px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDetail(entry)}
                          className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-black text-ink-soft transition hover:bg-surface-2"
                        >
                          상세
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(entry)}
                          className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-black text-ink-soft transition hover:bg-surface-2"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => deactivateEntry(entry)}
                          className="rounded-lg border border-danger-tx/40 px-2.5 py-1.5 text-xs font-black text-danger-tx transition hover:bg-danger-bg"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 페이지 버튼 — 2페이지 이상일 때만 (빈 목록에 페이지 줄이 뜨던 것 제거) */}
        {pageCount > 1 ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-2.5">
            <div className="text-xs font-bold text-ink-mute">
              {`${(startIndex + 1).toLocaleString()}-${Math.min(startIndex + pageSize, entries.length).toLocaleString()} / ${entries.length.toLocaleString()}개`}
            </div>

            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={safePage === 1}
                className="h-9 rounded-lg border border-line px-3 text-xs font-black text-ink-soft transition hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                처음
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                className="h-9 rounded-lg border border-line px-3 text-xs font-black text-ink-soft transition hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                이전
              </button>

              {visiblePages.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setPage(pageNumber)}
                  className={
                    pageNumber === safePage
                      ? "h-9 min-w-9 rounded-lg bg-rose-deep px-3 text-xs font-black text-white"
                      : "h-9 min-w-9 rounded-lg border border-line px-3 text-xs font-black text-ink-soft transition hover:bg-surface-2"
                  }
                >
                  {pageNumber}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                disabled={safePage === pageCount}
                className="h-9 rounded-lg border border-line px-3 text-xs font-black text-ink-soft transition hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                다음
              </button>
              <button
                type="button"
                onClick={() => setPage(pageCount)}
                disabled={safePage === pageCount}
                className="h-9 rounded-lg border border-line px-3 text-xs font-black text-ink-soft transition hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                마지막
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {detailEntry ? (
        <SettlementManualEntryDetailModal
          entry={detailEntry}
          logs={detailLogs}
          loadingLogs={detailLogsLoading}
          onClose={closeDetail}
          onEdit={() => {
            startEdit(detailEntry);
            closeDetail();
          }}
          onDelete={() => deactivateEntry(detailEntry)}
        />
      ) : null}
    </div>
  );
}
