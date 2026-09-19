// components/notice/NoticePageHero.tsx
// 목적: 공지사항 페이지 상단 안내 UI
// 주의: UI 전용. Supabase, DB, 관리자 공지 로직 없음.
// [2026-09-20] 파란색 → 사이트 브랜드색(딥로즈)으로 통일. 글자도 줄여 바로 목록이 보이게.

export default function NoticePageHero() {
  return (
    <header className="mb-4 rounded-2xl border border-[#E5E1DC] bg-white px-5 py-5">
      <div className="inline-flex rounded-full bg-[#F5E6EB] px-3 py-1.5 text-[12px] font-black text-[#7A1E47]">
        📢 꼭 확인해 주세요
      </div>

      <h1 className="mt-3 text-[26px] font-black leading-tight tracking-[-0.04em] text-[#151923]">공지사항</h1>

      <p className="mt-2 break-keep text-[14px] font-bold leading-relaxed text-[#6B6460]">
        주문 전 확인하실 배송·교환/환불 안내입니다. 제목을 누르면 내용이 펼쳐져요.
      </p>
    </header>
  );
}
