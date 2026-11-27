"use client";

// [2026-11-27 사장님 「주문방법 너무 복잡해 — 50대 이상도 알게 그림 2~3장, 1번은 방송 채팅 «저요!» 접수 먼저」]
//   손님 주문 방법 그림 3장(public/order-howto-1~3.png)을 옆으로 넘겨 보는 칸.
//   쇼핑몰 「주문 방법」 창과 방송 보며 주문 「주문 방법」 창이 같이 씀. 표시만 — 돈·주문 무관.
import { useRef, useState } from "react";

export const ORDER_HOWTO_IMAGES = [
  { src: "/order-howto-1.png", alt: "1. 먼저 방송 채팅에 상품번호·색상·사이즈와 «저요!»를 쓰고, 루루언니가 «접수했어요» 한 뒤에 사이트에서 담아 주세요. 재고가 실시간으로 바뀌어서 접수가 먼저예요." },
  { src: "/order-howto-2.png", alt: "2. 사이트에서 「상품」 → 접수한 상품의 「상품 선택」 → 색상·사이즈·수량 고르기 → 「담기」." },
  { src: "/order-howto-3.png", alt: "3. 「주문서」 → 배송지·금액 확인 → 「주문서 제출」. 무통장입금은 입금자명을 닉네임으로 금액 그대로, 카드결제는 카톡으로 오는 결제 링크에서." },
];

export default function OrderHowtoImages({ onPageChange }: { onPageChange?: (page: number, last: boolean) => void }) {
  const [page, setPage] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const n = ORDER_HOWTO_IMAGES.length;

  const go = (i: number) => {
    const el = boxRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div>
      <div
        ref={boxRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.max(0, Math.min(n - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
          if (i !== page) { setPage(i); onPageChange?.(i, i === n - 1); }
        }}
        style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {ORDER_HOWTO_IMAGES.map((im, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={im.src}
            src={im.src}
            alt={im.alt}
            loading={i === 0 ? "eager" : "lazy"}
            draggable={false}
            onClick={() => { if (i < n - 1) go(i + 1); }}
            style={{ flex: "0 0 100%", width: "100%", height: "auto", aspectRatio: "1080 / 1350", scrollSnapAlign: "start", display: "block", objectFit: "contain", background: "#FFFFFF" }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "4px", paddingTop: "8px" }}>
        {ORDER_HOWTO_IMAGES.map((im, i) => (
          <button
            key={im.src}
            type="button"
            aria-label={`주문 방법 ${i + 1}번째 그림`}
            aria-current={i === page ? "true" : undefined}
            onClick={() => go(i)}
            style={{ width: "32px", height: "32px", border: "none", background: "none", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <span style={{ width: i === page ? "20px" : "8px", height: "8px", borderRadius: "9999px", background: i === page ? "#111111" : "#D4D0CB", transition: "width 0.2s" }} />
          </button>
        ))}
      </div>
    </div>
  );
}
