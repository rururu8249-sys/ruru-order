// components/myorder/MyOrderEmptyState.tsx
// 목적: 주문조회 결과 없음 안내 UI
// 주의: UI 전용. 조회 로직 없음.

"use client";
import { useCustomerUiStage } from "@/lib/useCustomerUiStage";

export default function MyOrderEmptyState() {
  const v2 = useCustomerUiStage("s4"); // [㉜ 4단계] 표시 전용
  return (
    <section className={v2 ? "mt-4 rounded-[8px] bg-[#F5F5F5] p-6 text-center" : "mt-4 rounded-[26px] bg-white p-5 text-center shadow-[0_12px_28px_rgba(30,64,175,0.08)] ring-1 ring-blue-100 min-[390px]:rounded-[28px] min-[390px]:p-7"}>
      {/* [㉜ 4단계] 새 모양에선 장식 이모지(🔎) 대신 선 아이콘 */}
      {v2 ? (
        <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#707072" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      ) : (
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-[30px] ring-1 ring-blue-100">
        🔎
      </div>
      )}

      <h2 className={v2 ? "mt-4 text-[20px] font-bold text-[#111111]" : "mt-4 text-[22px] font-black tracking-[-0.06em] text-[#151923]"}>
        최근 14일 주문내역이 없어요
      </h2>

      <p className={v2 ? "mt-2 break-keep text-[15px] font-normal leading-relaxed text-[#39393B]" : "mt-2 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600"}>
        해외배송 상품은 30일까지 보여요. 지난 주문은 카톡채널로 문의해 주세요.
      </p>
    </section>
  );
}
