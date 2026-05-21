"use client";

// components/admin-v2/today/AdminTodayKakaoTimelineList.tsx
// 목적: 카톡 고객 문의만 간단히 보여주고, 필요한 문의만 오늘할일에 등록
// 주의: UI 전용. 주문/입금/배송/정산 로직 없음.

import type { KakaoTimelineItem } from "@/components/admin-v2/today/kakaoConversationTimeline";

export default function AdminTodayKakaoTimelineList({
  items,
  registeringItemId,
  onRegisterTask,
}: {
  items: KakaoTimelineItem[];
  registeringItemId?: string;
  onRegisterTask?: (item: KakaoTimelineItem) => Promise<void>;
}) {
  const customerItems = items.filter((item) => item.role === "customer");

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black text-neutral-950">
            고객 문의별 오늘할일 등록
          </div>
          <div className="mt-0.5 text-xs font-bold text-neutral-500">
            처리 필요한 문의만 골라서 오늘할일에 등록합니다.
          </div>
        </div>

        <div className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
          고객문의 {customerItems.length}개
        </div>
      </div>

      {customerItems.length === 0 ? (
        <div className="rounded-2xl bg-neutral-50 p-6 text-center text-sm font-black text-neutral-400">
          카톡 대화를 붙여넣으면 고객 문의만 여기에 표시됩니다.
        </div>
      ) : (
        <div className="grid max-h-[420px] gap-2 overflow-y-auto pr-1">
          {customerItems.map((item, index) => (
            <article
              key={item.id}
              className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-neutral-400">
                  {index + 1}
                </span>
                <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
                  고객 문의
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-neutral-600">
                  {item.dateLabel}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-neutral-600">
                  {item.senderLabel}
                </span>
                <span className="rounded-full bg-pink-50 px-2.5 py-1 text-xs font-black text-pink-700">
                  {item.analysis?.label || "일반문의"}
                </span>
              </div>

              <div className="whitespace-pre-wrap rounded-xl bg-white p-3 text-sm font-bold leading-relaxed text-neutral-800">
                {item.content}
              </div>

              {onRegisterTask ? (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onRegisterTask(item)}
                    disabled={registeringItemId === item.id}
                    className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white active:scale-[0.98] disabled:bg-neutral-300"
                  >
                    {registeringItemId === item.id ? "등록중" : "오늘할일 등록"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
