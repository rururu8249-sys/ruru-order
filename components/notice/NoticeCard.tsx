"use client";

// components/notice/NoticeCard.tsx
// 목적: 공지사항 카드 UI
// 주의: UI 전용. 공지 조회/저장/관리자 로직 없음.
//
// [2026-09-20 사장님 «공지가 다 엉망인 느낌»] 두 가지를 뜯어고쳤다.
//   ① 공지 7개가 «한 장에 2개씩 4페이지»로 잘려 있었다 → 페이지 넘김을 없애고 목록 하나로.
//      대신 긴 법적 문구가 화면을 뒤덮지 않게 «제목 줄을 눌러 펼치는» 방식(접이식)으로 바꿨다.
//      중요공지는 처음부터 펼쳐져 있다. (쪽지함의 게시판형과 같은 사용 방식 → 손님이 두 곳에서 헷갈리지 않는다)
//   ② 이 페이지만 파란색이라 사이트(딥로즈)와 따로 놀았다 → 브랜드 색으로 통일.

import { useState } from "react";

type NoticeCardData = {
  id: number;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  created_at: string;
};

type NoticeCardProps = {
  notice: NoticeCardData;
  /** 중요공지는 처음부터 펼친 상태로 둔다 */
  defaultOpen?: boolean;
};

const formatNoticeDate = (value: string) => {
  if (!value) return "";
  return new Date(value).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
};

const getCategoryLabel = (value: string) => String(value || "").trim() || "공지";

// 목록에서 이미 배지로 «중요공지»를 보여주므로 제목 앞 📌 는 군더더기 — 표시할 때만 뗀다(저장값은 그대로).
const cleanTitle = (value: string) => String(value || "").replace(/^\s*📌\s*/, "").trim();

export default function NoticeCard({ notice, defaultOpen = false }: NoticeCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const dateText = formatNoticeDate(notice.created_at);
  const category = getCategoryLabel(notice.category);
  const title = cleanTitle(notice.title);

  return (
    <article
      className={`overflow-hidden rounded-2xl bg-white ${
        notice.is_pinned ? "border-2 border-[#7A1E47]" : "border border-[#E5E1DC]"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="mb-2 flex flex-wrap items-center gap-1.5">
            {notice.is_pinned && (
              <span className="inline-flex rounded-full bg-[#7A1E47] px-2.5 py-1 text-[11px] font-black text-white">중요</span>
            )}
            <span className="inline-flex rounded-full bg-[#F5E6EB] px-2.5 py-1 text-[11px] font-black text-[#7A1E47]">{category}</span>
            {dateText && (
              <span className="inline-flex rounded-full bg-[#F1ECEE] px-2.5 py-1 text-[11px] font-black text-[#7B736D]">{dateText}</span>
            )}
          </span>
          <span className="block break-keep text-[16px] font-black leading-snug text-[#151923]">{title}</span>
        </span>
        <span
          aria-hidden
          className={`mt-1 shrink-0 text-[13px] font-black text-[#7A1E47] transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="whitespace-pre-line break-keep border-t border-[#F0EAE0] px-4 py-4 text-[15px] font-semibold leading-[1.8] text-[#4A4340]">
          {notice.content}
        </div>
      )}
    </article>
  );
}
