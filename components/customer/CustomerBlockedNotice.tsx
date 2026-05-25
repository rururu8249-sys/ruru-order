"use client";

// components/customer/CustomerBlockedNotice.tsx
// 목적: 차단 고객 주문서 작성 제한 안내
// 주의: UI 전용. 주문 저장, 금액, 배송비, 입금, 정산 로직 없음.

const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_RMxaqX";

export default function CustomerBlockedNotice() {
  return (
    <section className="rounded-[26px] border border-red-100 bg-red-50 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-xl text-white">
          🚫
        </div>

        <div className="min-w-0">
          <div className="text-[11px] font-black tracking-[0.16em] text-red-500">
            ORDER LIMITED
          </div>

          <h2 className="mt-1 text-[22px] font-black tracking-[-0.05em] text-slate-950">
            현재 주문서 작성이 제한되어 있습니다.
          </h2>

          <p className="mt-2 break-keep text-[14px] font-bold leading-relaxed text-red-700">
            문의는 카톡채널로 부탁드립니다. 운영 확인 후 안내드리겠습니다.
          </p>

          <a
            href={KAKAO_CHANNEL_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white active:scale-[0.98]"
          >
            카톡채널 문의하기
          </a>
        </div>
      </div>
    </section>
  );
}
