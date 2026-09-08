// components/admin-live/AdminLiveMenuIcon.tsx
// [2026-09-08 5단계-B] 사이드바 큰 메뉴 아이콘 — 이모지 대신 SVG.
//   이모지는 기기(윈도우·맥·안드로이드)마다 모양이 달라 화면이 제각각으로 보인다. SVG 는 어디서나 같다.
//   색은 currentColor 를 따라가므로 선택/비선택 색이 글자와 같이 바뀐다. 표시 전용.

import type { AdminLiveTopMenuKey } from "./adminLiveMenu";

type Props = {
  menu: AdminLiveTopMenuKey;
  className?: string;
};

export default function AdminLiveMenuIcon({ menu, className = "h-[18px] w-[18px]" }: Props) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: "false" as const,
  };

  switch (menu) {
    // 방송 — 재생 버튼이 있는 화면
    case "broadcast":
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="19" height="13.5" rx="2.5" />
          <path d="M10.2 8.6 14.4 11l-4.2 2.4V8.6Z" fill="currentColor" stroke="none" />
          <path d="M8 20.5h8" />
        </svg>
      );
    // 주문·입금 — 영수증
    case "orders":
      return (
        <svg {...common}>
          <path d="M5.5 2.8h13v18.4l-2.2-1.6-2.2 1.6-2.1-1.6-2.2 1.6-2.1-1.6-2.2 1.6V2.8Z" />
          <path d="M9 8h6M9 12h6" />
        </svg>
      );
    // 상품 — 상자
    case "products":
      return (
        <svg {...common}>
          <path d="M3 7.6 12 3l9 4.6v8.8L12 21l-9-4.6V7.6Z" />
          <path d="M3 7.6 12 12l9-4.4M12 12v9" />
        </svg>
      );
    // 고객 — 사람
    case "customers":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M4.5 20c.6-3.7 3.7-6 7.5-6s6.9 2.3 7.5 6" />
        </svg>
      );
    // 설정 — 톱니
    case "settings":
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8M18.6 18.6l-1.8-1.8M7.2 7.2 5.4 5.4" />
        </svg>
      );
  }
}
