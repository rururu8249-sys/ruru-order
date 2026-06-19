"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
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
  return value === "income" ? "text-info-tx bg-info-bg border-line" : "text-violet-700 bg-violet-50 border-violet-100";
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
};

export default function SettlementManualEntryPanel({
  entries,
  broadcastOptions,
  loading,
  tableReady,
  onChanged,
}: Props) {
  const [entryType, setEntryType] = useState<SettlementManualEntryType>("expense");
  const [entryDate, setEntryDate] = useState(todayKey());
  const [broadcastKey, setBroadcastKey] = useState("");
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
    setEntryDate(todayKey());
    setBroadcastKey("");
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
      showAdminToast("정산 추가 입력 테이블이 아직 없습니다. Supabase SQL Editor에서 settlement_manual_entries.sql을 먼저 실행해주세요.", "error");
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

    const ok = window.confirm("이 추가 정산 내역을 목록에서 삭제 처리할까요?\n완전삭제가 아니라 비활성 처리됩니다.");
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
    <div className="grid gap-3 rounded-[26px] border border-line bg-surface p-4 shadow-[0_12px_30px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold leading-6 text-ink-soft">
            주문서에 없는 추가 정산 수익과 창고/기타 지출만 빠르게 입력합니다.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="rounded-full bg-info-bg px-3 py-2 text-xs font-black text-info-tx">
            추가 정산 수익 {won(totalIncome)}
          </div>
          <div className="rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">
            창고/기타 지출 -{won(totalExpense)}
          </div>
        </div>
      </div>

      {!tableReady ? (
        <div className="rounded-2xl border border-line bg-warn-bg px-4 py-3 text-sm font-bold leading-6 text-warn-tx">
          정산 추가 입력 테이블이 아직 없습니다. 먼저 Supabase SQL Editor에서
          <span className="mx-1 font-black">supabase/sql/settlement_manual_entries.sql</span>
          내용을 실행해야 저장이 가능합니다.
        </div>
      ) : null}
      <div className="grid gap-3 rounded-[22px] border border-line bg-surface-2 p-3">
        <div className="grid gap-3 lg:grid-cols-[0.85fr_1fr_1fr]">
          <label className="grid gap-1">
            <span className="text-xs font-black text-ink-soft">구분</span>
            <select
              value={entryType}
              onChange={(event) => {
                const nextType = event.target.value as SettlementManualEntryType;
                setEntryType(nextType);
                setTitle(nextType === "income" ? "방송외입금" : "창고정산");
              }}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-black outline-none focus:border-blue-400"
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
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-black outline-none focus:border-blue-400"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black text-ink-soft">금액</span>
            <div className="relative">
              <input
              value={amount}
              onChange={(event) => setAmount(formatMoneyInput(event.target.value))}
              placeholder="0"
              className="h-10 w-full rounded-xl border border-line bg-surface px-3 pr-10 text-sm font-black outline-none focus:border-blue-400"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-ink-mute">원</span>
            </div>
          </label>
        </div>

        <div className="grid gap-2">
          <span className="text-xs font-black text-ink-soft">빠른 제목</span>
          <div className="flex flex-wrap gap-2">
            {(entryType === "income" ? ["방송외입금", "기타수익"] : ["창고정산", "택배비", "알바비", "사입비", "기타지출"]).map((quickTitle) => (
              <button
                key={quickTitle}
                type="button"
                onClick={() => setTitle(quickTitle)}
                className={
                  title === quickTitle
                    ? "rounded-full bg-rose-deep px-3 py-1.5 text-xs font-black text-white shadow-sm"
                    : "rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-black text-ink-soft hover:bg-surface-2"
                }
              >
                {quickTitle}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <label className="grid gap-1">
            <span className="text-xs font-black text-ink-soft">제목</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="창고정산, 택배비, 방송외입금, 기타수익"
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-black outline-none focus:border-blue-400"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black text-ink-soft">연결 방송</span>
            <select
              value={broadcastKey}
              onChange={(event) => setBroadcastKey(event.target.value)}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-black outline-none focus:border-blue-400"
            >
              <option value="">날짜 기준 자동 연결</option>
              {broadcastOptions.slice(0, 120).map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveEntry}
            disabled={saving || !tableReady}
            className="h-10 min-w-[150px] rounded-xl bg-rose-deep px-5 text-sm font-black text-white shadow-sm transition hover:bg-rose-deep disabled:cursor-wait disabled:opacity-45"
          >
            {saving ? "반영중" : editingId ? "수정 저장" : "정산에 반영하기"}
          </button>

          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="h-10 rounded-xl border border-line bg-surface px-4 text-sm font-black text-ink-soft shadow-sm"
            >
              수정 취소
            </button>
          ) : null}

          <div className="text-xs font-bold text-ink-mute">
            주문서와 별도로 정산에만 반영됩니다.
          </div>
        </div>
      </div>

      <label className="grid gap-1">
        <span className="text-xs font-black text-ink-soft">메모</span>
        <textarea
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="무슨 추가 정산 수익/창고·기타 지출인지 메모를 적어주세요."
          className="min-h-[62px] rounded-xl border border-line px-4 py-2.5 text-sm font-bold outline-none focus:border-blue-400"
        />
      </label>

      <div className="overflow-hidden rounded-[20px] border border-line">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft bg-surface-2 px-4 py-3">
          <div className="text-sm font-black text-ink">최근 추가 정산 내역</div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="h-8 rounded-xl border border-line bg-surface px-2 text-xs font-black"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}개 보기
                </option>
              ))}
            </select>
            <div className="rounded-full bg-surface px-3 py-2 text-xs font-black text-ink-soft">
              총 {entries.length.toLocaleString()}개
            </div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[760px] w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-surface text-xs font-black text-ink-soft">
                <th className="px-3 py-2.5 text-left">날짜/방송</th>
                <th className="px-3 py-2.5 text-left">구분</th>
                <th className="px-3 py-2.5 text-left">제목</th>
                <th className="px-3 py-2.5 text-right">금액</th>
                <th className="px-3 py-2.5 text-left">메모</th>
                <th className="px-3 py-2.5 text-right">관리</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm font-bold text-ink-mute">
                    불러오는 중...
                  </td>
                </tr>
              ) : visibleEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm font-bold text-ink-mute">
                    아직 추가한 정산 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                visibleEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-info-bg">
                    <td className="border-t border-line-soft px-3 py-2.5">
                      <div className="text-sm font-black text-ink">{manualEntryDateKey(entry) || "-"}</div>
                      <div className="mt-1 max-w-[260px] truncate text-xs font-bold text-ink-mute">
                        {entry.broadcast_label || manualEntryLabel(entry)}
                      </div>
                    </td>
                    <td className="border-t border-line-soft px-3 py-2.5">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${entryTypeTone(entry.entry_type)}`}>
                        {entryTypeLabel(entry.entry_type)}
                      </span>
                    </td>
                    <td className="border-t border-line-soft px-3 py-2.5 text-sm font-black text-ink">{entry.title}</td>
                    <td className="border-t border-line-soft px-3 py-2.5 text-right text-sm font-black tabular-nums text-ink">
                      {entry.entry_type === "expense" ? "-" : ""}
                      {won(entry.amount)}
                    </td>
                    <td className="border-t border-line-soft px-3 py-2.5">
                      <div className="max-w-[260px] truncate text-xs font-bold text-ink-soft">{entry.memo || "-"}</div>
                    </td>
                    <td className="border-t border-line-soft px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openDetail(entry)}
                          className="rounded-xl border border-line px-3 py-2 text-xs font-black text-info-tx hover:bg-info-bg"
                        >
                          상세
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(entry)}
                          className="rounded-xl border border-line px-3 py-2 text-xs font-black text-ink-soft hover:bg-surface-2"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => deactivateEntry(entry)}
                          className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-600 hover:bg-rose-50"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-3">
          <div className="text-xs font-bold text-ink-mute">
            {entries.length === 0
              ? "0개"
              : `${(startIndex + 1).toLocaleString()}-${Math.min(startIndex + pageSize, entries.length).toLocaleString()} / ${entries.length.toLocaleString()}개`}
          </div>

          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              className="h-8 rounded-xl border border-line px-3 text-xs font-black disabled:opacity-40"
            >
              처음
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
              className="h-8 rounded-xl border border-line px-3 text-xs font-black disabled:opacity-40"
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
                    ? "h-9 min-w-9 rounded-xl bg-rose-deep px-3 text-xs font-black text-white"
                    : "h-9 min-w-9 rounded-xl border border-line px-3 text-xs font-black text-ink-soft"
                }
              >
                {pageNumber}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount, safePage + 1))}
              disabled={safePage === pageCount}
              className="h-8 rounded-xl border border-line px-3 text-xs font-black disabled:opacity-40"
            >
              다음
            </button>
            <button
              type="button"
              onClick={() => setPage(pageCount)}
              disabled={safePage === pageCount}
              className="h-8 rounded-xl border border-line px-3 text-xs font-black disabled:opacity-40"
            >
              마지막
            </button>
          </div>
        </div>
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
