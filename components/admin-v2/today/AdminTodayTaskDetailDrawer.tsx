"use client";

import { showAdminConfirm } from "@/lib/adminConfirm";
// components/admin-v2/today/AdminTodayTaskDetailDrawer.tsx
// 목적: 해결 전까지 뜨는 업무 상세 확인 + 완료메모 입력 / 완료 이력 확인
// 주의: admin_tasks 완료 처리만 상위에서 실행. 주문/입금/배송/정산 로직 없음.

import { useEffect, useMemo, useState } from "react";
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

export default function AdminTodayTaskDetailDrawer({
  task,
  canResolve,
  onClose,
  onResolve,
}: {
  task: AdminTaskRow | null;
  canResolve: boolean;
  onClose: () => void;
  onResolve: (task: AdminTaskRow, note: string) => Promise<void> | void;
}) {
  const [resolveNote, setResolveNote] = useState("");

  useEffect(() => {
    setResolveNote("");
  }, [task?.id]);

  const bodySections = useMemo(() => {
    const body = String(task?.body || "").trim();
    if (!body) return [];

    return body
      .split(/\n{2,}/)
      .map((section) => section.trim())
      .filter(Boolean);
  }, [task?.body]);

  if (!task) return null;

  const taskType = task.task_type || "general";
  const issueTags = extractIssueTagsFromTaskBody(task.body);

  const handleResolve = async () => {
    const ok = await showAdminConfirm(`이 업무를 완료 처리할까요?\n\n${task.title}`);

    if (!ok) return;

    await onResolve(task, resolveNote);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25">
      <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <div className="border-b border-neutral-200 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-black ${getAdminTaskToneClass(
                taskType
              )}`}
            >
              {getAdminTaskTypeLabel(taskType)}
            </span>

            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
              {task.source || "manual"}
            </span>

            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
              등록 {task.created_at ? formatDateLabel(task.created_at) : "시간 없음"}
            </span>

            {!canResolve ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                완료됨
              </span>
            ) : null}
          </div>

          <h2 className="mt-3 text-xl font-black tracking-[-0.04em] text-neutral-950">
            {task.title}
          </h2>

          <div className="mt-2 text-sm font-bold text-neutral-500">
            {task.customer_nickname || task.customer_name || "고객 미연결"}
            {task.related_product ? ` · ${task.related_product}` : ""}
          </div>

          {issueTags.length > 0 ? (
            <div className="mt-3">
              <div className="mb-1 text-xs font-black text-neutral-500">
                선택된 이슈
              </div>
              <div className="flex flex-wrap gap-1.5">
                {issueTags.map((tag) => (
                  <span
                    key={`${task.id}-detail-${tag}`}
                    className={`rounded-full border px-2.5 py-1 text-xs font-black ${getIssueTagClass(tag)}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-5">
          <div className="grid gap-3">
            <section className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="mb-2 text-sm font-black text-neutral-950">
                업무 정보
              </div>

              <div className="grid gap-2 text-sm font-bold text-neutral-700 md:grid-cols-2">
                <div>상태: {task.status || "open"}</div>
                <div>우선순위: {task.priority || "normal"}</div>
                <div>고객명: {task.customer_name || "-"}</div>
                <div>닉네임: {task.customer_nickname || "-"}</div>
                <div>관련상품: {task.related_product || "-"}</div>
                <div>등록시각: {task.created_at ? formatDateLabel(task.created_at) : "-"}</div>
                <div>완료시각: {task.resolved_at ? formatDateLabel(task.resolved_at) : "-"}</div>
                <div>완료메모: {task.resolved_note || "-"}</div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="mb-2 text-sm font-black text-neutral-950">
                상세 내용
              </div>

              {bodySections.length === 0 ? (
                <div className="rounded-xl bg-neutral-50 p-4 text-sm font-bold text-neutral-400">
                  상세 내용이 없습니다.
                </div>
              ) : (
                <div className="grid gap-2">
                  {bodySections.map((section, index) => (
                    <div
                      key={`${task.id}-section-${index}`}
                      className="whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 text-sm font-bold leading-relaxed text-neutral-800"
                    >
                      {section}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {canResolve ? (
              <section className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="mb-2 text-sm font-black text-neutral-950">
                  완료 메모
                </div>

                <textarea
                  value={resolveNote}
                  onChange={(event) => setResolveNote(event.target.value)}
                  placeholder="예: 카톡 답변 완료 / 재고 없음 안내 완료 / 고객 확인 완료"
                  className="h-24 w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
                />

                <p className="mt-2 text-xs font-bold text-neutral-400">
                  입력하지 않아도 완료 처리는 가능합니다.
                </p>
              </section>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-200 bg-white p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-black text-neutral-700 active:scale-[0.98]"
          >
            닫기
          </button>

          {canResolve ? (
            <button
              type="button"
              onClick={handleResolve}
              className="rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white active:scale-[0.98]"
            >
              처리완료
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
