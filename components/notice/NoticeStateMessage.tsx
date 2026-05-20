// components/notice/NoticeStateMessage.tsx
// 목적: 공지사항 로딩/빈 상태 UI
// 주의: UI 전용. Supabase, DB 로직 없음.

type NoticeStateMessageProps = {
  message: string;
};

export default function NoticeStateMessage({ message }: NoticeStateMessageProps) {
  return (
    <div className="rounded-[28px] border border-blue-100 bg-white p-7 text-center text-[15px] font-black text-slate-500 shadow-[0_14px_35px_rgba(30,64,175,0.06)]">
      {message}
    </div>
  );
}
