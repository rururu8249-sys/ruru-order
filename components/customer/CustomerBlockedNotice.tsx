"use client";

// components/customer/CustomerBlockedNotice.tsx
// 목적: 차단 고객 주문서 작성 제한 안내
// 주의: UI 전용. 주문 저장, 금액, 배송비, 입금, 정산 로직 없음.

// [2026-09-08] 문의 방식은 설정 › 상점 정보를 따른다(하드코딩 제거)
import ShopContactLink from "@/components/customer/ShopContactLink";
import { contactGuideSentence } from "@/lib/shopInfo";
import { useShopInfo } from "@/lib/useShopInfo";
import { useCustomerStageRestyle } from "@/lib/useCustomerUiStage";

export default function CustomerBlockedNotice() {
  // [㉜ 5단계] ?preview=s5 에서만 새 모양(로즈→흑백·13px 미만→13px·그림자 정리). 꺼지면 원래 스타일 그대로.
  const { on: v5, s: s5, c: c5 } = useCustomerStageRestyle("s5");
  const shopInfo = useShopInfo();
  return (
    <section className={c5("rounded-[26px] border border-red-100 bg-red-50 p-5 shadow-sm")}>
      <div className={c5("flex items-start gap-3")}>
        <div className={c5("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-xl text-white")}>
          {v5 ? <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg> : "🚫"}
        </div>

        <div className={c5("min-w-0")}>
          <div className={c5("text-[11px] font-black tracking-[0.16em] text-red-500")}>
            ORDER LIMITED
          </div>

          <h2 className={c5("mt-1 text-[22px] font-black tracking-[-0.05em] text-slate-950")}>
            현재 주문서 작성이 제한되어 있습니다.
          </h2>

          <p className={c5("mt-2 break-keep text-[14px] font-bold leading-relaxed text-red-700")}>
            {contactGuideSentence(shopInfo)} 운영 확인 후 안내드리겠습니다.
          </p>

          <ShopContactLink
            labelForm="long"
            className={c5("mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white active:scale-[0.98]")}
          />
        </div>
      </div>
    </section>
  );
}
