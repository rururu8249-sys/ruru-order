// components/home/CustomerHomeHero.tsx
// 목적: 고객 HOME 메인 주문 CTA 영역
// 주의: UI 전용. 주문 저장/금액/배송비/입금 로직 없음.

import Link from "next/link";

type CustomerHomeHeroProps = {
  isLoggedIn: boolean;
  greetingName: string;
};

export default function CustomerHomeHero({
  isLoggedIn,
  greetingName,
}: CustomerHomeHeroProps) {
  return (
    <section className="overflow-hidden rounded-[34px] bg-white px-5 pb-5 pt-5 shadow-[0_18px_40px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="rounded-[26px] bg-gradient-to-br from-blue-50 to-white px-4 py-4 ring-1 ring-blue-100">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex rounded-full bg-white px-3 py-1 text-[12px] font-black tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100">
              루루동이 LIVE
            </p>

            <h1 className="mt-2 text-[23px] font-black leading-tight tracking-[-0.08em] text-[#151923]">
              루루동이 집구석 LIVE
            </h1>

            <p className="mt-2 break-keep text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
              {isLoggedIn
                ? `${greetingName || "고객"}님, 바로 주문서 작성으로 이동할 수 있어요.`
                : "처음 주문은 정보 확인 후 주문서 작성으로 이동해요."}
            </p>
          </div>

          <div className="flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-[22px] bg-white text-[31px] shadow-inner ring-1 ring-blue-100">
            🛍️
          </div>
        </div>
      </div>

      <Link
        href="/order"
        className="mt-5 block rounded-[34px] bg-blue-600 px-5 py-8 text-white shadow-[0_20px_38px_rgba(37,99,235,0.30)] active:scale-[0.99]"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-[86px] w-[86px] shrink-0 items-center justify-center rounded-full bg-white/18 text-[42px]">
            📝
          </div>

          <div className="min-w-0 flex-1">
            <p className="whitespace-nowrap text-[36px] font-black leading-none tracking-[-0.08em]">
              주문서 작성
            </p>
            <p className="mt-3 break-keep text-[16px] font-extrabold leading-relaxed tracking-[-0.04em] text-white/95">
              방송 접수 후 주문서 작성·입금을 진행해주세요.
            </p>
          </div>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[30px] font-black text-blue-700 shadow-lg">
            ›
          </div>
        </div>
      </Link>

      <p className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-[14px] font-bold leading-relaxed tracking-[-0.04em] text-blue-800">
        주문을 위한 최초 1회 정보 확인입니다. 한 번만 입력하면 로그아웃 전까지는 바로 상품 입력으로 이동해요.
      </p>
    </section>
  );
}
