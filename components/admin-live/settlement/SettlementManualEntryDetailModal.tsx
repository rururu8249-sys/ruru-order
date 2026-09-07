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
  return value === "income" ? "추가 정산 수익" : "창고/기타 지출";
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

  const type = value.entry_type === "income" ? "추가 정산 수익" : value.entry_type === "expense" ? "창고/기타 지출" : "-";
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
      <div className="flex max-h-[calc(100dvh-32px)] w-full max-w-[720px] flex-col overflow-hidden rounded-[30px] bg-surface shadow-[0_30px_100px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-6 py-5">
          <div>
            <div className="text-xs font-black tracking-[0.22em] text-violet-600">SETTLEMENT ENTRY DETAIL</div>
            <h3 className="mt-1 text-2xl font-black tracking-[-0.04em] text-ink">추가 정산 내역 상세</h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-line bg-surface px-5 py-3 text-sm font-black text-ink shadow-sm hover:bg-surface-2"
          >
            닫기
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-line bg-surface-2 p-4">
              <div className="text-xs font-black text-ink-mute">구분</div>
              <div className="mt-2 text-lg font-black text-ink">{entryTypeLabel(entry.entry_type)}</div>
            </div>

            <div className="rounded-2xl border border-line bg-surface-2 p-4">
              <div className="text-xs font-black text-ink-mute">금액</div>
              <div className="mt-2 text-lg font-black tabular-nums text-ink">
                {entry.entry_type === "expense" ? "-" : ""}
                {won(entry.amount)}
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-surface-2 p-4">
              <div className="text-xs font-black text-ink-mute">날짜</div>
              <div className="mt-2 text-lg font-black text-ink">{manualEntryDateKey(entry) || "-"}</div>
            </div>

            <div className="rounded-2xl border border-line bg-surface-2 p-4">
              <div className="text-xs font-black text-ink-mute">제목</div>
              <div className="mt-2 text-lg font-black text-ink">{entry.title || "-"}</div>
            </div>

            <div className="rounded-2xl border border-line bg-surface-2 p-4 md:col-span-2">
              <div className="text-xs font-black text-ink-mute">연결 방송</div>
              <div className="mt-2 text-base font-black text-ink">{entry.broadcast_label || manualEntryLabel(entry)}</div>
            </div>

            <div className="rounded-2xl border border-line bg-surface-2 p-4 md:col-span-2">
              <div className="text-xs font-black text-ink-mute">메모</div>
              <div className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-ink">{entry.memo || "-"}</div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-line">
            <div className="flex items-center justify-between border-b border-line-soft bg-surface-2 px-4 py-3">
              <div className="text-sm font-black text-ink">수정이력</div>
              <div className="rounded-full bg-surface px-3 py-1 text-xs font-black text-ink-soft">총 {logs.length.toLocaleString()}건</div>
            </div>

            <div className="divide-y divide-line-soft">
              {loadingLogs ? (
                <div className="px-4 py-8 text-center text-sm font-bold text-ink-mute">이력을 불러오는 중...</div>
              ) : logs.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm font-bold text-ink-mute">
                  아직 기록된 수정이력이 없습니다.
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id || `${log.created_at}-${log.action}`} className="grid gap-2 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-info-bg px-3 py-1 text-xs font-black text-info-tx">
                        {actionLabel(log.action)}
                      </span>
                      <span className="text-xs font-bold text-ink-mute">{formatDateTime(log.created_at)}</span>
                    </div>

                    <div className="grid gap-1 text-xs font-bold leading-5 text-ink-soft">
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

        <div className="flex justify-end gap-2 border-t border-line-soft bg-surface-2 px-6 py-4">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-2xl border border-line bg-surface px-5 py-3 text-sm font-black text-ink shadow-sm hover:bg-surface-2"
          >
            수정
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-2xl border border-rose-200 bg-surface px-5 py-3 text-sm font-black text-rose-600 shadow-sm hover:bg-rose-50"
          >
            삭제
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-rose-deep px-6 py-3 text-sm font-black text-white shadow-sm hover:bg-rose-deep"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
