// components/notice/NoticePageHero.tsx
// 목적: 공지사항 페이지 상단 안내 UI
// 주의: UI 전용. Supabase, DB, 관리자 공지 로직 없음.

export default function NoticePageHero() {
  return (
    <header className="mb-5 rounded-[34px] bg-white px-5 py-6 shadow-[0_18px_40px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="inline-flex rounded-full bg-blue-50 px-3 py-1.5 text-[12px] font-black tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100">
        📢 필독 공지
      </div>

      <h1 className="mt-3 text-[36px] font-black leading-tight tracking-[-0.08em] text-[#151923]">
        공지사항
      </h1>

      <p className="mt-2 break-keep text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
        주문 전 꼭 확인해야 하는 배송·입금·교환/환불 안내입니다.
      </p>

      <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-blue-800 ring-1 ring-blue-100">
        중요공지는 상단에 먼저 표시됩니다.
      </div>
    </header>
  );
}
