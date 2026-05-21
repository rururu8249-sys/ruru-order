"use client";

// components/admin-v2/today/AdminTodayIssueTagSelector.tsx
// 목적: 고객 대화에서 오늘할일 등록 전 반품/교환/환불 등 이슈를 다중선택
// 주의: UI 입력 전용. 주문/입금/배송/정산 로직 없음.

import {
  ADMIN_ISSUE_TAGS,
  type AdminIssueTag,
  getIssueTagClass,
} from "@/components/admin-v2/today/adminIssueTags";

export default function AdminTodayIssueTagSelector({
  selectedTags,
  onChange,
}: {
  selectedTags: AdminIssueTag[];
  onChange: (nextTags: AdminIssueTag[]) => void;
}) {
  const toggleTag = (tag: AdminIssueTag) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter((item) => item !== tag));
      return;
    }

    onChange([...selectedTags, tag]);
  };

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black text-neutral-950">
            고객 이슈 태그 선택
          </div>
          <div className="mt-0.5 text-xs font-bold text-neutral-500">
            오늘할일에 등록할 때 반품/교환/환불 등을 같이 표시합니다.
          </div>
        </div>

        {selectedTags.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-black text-neutral-600 active:scale-[0.98]"
          >
            선택해제
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {ADMIN_ISSUE_TAGS.map((tag) => {
          const active = selectedTags.includes(tag);

          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`rounded-full border px-3 py-2 text-xs font-black active:scale-[0.98] ${
                active
                  ? getIssueTagClass(tag)
                  : "border-neutral-200 bg-neutral-50 text-neutral-500"
              }`}
            >
              {active ? "✓ " : ""}
              {tag}
            </button>
          );
        })}
      </div>

      <div className="mt-2 rounded-xl bg-neutral-50 p-2 text-xs font-bold text-neutral-500">
        선택값: {selectedTags.length > 0 ? selectedTags.join(", ") : "미선택"}
      </div>
    </section>
  );
}
