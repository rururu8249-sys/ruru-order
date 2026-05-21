"use client";

// components/admin-v2/today/AdminTodayPersistentTasks.tsx
// 목적: 카톡/고객/운영 이슈를 해결 전까지 오늘할일에 계속 표시
// 주의: 주문/입금/배송/정산 상태 변경 없음. admin_tasks만 조회/완료 처리.

import { useCallback, useEffect, useState } from "react";
import type { AdminTaskRow } from "@/lib/admin-v2/types";
import { supabase } from "@/lib/supabase";
import { formatDateLabel } from "@/lib/admin-v2/formatters";

const typeLabel: Record<string, string> = {
  product: "상품/추가구매",
  payment: "입금/결제",
  shipping: "배송/송장",
  address: "주소확인",
  exchange: "교환",
  refund: "환불/취소",
  return: "반품",
  complaint: "불만/주의",
  general: "일반",
};

const toneClass: Record<string, string> = {
  product: "bg-pink-50 text-pink-700 border-pink-100",
  payment: "bg-emerald-50 text-emerald-700 border-emerald-100",
  shipping: "bg-blue-50 text-blue-700 border-blue-100",
  address: "bg-violet-50 text-violet-700 border-violet-100",
  exchange: "bg-orange-50 text-orange-700 border-orange-100",
  refund: "bg-red-50 text-red-700 border-red-100",
  return: "bg-rose-50 text-rose-700 border-rose-100",
  complaint: "bg-red-50 text-red-700 border-red-100",
  general: "bg-neutral-100 text-neutral-700 border-neutral-200",
};

export default function AdminTodayPersistentTasks() {
  const [tasks, setTasks] = useState<AdminTaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setErrorText("");

    const { data, error } = await supabase
      .from("admin_tasks")
      .select("*")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(80);

    setLoading(false);

    if (error) {
      setErrorText(error.message);
      return;
    }

    setTasks((data || []) as AdminTaskRow[]);
  }, []);

  useEffect(() => {
    loadTasks();

    const refresh = () => {
      loadTasks();
    };

    window.addEventListener("ruru-admin-task-created", refresh);
    return () => window.removeEventListener("ruru-admin-task-created", refresh);
  }, [loadTasks]);

  const resolveTask = async (task: AdminTaskRow) => {
    const ok = window.confirm(
      `오늘할일을 완료 처리할까요?\n\n${task.title}`
    );

    if (!ok) return;

    const { error } = await supabase
      .from("admin_tasks")
      .update({
        status: "done",
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        resolved_note: "관리자 완료 처리",
      })
      .eq("id", task.id);

    if (error) {
      alert("완료 처리 실패\n\n" + error.message);
      return;
    }

    await loadTasks();
  };

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black tracking-[-0.04em] text-neutral-950">
            해결 전까지 뜨는 업무
          </h2>
          <p className="mt-1 text-xs font-bold text-neutral-500">
            직접 등록한 카톡문의·고객이슈만 완료 전까지 계속 표시합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={loadTasks}
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-black text-neutral-700 active:scale-[0.98]"
        >
          새로고침
        </button>
      </div>

      {errorText ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700">
          admin_tasks 조회 실패: {errorText}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl bg-neutral-50 p-6 text-center text-sm font-black text-neutral-400">
          업무 불러오는 중...
        </div>
      ) : null}

      {!loading && !errorText && tasks.length === 0 ? (
        <div className="rounded-2xl bg-neutral-50 p-6 text-center text-sm font-black text-neutral-400">
          해결 대기 업무가 없습니다.
        </div>
      ) : null}

      {!loading && tasks.length > 0 ? (
        <div className="grid max-h-[430px] gap-2 overflow-y-auto pr-1">
          {tasks.map((task) => {
            const taskType = task.task_type || "general";

            return (
              <article
                key={task.id}
                className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-black ${
                      toneClass[taskType] || toneClass.general
                    }`}
                  >
                    {typeLabel[taskType] || taskType}
                  </span>

                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-neutral-600">
                    {task.source || "manual"}
                  </span>

                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-neutral-500">
                    {task.created_at ? formatDateLabel(task.created_at) : "시간 없음"}
                  </span>
                </div>

                <div className="text-sm font-black text-neutral-950">
                  {task.title}
                </div>

                <div className="mt-1 text-xs font-bold text-neutral-500">
                  {task.customer_nickname || task.customer_name || "고객 미연결"}
                  {task.related_product ? ` · ${task.related_product}` : ""}
                </div>

                {task.body ? (
                  <div className="mt-2 max-h-[120px] overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-xs font-bold leading-relaxed text-neutral-700">
                    {task.body}
                  </div>
                ) : null}

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => resolveTask(task)}
                    className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
                  >
                    처리완료
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
