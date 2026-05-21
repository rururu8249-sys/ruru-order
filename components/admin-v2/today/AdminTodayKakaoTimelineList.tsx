"use client";

// components/admin-v2/today/AdminTodayKakaoTimelineList.tsx
// 목적: 카톡 대화를 시간순으로 고객문의/관리자답변/자동응답 제외로 보여줌

import type { KakaoTimelineItem } from "@/components/admin-v2/today/kakaoConversationTimeline";

const roleStyle = {
  customer: "bg-blue-50 text-blue-700 border-blue-100",
  admin: "bg-emerald-50 text-emerald-700 border-emerald-100",
  auto: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

const roleLabel = {
  customer: "고객 문의",
  admin: "관리자 답변",
  auto: "자동응답 제외",
};

export default function AdminTodayKakaoTimelineList({
  items,
}: {
  items: KakaoTimelineItem[];
}) {
  const copyReply = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("추천답변을 복사했습니다.");
    } catch {
      alert("복사에 실패했습니다. 직접 드래그해서 복사해주세요.");
    }
  };

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black text-neutral-950">순차 대화 분석</div>
          <div className="mt-0.5 text-xs font-bold text-neutral-500">
            날짜/시간 흐름대로 고객 문의와 관리자 답변을 분리해서 봅니다.
          </div>
        </div>

        <div className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
          총 {items.length}개 묶음
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-neutral-50 p-6 text-center text-sm font-black text-neutral-400">
          원본 대화를 붙여넣으면 순서대로 분석됩니다.
        </div>
      ) : (
        <div className="grid max-h-[520px] gap-2 overflow-y-auto pr-1">
          {items.map((item, index) => (
            <article
              key={item.id}
              className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-neutral-400">
                  {index + 1}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${roleStyle[item.role]}`}>
                  {roleLabel[item.role]}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-neutral-600">
                  {item.dateLabel}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-neutral-600">
                  {item.senderLabel}
                </span>
              </div>

              {item.role === "customer" ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-pink-50 px-2.5 py-1 text-xs font-black text-pink-700">
                    {item.analysis?.label || "일반문의"}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-neutral-600">
                    {item.analysis?.riskLabel || "보통"}
                  </span>
                </div>
              ) : null}

              <div className="whitespace-pre-wrap rounded-xl bg-white p-3 text-sm font-bold leading-relaxed text-neutral-800">
                {item.content}
              </div>

              {item.role === "customer" && item.analysis?.recommendedReply ? (
                <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                  <div className="mb-1 text-xs font-black text-blue-700">
                    추천답변
                  </div>
                  <div className="whitespace-pre-wrap text-sm font-bold leading-relaxed text-neutral-800">
                    {item.analysis.recommendedReply}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyReply(item.analysis?.recommendedReply || "")}
                    className="mt-2 rounded-lg bg-neutral-950 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
                  >
                    이 답변 복사
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
