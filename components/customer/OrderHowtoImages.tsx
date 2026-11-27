"use client";

// [2026-11-27 사장님 「주문방법 너무 복잡해 — 50대 이상도 알게 그림 2~3장, 1번은 방송 채팅 «저요!» 접수 먼저」]
//   손님 주문 방법 그림 3장(public/order-howto-v2-1~3.jpg — 11/27 사장님이 준 그림)을 옆으로 넘겨 보는 칸.
//   쇼핑몰 「주문 방법」 창과 방송 보며 주문 「주문 방법」 창이 같이 씀. 표시만 — 돈·주문 무관.
import { useRef, useState } from "react";

export const ORDER_HOWTO_IMAGES = [
  { src: "/order-howto-v2-1.jpg", alt: "카톡채널 대화방 아래 「주문 사이트」를 눌러 주세요. 카카오톡으로 바로 로그인, 방송 보면서 간편 주문 가능." },
  { src: "/order-howto-v2-2.jpg", alt: "STEP 01 카톡채널 대화방에서 주문 사이트 누르기, STEP 02 화면 아래 상품 누르기, STEP 03 원하는 상품의 상품 선택 누르기." },
  { src: "/order-howto-v2-3.jpg", alt: "STEP 04 목록에서 원하는 상품의 상품 선택 누르기, STEP 05 사이즈 선택·수량 확인 후 선택상품 담기." },
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
            style={{ flex: "0 0 100%", width: "100%", height: "auto", scrollSnapAlign: "start", display: "block", objectFit: "contain", background: "#FFFFFF" }}
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
