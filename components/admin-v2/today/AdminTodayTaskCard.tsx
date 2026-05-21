"use client";

// components/admin-v2/today/AdminTodayTaskCard.tsx
// 목적: 오늘할일 지속 업무 1건 카드 표시
// 주의: UI 전용. 주문/입금/배송/정산 로직 없음.

import type { AdminTaskRow } from "@/lib/admin-v2/types";
import { formatDateLabel } from "@/lib/admin-v2/formatters";
import {
  getAdminTaskToneClass,
  getAdminTaskTypeLabel,
} from "@/components/admin-v2/today/adminTaskMeta";

const makePreview = (body: string | null) => {
  const clean = String(body || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ");

  if (!clean) return "상세 내용 없음";
  if (clean.length <= 120) return clean;

  return `${clean.slice(0, 120)}...`;
};

export default function AdminTodayTaskCard({
  task,
  onOpenDetail,
  onResolve,
}: {
  task: AdminTaskRow;
  onOpenDetail: (task: AdminTaskRow) => void;
  onResolve: (task: AdminTaskRow, note?: string) => void | Promise<void>;
}) {
  const taskType = task.task_type || "general";
  const preview = makePreview(task.body);

  return (
    <article className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-black ${getAdminTaskToneClass(
            taskType
          )}`}
        >
          {getAdminTaskTypeLabel(taskType)}
        </span>

        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-neutral-600">
          {task.source || "manual"}
        </span>

        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-neutral-500">
          {task.created_at ? formatDateLabel(task.created_at) : "시간 없음"}
        </span>
      </div>

      <div className="text-sm font-black text-neutral-950">{task.title}</div>

      <div className="mt-1 text-xs font-bold text-neutral-500">
        {task.customer_nickname || task.customer_name || "고객 미연결"}
        {task.related_product ? ` · ${task.related_product}` : ""}
      </div>

      <div className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-bold leading-relaxed text-neutral-600">
        {preview}
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpenDetail(task)}
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-black text-neutral-700 active:scale-[0.98]"
        >
          상세보기
        </button>

        <button
          type="button"
          onClick={() => onResolve(task)}
          className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
        >
          처리완료
        </button>
      </div>
    </article>
  );
}
