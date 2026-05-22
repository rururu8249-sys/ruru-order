"use client";

// components/admin-v2/today/AdminTodayQuickIssueCreate.tsx
// 목적: 방송 중 고객 이슈를 카톡 분석 없이 즉시 admin_tasks에 등록
// 주의: admin_tasks 신규 등록만 수행. 주문/입금/배송/정산 상태 변경 없음.

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ADMIN_TASK_FILTERS,
  getAdminTaskToneClass,
  getAdminTaskTypeLabel,
  type AdminTaskFilter,
} from "@/components/admin-v2/today/adminTaskMeta";
import { getIssueTagClass } from "@/components/admin-v2/today/adminIssueTags";

const ISSUE_TAGS = [
  "불량/주의",
  "교환",
  "환불/취소",
  "반품",
  "배송",
  "주소확인",
  "입금",
  "상품/추가구매",
  "기타",
];

const taskTypeOptions = ADMIN_TASK_FILTERS.filter((item) => item.value !== "all");

const typeByTag: Record<string, AdminTaskFilter> = {
  "불량/주의": "complaint",
  교환: "exchange",
  "환불/취소": "refund",
  반품: "return",
  배송: "shipping",
  주소확인: "address",
  입금: "payment",
  "상품/추가구매": "product",
  기타: "general",
};

export default function AdminTodayQuickIssueCreate() {
  const [taskType, setTaskType] = useState<AdminTaskFilter>("general");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerNickname, setCustomerNickname] = useState("");
  const [relatedProduct, setRelatedProduct] = useState("");
  const [memoText, setMemoText] = useState("");
  const [saving, setSaving] = useState(false);

  const mainLabel = getAdminTaskTypeLabel(taskType);

  const title = useMemo(() => {
    const customer = customerNickname.trim() || customerName.trim() || "고객 미지정";
    return `${mainLabel} · ${customer}`;
  }, [customerName, customerNickname, mainLabel]);

  const toggleTag = (tag: string) => {
    setSelectedTags((current) => {
      if (current.includes(tag)) {
        return current.filter((item) => item !== tag);
      }

      const next = [...current, tag];

      if (current.length === 0) {
        setTaskType(typeByTag[tag] || "general");
      }

      return next;
    });
  };

  const resetForm = () => {
    setTaskType("general");
    setSelectedTags([]);
    setCustomerName("");
    setCustomerNickname("");
    setRelatedProduct("");
    setMemoText("");
  };

  const submitIssue = async () => {
    const memo = memoText.trim();
    const hasCustomer = customerName.trim() || customerNickname.trim();

    if (!memo && selectedTags.length === 0) {
      alert("이슈 태그 또는 메모를 입력해주세요.");
      return;
    }

    const body = [
      selectedTags.length > 0 ? `[이슈태그] ${selectedTags.join(", ")}` : "",
      hasCustomer
        ? `[고객] ${customerNickname.trim() || "-"} / ${customerName.trim() || "-"}`
        : "",
      relatedProduct.trim() ? `[상품] ${relatedProduct.trim()}` : "",
      memo ? `[메모]\n${memo}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    setSaving(true);

    const { error } = await supabase.from("admin_tasks").insert({
      task_type: taskType,
      title,
      body,
      customer_name: customerName.trim() || null,
      customer_nickname: customerNickname.trim() || null,
      related_product: relatedProduct.trim() || null,
      source: "manual",
      status: "open",
      priority:
        taskType === "refund" || taskType === "complaint" || taskType === "return"
          ? "high"
          : "normal",
    });

    setSaving(false);

    if (error) {
      alert("고객 이슈 등록 실패\n\n" + error.message);
      return;
    }

    window.dispatchEvent(new Event("ruru-admin-task-created"));
    resetForm();
    alert("고객 이슈를 등록했습니다. 해결 전까지 고객 이슈 큐에 표시됩니다.");
  };

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-black tracking-[-0.04em] text-neutral-950">
            빠른 이슈 등록
          </h2>
          <p className="mt-1 text-xs font-bold text-neutral-500">
            카톡 분석 없이도 고객 이슈를 바로 등록합니다.
          </p>
        </div>

        <span className="rounded-full bg-neutral-950 px-3 py-1.5 text-[11px] font-black text-white">
          해결 전까지 표시
        </span>
      </div>

      <div className="grid gap-3">
        <div>
          <div className="mb-1 text-[12px] font-black text-neutral-500">
            이슈 태그 다중선택
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ISSUE_TAGS.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={[
                    "rounded-full border px-2.5 py-1.5 text-[11px] font-black active:scale-[0.98]",
                    active
                      ? getIssueTagClass(tag)
                      : "border-neutral-200 bg-white text-neutral-500",
                  ].join(" ")}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-1">
          <input
            value={customerNickname}
            onChange={(event) => setCustomerNickname(event.target.value)}
            placeholder="닉네임"
            className="h-10 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
          />
          <input
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="고객명"
            className="h-10 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
          />
        </div>

        <input
          value={relatedProduct}
          onChange={(event) => setRelatedProduct(event.target.value)}
          placeholder="상품/주문 힌트"
          className="h-10 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
        />

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[12px] font-black text-neutral-500">
              처리 메모
            </span>
            <select
              value={taskType}
              onChange={(event) => setTaskType(event.target.value as AdminTaskFilter)}
              className={`h-8 rounded-full border px-3 text-[11px] font-black outline-none ${getAdminTaskToneClass(taskType)}`}
            >
              {taskTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <textarea
            value={memoText}
            onChange={(event) => setMemoText(event.target.value)}
            placeholder="예: 교환 요청 / 환불 확인 필요 / 주소 다시 받아야 함 / 배송 누락 확인"
            className="h-24 w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={resetForm}
            className="h-10 rounded-xl border border-neutral-200 bg-white text-xs font-black text-neutral-600 active:scale-[0.98]"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={submitIssue}
            disabled={saving}
            className="h-10 rounded-xl bg-neutral-950 text-xs font-black text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {saving ? "등록중" : "고객 이슈 등록"}
          </button>
        </div>
      </div>
    </section>
  );
}
