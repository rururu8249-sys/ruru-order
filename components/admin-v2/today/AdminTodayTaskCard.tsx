"use client";

// components/admin-v2/today/AdminTodayTaskCard.tsx
// 목적: 고객 이슈 큐 1건을 오른쪽 패널에서 빠르게 판단하도록 표시
// 주의: UI 전용. 주문/입금/배송/정산 로직 없음.

import type { AdminTaskRow } from "@/lib/admin-v2/types";
import { formatDateLabel } from "@/lib/admin-v2/formatters";
import {
  getAdminTaskToneClass,
  getAdminTaskTypeLabel,
} from "@/components/admin-v2/today/adminTaskMeta";
import {
  extractIssueTagsFromTaskBody,
  getIssueTagClass,
} from "@/components/admin-v2/today/adminIssueTags";

const makePreview = (body: string | null) => {
  const clean = String(body || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("[이슈태그]"))
    .slice(0, 2)
    .join(" / ");

  if (!clean) return "메모 없음";
  if (clean.length <= 78) return clean;

  return `${clean.slice(0, 78)}...`;
};

export default function AdminTodayTaskCard({
  task,
  canResolve,
  onOpenDetail,
  onResolve,
}: {
  task: AdminTaskRow;
  canResolve: boolean;
  onOpenDetail: (task: AdminTaskRow) => void;
  onResolve: (task: AdminTaskRow, note?: string) => void | Promise<void>;
}) {
  const taskType = task.task_type || "general";
  const preview = makePreview(task.body);
  const issueTags = extractIssueTagsFromTaskBody(task.body);
  const customerLabel =
    task.customer_nickname || task.customer_name || "고객 미연결";
  const timeLabel = task.created_at ? formatDateLabel(task.created_at) : "등록시간 없음";

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${getAdminTaskToneClass(
                taskType
              )}`}
            >
              {getAdminTaskTypeLabel(taskType)}
            </span>

            {canResolve ? (
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-black text-orange-700">
                처리중
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                해결완료
              </span>
            )}
          </div>

          <div className="mt-2 truncate text-sm font-black text-neutral-950">
            {customerLabel}

          </div>

          <div className="mt-1 truncate text-[12px] font-bold text-neutral-500">
            {task.title}
          </div>

          {issueTags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {issueTags.slice(0, 4).map((tag) => (
                <span
                  key={`${task.id}-${tag}`}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${getIssueTagClass(tag)}`}
                >
                  {tag}
                </span>
              ))}
              {issueTags.length > 4 ? (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-black text-neutral-500">
                  +{issueTags.length - 4}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-2 rounded-xl bg-neutral-50 px-3 py-2 text-[12px] font-bold leading-relaxed text-neutral-600">
            {preview}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-neutral-400">
            <span>등록 {timeLabel}</span>
            {task.related_product ? <span>상품 {task.related_product}</span> : null}
            {!canResolve && task.resolved_at ? (
              <span className="text-emerald-700">
                완료 {formatDateLabel(task.resolved_at)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => onOpenDetail(task)}
            className="h-8 rounded-lg border border-neutral-200 bg-white px-2.5 text-[11px] font-black text-neutral-700 active:scale-[0.98]"
          >
            상세
          </button>

          {canResolve ? (
            <button
              type="button"
              onClick={() => onResolve(task)}
              className="h-8 rounded-lg bg-neutral-950 px-2.5 text-[11px] font-black text-white active:scale-[0.98]"
            >
              해결
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
