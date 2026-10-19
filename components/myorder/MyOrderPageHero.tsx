// components/myorder/MyOrderPageHero.tsx
// 목적: 주문조회 페이지 상단 제목/요약 UI
// 주의: UI 전용. 주문조회 로직, Supabase, 주문/입금/정산 로직 없음.

import { useCustomerUiStage } from "@/lib/useCustomerUiStage";

type MyOrderPageHeroProps = {
  isLoggedIn: boolean;
  customerName: string;
};

export default function MyOrderPageHero({
  isLoggedIn,
  customerName,
}: MyOrderPageHeroProps) {
  const safeName = String(customerName || "").trim();
  const displayName = safeName || "고객";
  const v2 = useCustomerUiStage("s4"); // [㉜ 4단계] 표시 전용

  return (
    <section
      data-ruru-myorder-hero="shell-v2"
      className="mb-3 px-1 pt-1"
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={v2 ? "text-[14px] font-normal text-[#707072]" : "text-[12px] font-black tracking-[-0.04em] text-blue-700"}>
            최근 6개월
          </p>
          <h1 className={v2 ? "mt-0.5 text-[24px] font-bold leading-tight text-[#111111]" : "mt-0.5 text-[24px] font-black leading-tight tracking-[-0.07em] text-slate-950"}>
            주문조회
          </h1>
        </div>

        {/* [㉜ 4단계] 새 모양에선 「조회전용」 배지 삭제(쓸모없는 표시) */}
        {v2 ? null : (
        <div className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-black tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100">
          조회전용
        </div>
        )}
      </div>

      {isLoggedIn ? (
        <div className={v2 ? "mt-3 rounded-[8px] bg-[#F5F5F5] px-4 py-3" : "mt-3 rounded-[18px] bg-white px-4 py-3 ring-1 ring-slate-200"}>
          <div className={v2 ? "flex items-center justify-between gap-3 text-[15px]" : "flex items-center justify-between gap-3 text-[13px] font-black tracking-[-0.04em]"}>
            <span className={v2 ? "shrink-0 font-normal text-[#707072]" : "shrink-0 text-slate-500"}>주문자</span>
            <span className={v2 ? "min-w-0 truncate text-right font-semibold text-[#111111]" : "min-w-0 truncate text-right text-blue-700"} title={displayName}>
              {displayName}
            </span>
          </div>
        </div>
      ) : (
        <div className={v2 ? "mt-3 rounded-[8px] bg-[#F5F5F5] px-4 py-3" : "mt-3 rounded-[18px] bg-white px-4 py-3 ring-1 ring-slate-200"}>
          <p className={v2 ? "break-keep text-[15px] font-normal leading-relaxed text-[#39393B]" : "break-keep text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600"}>
            주문조회는 저장된 전화번호 기준으로 최근 6개월 주문내역을 확인합니다.
          </p>
        </div>
      )}
    </section>
  );
}
