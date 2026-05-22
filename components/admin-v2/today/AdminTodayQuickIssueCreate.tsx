"use client";

// components/admin-v2/today/AdminTodayQuickIssueCreate.tsx
// 목적: 방송 중 고객을 검색/선택해서 admin_tasks에 빠르게 이슈 등록
// 주의: admin_tasks 신규 등록만 수행. 주문/입금/배송/정산 상태 변경 없음.

import { useMemo, useState } from "react";
import type { CustomerRow } from "@/lib/admin-v2/types";
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

function readField(row: CustomerRow | null, keys: string[]) {
  if (!row) return "";

  const source = row as unknown as Record<string, unknown>;

  for (const key of keys) {
    const value = source[key];

    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
}

function normalize(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function getCustomerNickname(row: CustomerRow | null) {
  return readField(row, [
    "youtube_nickname",
    "customer_nickname",
    "nickname",
    "nick_name",
    "name",
  ]);
}

function getCustomerName(row: CustomerRow | null) {
  return readField(row, ["customer_name", "real_name", "name"]);
}

function getCustomerPhone(row: CustomerRow | null) {
  return readField(row, ["phone", "phone_number", "customer_phone", "mobile"]);
}

function getCustomerAddress(row: CustomerRow | null) {
  return readField(row, ["address", "customer_address", "shipping_address"]);
}

export default function AdminTodayQuickIssueCreate({
  customers,
}: {
  customers: CustomerRow[];
}) {
  const [taskType, setTaskType] = useState<AdminTaskFilter>("general");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [draftSearchText, setDraftSearchText] = useState("");
  const [confirmedSearchText, setConfirmedSearchText] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [memoText, setMemoText] = useState("");
  const [saving, setSaving] = useState(false);

  const mainLabel = getAdminTaskTypeLabel(taskType);

  const matchedCustomers = useMemo(() => {
    const word = normalize(confirmedSearchText);
    if (!word) return [];

    return customers
      .filter((customer) => {
        const target = normalize(
          [
            getCustomerNickname(customer),
            getCustomerName(customer),
            getCustomerPhone(customer),
            getCustomerAddress(customer),
          ].join(" ")
        );

        return target.includes(word);
      })
      .slice(0, 8);
  }, [confirmedSearchText, customers]);

  const selectedCustomerLabel = useMemo(() => {
    if (!selectedCustomer) return "고객 미선택";

    const nickname = getCustomerNickname(selectedCustomer);
    const name = getCustomerName(selectedCustomer);
    const phone = getCustomerPhone(selectedCustomer);

    return [nickname, name, phone].filter(Boolean).join(" / ");
  }, [selectedCustomer]);

  const title = useMemo(() => {
    const customer =
      getCustomerNickname(selectedCustomer) ||
      getCustomerName(selectedCustomer) ||
      "고객 미지정";

    return `${mainLabel} · ${customer}`;
  }, [selectedCustomer, mainLabel]);

  const runSearch = () => {
    const word = draftSearchText.trim();
    setConfirmedSearchText(word);

    if (!word) {
      setSelectedCustomer(null);
    }
  };

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
    setDraftSearchText("");
    setConfirmedSearchText("");
    setSelectedCustomer(null);
    setMemoText("");
  };

  const submitIssue = async () => {
    const memo = memoText.trim();

    if (!selectedCustomer) {
      alert("먼저 고객을 검색해서 선택해주세요.");
      return;
    }

    if (!memo && selectedTags.length === 0) {
      alert("이슈 태그 또는 메모를 입력해주세요.");
      return;
    }

    const nickname = getCustomerNickname(selectedCustomer);
    const customerName = getCustomerName(selectedCustomer);
    const phone = getCustomerPhone(selectedCustomer);

    const body = [
      selectedTags.length > 0 ? `[이슈태그] ${selectedTags.join(", ")}` : "",
      `[고객] ${nickname || "-"} / ${customerName || "-"} / ${phone || "-"}`,
      memo ? `[메모]\n${memo}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    setSaving(true);

    const response = await fetch("/api/admin-v2/admin-tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task_type: taskType,
        title,
        body,
        customer_name: customerName || null,
        customer_nickname: nickname || null,
        related_product: null,
        source: "manual",
        priority:
          taskType === "refund" || taskType === "complaint" || taskType === "return"
            ? "high"
            : "normal",
      }),
    });

    const result = await response.json().catch(() => null);

    setSaving(false);

    if (!response.ok || !result?.ok) {
      alert("고객 이슈 등록 실패\n\n" + (result?.message || "알 수 없는 오류"));
      return;
    }

    window.dispatchEvent(new Event("ruru-admin-task-created"));
    resetForm();
    alert("고객 이슈를 등록했습니다. 해결 전까지 고객 이슈 큐에 표시됩니다.");
  };

  return (
    <section className="grid gap-3">
      <div>
        <div className="mb-1 text-[12px] font-black text-neutral-500">
          고객 검색
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            value={draftSearchText}
            onChange={(event) => setDraftSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") runSearch();
            }}
            placeholder="닉네임 / 이름 / 전화번호 검색"
            className="h-11 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
          />
          <button
            type="button"
            onClick={runSearch}
            className="h-11 rounded-2xl bg-neutral-950 px-4 text-xs font-black text-white active:scale-[0.98]"
          >
            검색
          </button>
        </div>

        {confirmedSearchText ? (
          <div className="mt-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-2">
            <div className="mb-1 px-1 text-[11px] font-black text-neutral-500">
              검색결과 {matchedCustomers.length.toLocaleString()}명
            </div>

            {matchedCustomers.length === 0 ? (
              <div className="rounded-xl bg-white px-3 py-3 text-xs font-bold text-neutral-400">
                비슷한 고객을 찾지 못했습니다.
              </div>
            ) : (
              <div className="grid max-h-44 gap-1.5 overflow-y-auto pr-1">
                {matchedCustomers.map((customer, index) => {
                  const selected = selectedCustomer === customer;
                  const nickname = getCustomerNickname(customer);
                  const name = getCustomerName(customer);
                  const phone = getCustomerPhone(customer);

                  return (
                    <button
                      key={`${phone}-${nickname}-${name}-${index}`}
                      type="button"
                      onClick={() => setSelectedCustomer(customer)}
                      className={[
                        "rounded-xl border px-3 py-2 text-left active:scale-[0.99]",
                        selected
                          ? "border-blue-400 bg-blue-50"
                          : "border-neutral-200 bg-white",
                      ].join(" ")}
                    >
                      <div className="text-sm font-black text-neutral-950">
                        {nickname || name || "이름 없음"}
                      </div>
                      <div className="mt-0.5 text-[11px] font-bold text-neutral-500">
                        {[name, phone].filter(Boolean).join(" / ") || "추가 정보 없음"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-2 rounded-2xl bg-neutral-950 px-3 py-2 text-xs font-black text-white">
          선택 고객: {selectedCustomerLabel}
        </div>
      </div>

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
    </section>
  );
}
