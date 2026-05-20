// components/myorder/MyOrderEmptyState.tsx
// 목적: 주문조회 결과 없음 안내 UI
// 주의: UI 전용. 조회 로직 없음.

export default function MyOrderEmptyState() {
  return (
    <section className="mt-4 rounded-[28px] bg-white p-7 text-center shadow-[0_12px_28px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-[30px] ring-1 ring-blue-100">
        🔎
      </div>

      <h2 className="mt-4 text-[22px] font-black tracking-[-0.06em] text-[#151923]">
        최근 7일 주문내역이 없습니다
      </h2>

      <p className="mt-2 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
        7일이 지난 주문은 카톡채널로 문의해주세요.
      </p>
    </section>
  );
}
