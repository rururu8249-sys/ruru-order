// components/notice/NoticeCard.tsx
// 목적: 공지사항 카드 UI
// 주의: UI 전용. 공지 조회/저장/관리자 로직 없음.

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
};

const formatNoticeDate = (value: string) => {
  if (!value) return "";

  return new Date(value).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
};

const getCategoryLabel = (value: string) => {
  const text = String(value || "").trim();
  if (!text) return "공지";
  return text;
};

export default function NoticeCard({ notice }: NoticeCardProps) {
  const dateText = formatNoticeDate(notice.created_at);
  const category = getCategoryLabel(notice.category);

  return (
    <article
      className={`rounded-[30px] bg-white p-5 shadow-[0_14px_35px_rgba(30,64,175,0.07)] ${
        notice.is_pinned
          ? "border-2 border-blue-500"
          : "border border-blue-100"
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {notice.is_pinned && (
          <div className="inline-flex rounded-full bg-blue-600 px-3 py-1 text-[12px] font-black text-white">
            중요공지
          </div>
        )}

        <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-[12px] font-black text-blue-700 ring-1 ring-blue-100">
          {category}
        </div>

        {dateText && (
          <div className="inline-flex rounded-full bg-slate-50 px-3 py-1 text-[12px] font-black text-slate-500 ring-1 ring-slate-100">
            {dateText}
          </div>
        )}
      </div>

      <h2 className="text-[22px] font-black leading-snug tracking-[-0.05em] text-[#151923]">
        {notice.title}
      </h2>

      <div className="mt-4 whitespace-pre-line break-keep text-[15px] font-semibold leading-[1.8] tracking-[-0.03em] text-slate-600">
        {notice.content}
      </div>
    </article>
  );
}
