// app/group-buy/page.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/group-buy/page.tsx
//
// 2번 디자인 리뉴얼 기준 공구상품 페이지 v2
// - 모바일 우선 / 애플감성 / 깔끔모던화이트 / 핑크 포인트
// - 고객이 바로 이해하는 카드형 UI
// - 외부 사진 링크 우선
// - 대표사진 URL 구조 포함
// - 현재는 DB 연결 전: groupProducts 배열에 상품을 넣으면 바로 표시됨
// - 추후 3번 고객기능 + 6번 Supabase DB에서 실제 상품 테이블 연결 예정

"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

type GroupProduct = {
  id: string;
  productName: string;
  price: number;
  stockStatus: "주문가능" | "품절" | "마감임박";
  deliveryType: "일반배송" | "업체배송" | "합배송불가" | "별도배송";
  canCombineShipping: boolean;
  shortDesc: string;
  photoUrl?: string;
  imageUrl?: string;
};

const groupProducts: GroupProduct[] = [
  // 실제 상품 등록 전 예시입니다.
  // 상품 노출이 필요하면 아래 주석을 풀고 수정하세요.
  //
  // {
  //   id: "sample-1",
  //   productName: "라메르 크림 100ml",
  //   price: 59000,
  //   stockStatus: "주문가능",
  //   deliveryType: "업체배송",
  //   canCombineShipping: false,
  //   shortDesc: "업체 별도 출고 상품입니다. 사진 확인 후 주문해주세요.",
  //   photoUrl: "https://example.com",
  //   imageUrl: "",
  // },
];

const blockCustomerCopyEvents = () => {
  const block = (event: Event) => event.preventDefault();

  const blockKey = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const isMac = event.metaKey;
    const isWin = event.ctrlKey;

    if (
      event.key === "F12" ||
      ((isWin || isMac) && ["c", "x", "u"].includes(key)) ||
      (isWin && event.shiftKey && ["i", "j"].includes(key)) ||
      (isMac && event.altKey && ["i", "j"].includes(key))
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  document.addEventListener("contextmenu", block);
  document.addEventListener("copy", block);
  document.addEventListener("cut", block);
  document.addEventListener("dragstart", block);
  document.addEventListener("selectstart", block);
  document.addEventListener("keydown", blockKey);

  return () => {
    document.removeEventListener("contextmenu", block);
    document.removeEventListener("copy", block);
    document.removeEventListener("cut", block);
    document.removeEventListener("dragstart", block);
    document.removeEventListener("selectstart", block);
    document.removeEventListener("keydown", blockKey);
  };
};

const won = (value: number) => `${Number(value || 0).toLocaleString()}원`;

function TopCustomerNav() {
  return (
    <div className="sticky top-3 z-30 mb-4 flex items-center justify-between gap-2 rounded-full border border-[#f4e7e9] bg-white/95 px-4 py-3 shadow-[0_12px_30px_rgba(30,20,20,0.08)] backdrop-blur">
      <div className="shrink-0 text-[13px] font-black tracking-[-0.04em] text-[#ff4b60]">
        📺 루루동이
      </div>

      <div className="flex items-center gap-2 text-[12px] font-black tracking-[-0.04em]">
        <Link
          href="/"
          className="whitespace-nowrap px-1 py-2 text-[#ff4b60] transition active:scale-[0.97]"
        >
          🏠 HOME
        </Link>
        <span className="text-[#e1d4d5]">/</span>
        <Link
          href="/order"
          className="whitespace-nowrap px-1 py-2 text-[#5f5555] transition active:scale-[0.97]"
        >
          주문서
        </Link>
      </div>
    </div>
  );
}

function StockBadge({ status }: { status: GroupProduct["stockStatus"] }) {
  const className =
    status === "품절"
      ? "bg-gray-200 text-gray-700"
      : status === "마감임박"
        ? "bg-orange-100 text-orange-700"
        : "bg-green-100 text-green-700";

  return (
    <span className={`rounded-full px-3 py-1 text-[12px] font-black ${className}`}>
      {status}
    </span>
  );
}

function DeliveryBadge({
  deliveryType,
  canCombineShipping,
}: {
  deliveryType: GroupProduct["deliveryType"];
  canCombineShipping: boolean;
}) {
  const label = canCombineShipping ? "합배송 가능" : "별도배송";
  const color = canCombineShipping
    ? "bg-[#edf8f4] text-[#29916f]"
    : "bg-[#fff2f4] text-[#ff4b60]";

  return (
    <div className="flex flex-wrap gap-2">
      <span className="rounded-full bg-[#f6f3f3] px-3 py-1 text-[12px] font-black text-[#5f5555]">
        {deliveryType}
      </span>
      <span className={`rounded-full px-3 py-1 text-[12px] font-black ${color}`}>
        {label}
      </span>
    </div>
  );
}

export default function GroupBuyPage() {
  useEffect(() => {
    return blockCustomerCopyEvents();
  }, []);

  return (
    <main
      className="min-h-screen select-none bg-[#fffafa] px-4 py-6 text-[#171717]"
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <section className="mx-auto w-full max-w-[480px]">
        <TopCustomerNav />

        <header className="mb-5 rounded-[32px] border border-[#f4e7e9] bg-white px-5 py-6 shadow-[0_16px_40px_rgba(30,20,20,0.06)]">
          <div className="inline-flex rounded-full bg-[#fff1a8] px-3 py-1 text-[12px] font-black text-[#2b2416]">
            🛍 상시 주문
          </div>

          <h1 className="mt-3 text-[38px] font-black leading-tight tracking-[-0.07em] text-[#151515]">
            공구상품
          </h1>

          <p className="mt-2 text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-[#7b6d6d]">
            방송 외에도 주문 가능한 상품입니다.
            상품 사진과 배송유형을 확인 후 주문해주세요.
          </p>
        </header>

        <section className="mb-4 rounded-[28px] bg-[#fff2f4] p-5">
          <div className="text-[16px] font-black text-[#d7475b]">
            📌 주문 전 확인
          </div>
          <p className="mt-2 text-[13px] font-bold leading-relaxed tracking-[-0.03em] text-[#d7475b]">
            공구상품은 상품별로 일반배송 / 업체배송 / 합배송불가가 다를 수 있습니다.
            카드에 표시된 배송유형을 꼭 확인해주세요.
          </p>
        </section>

        {groupProducts.length === 0 ? (
          <section className="rounded-[30px] border border-[#f1ecec] bg-white p-6 text-center shadow-[0_14px_35px_rgba(30,20,20,0.07)]">
            <div className="text-[44px]">🛍</div>
            <h2 className="mt-3 text-[25px] font-black tracking-[-0.055em] text-[#151515]">
              공구상품 준비 중
            </h2>
            <p className="mt-3 text-[14px] font-bold leading-relaxed tracking-[-0.03em] text-[#777]">
              등록된 공구상품이 아직 없습니다.
              <br />
              상품이 등록되면 이 화면에 카드형으로 표시됩니다.
            </p>

            <p className="mt-5 text-[14px] font-bold leading-relaxed tracking-[-0.03em] text-[#777]">
              방송 상품 주문은 홈화면
              <span className="font-black text-[#ff4b60]"> 주문서작성</span>
              메뉴를 이용해주세요 💕
            </p>
          </section>
        ) : (
          <section className="grid gap-4">
            {groupProducts.map((product) => {
              const canOrder = product.stockStatus !== "품절";
              const orderHref = `/order?from=group-buy&product=${encodeURIComponent(
                product.productName
              )}&price=${product.price}`;

              return (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-[30px] border border-[#f1ecec] bg-white shadow-[0_14px_35px_rgba(30,20,20,0.07)]"
                >
                  {product.imageUrl && (
                    <div className="relative h-[210px] w-full bg-[#fff7f8]">
                      <Image
                        src={product.imageUrl}
                        alt={product.productName}
                        fill
                        draggable={false}
                        className="object-cover"
                      />
                    </div>
                  )}

                  <div className="p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <StockBadge status={product.stockStatus} />
                      <DeliveryBadge
                        deliveryType={product.deliveryType}
                        canCombineShipping={product.canCombineShipping}
                      />
                    </div>

                    <h2 className="break-keep text-[23px] font-black leading-snug tracking-[-0.05em] text-[#151515]">
                      {product.productName}
                    </h2>

                    <p className="mt-2 text-[14px] font-bold leading-relaxed tracking-[-0.03em] text-[#777]">
                      {product.shortDesc}
                    </p>

                    <div className="mt-4 rounded-[22px] bg-[#fffafa] p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-[#777]">금액</span>
                        <span className="text-[24px] font-black tracking-[-0.05em] text-[#151515]">
                          {won(product.price)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {product.photoUrl ? (
                        <a
                          href={product.photoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-[20px] bg-[#f5f2f2] px-4 py-4 text-center text-[14px] font-black text-[#5f5555] transition active:scale-[0.97]"
                        >
                          사진보러가기
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="rounded-[20px] bg-[#f5f2f2] px-4 py-4 text-center text-[14px] font-black text-[#aaa]"
                        >
                          사진 준비중
                        </button>
                      )}

                      <Link
                        href={orderHref}
                        className={`rounded-[20px] px-4 py-4 text-center text-[14px] font-black text-white transition active:scale-[0.97] ${
                          canOrder
                            ? "bg-gradient-to-br from-[#ff5d6d] via-[#ff4c62] to-[#ff405a]"
                            : "pointer-events-none bg-gray-300"
                        }`}
                      >
                        {canOrder ? "바로주문" : "품절"}
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <footer className="py-8 text-center">
          <p className="text-[15px] font-medium tracking-[-0.04em] text-[#5f5555]">
            오늘도 루루동이와 함께 행복한 쇼핑 되세요!♡
          </p>
          <div className="mx-auto mt-5 h-px w-full bg-[#eee5e5]" />
          <p className="mt-4 text-[12px] text-[#aaa]">
            copyright © since 2024 루루동이. All rights reserved.
          </p>
        </footer>
      </section>
    </main>
  );
}
