"use client";

import type { SettlementManualEntry } from "./settlementTypes";
import { manualEntryDateKey, manualEntryLabel, won } from "./settlementUtils";

export type SettlementManualEntryLog = {
  id?: string;
  entry_id?: string | null;
  action: "create" | "update" | "delete";
  before_value?: any;
  after_value?: any;
  memo?: string | null;
  created_at?: string | null;
};

function entryTypeLabel(value: SettlementManualEntry["entry_type"]) {
  return value === "income" ? "기타매출" : "창고정산/기타지출";
}

function actionLabel(value: SettlementManualEntryLog["action"]) {
  if (value === "create") return "입력";
  if (value === "update") return "수정";
  if (value === "delete") return "삭제";
  return value;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return String(value);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}.${month}.${day} ${hour}:${minute}`;
}

function getValueSummary(value: any) {
  if (!value || typeof value !== "object") return "-";

  const type = value.entry_type === "income" ? "기타매출" : value.entry_type === "expense" ? "창고정산/기타지출" : "-";
  const amount = Number(value.amount || 0);

  return `${type} / ${value.title || "-"} / ${won(amount)}`;
}

export default function SettlementManualEntryDetailModal({
  entry,
  logs,
  loadingLogs,
  onClose,
  onEdit,
  onDelete,
}: {
  entry: SettlementManualEntry;
  logs: SettlementManualEntryLog[];
  loadingLogs: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-[2px]">
      <div className="flex max-h-[calc(100dvh-32px)] w-full max-w-[720px] flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_30px_100px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div>
            <div className="text-xs font-black tracking-[0.22em] text-violet-600">SETTLEMENT ENTRY DETAIL</div>
            <h3 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">추가 정산 상세</h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            닫기
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black text-slate-400">구분</div>
              <div className="mt-2 text-lg font-black text-slate-950">{entryTypeLabel(entry.entry_type)}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black text-slate-400">금액</div>
              <div className="mt-2 text-lg font-black tabular-nums text-slate-950">
                {entry.entry_type === "expense" ? "-" : ""}
                {won(entry.amount)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black text-slate-400">날짜</div>
              <div className="mt-2 text-lg font-black text-slate-950">{manualEntryDateKey(entry) || "-"}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black text-slate-400">제목</div>
              <div className="mt-2 text-lg font-black text-slate-950">{entry.title || "-"}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
              <div className="text-xs font-black text-slate-400">연결 방송</div>
              <div className="mt-2 text-base font-black text-slate-950">{entry.broadcast_label || manualEntryLabel(entry)}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
              <div className="text-xs font-black text-slate-400">메모</div>
              <div className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-700">{entry.memo || "-"}</div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div className="text-sm font-black text-slate-900">수정이력</div>
              <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">총 {logs.length.toLocaleString()}건</div>
            </div>

            <div className="divide-y divide-slate-100">
              {loadingLogs ? (
                <div className="px-4 py-8 text-center text-sm font-bold text-slate-400">이력을 불러오는 중...</div>
              ) : logs.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm font-bold text-slate-400">
                  아직 기록된 수정이력이 없습니다.
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id || `${log.created_at}-${log.action}`} className="grid gap-2 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                        {actionLabel(log.action)}
                      </span>
                      <span className="text-xs font-bold text-slate-400">{formatDateTime(log.created_at)}</span>
                    </div>

                    <div className="grid gap-1 text-xs font-bold leading-5 text-slate-500">
                      <div>변경 전: {getValueSummary(log.before_value)}</div>
                      <div>변경 후: {getValueSummary(log.after_value)}</div>
                      {log.memo ? <div>메모: {log.memo}</div> : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            수정
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-2xl border border-rose-200 bg-white px-5 py-3 text-sm font-black text-rose-600 shadow-sm hover:bg-rose-50"
          >
            삭제
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
