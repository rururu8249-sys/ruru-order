// app/components/SecurityBlocker.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/components/SecurityBlocker.tsx
//
// 기능:
// - 고객 페이지 우클릭 방지
// - 텍스트 선택 방지
// - 복사/잘라내기 방지
// - 이미지 드래그 방지
// - 개발자 단축키 일부 방지
//
// 예외:
// data-security-allow="true" 속성이 있는 요소는 허용
// 주문조회번호 입력칸 등 복사/붙여넣기 필요한 곳에 사용

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function isAllowedElement(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest('[data-security-allow="true"]')
  );
}

export default function SecurityBlocker() {
  const pathname = usePathname();

  useEffect(() => {
    // 관리자 페이지는 보안차단 제외
    if (pathname?.startsWith("/admin")) {
      return;
    }

    const blockEvent = (event: Event) => {
      if (isAllowedElement(event.target)) {
        return;
      }

      event.preventDefault();
    };

    const blockKeyboard = (event: KeyboardEvent) => {
      if (isAllowedElement(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      const blocked =
        event.key === "F12" ||
        (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) ||
        (event.metaKey && event.altKey && ["i", "j", "c"].includes(key)) ||
        (event.ctrlKey && ["u", "s", "p", "c", "x", "a"].includes(key)) ||
        (event.metaKey && ["u", "s", "p", "c", "x", "a"].includes(key));

      if (blocked) {
        event.preventDefault();
      }
    };

    const blockDrag = (event: DragEvent) => {
      if (isAllowedElement(event.target)) {
        return;
      }

      event.preventDefault();
    };

    document.addEventListener("contextmenu", blockEvent);
    document.addEventListener("selectstart", blockEvent);
    document.addEventListener("copy", blockEvent);
    document.addEventListener("cut", blockEvent);
    document.addEventListener("dragstart", blockDrag);
    document.addEventListener("keydown", blockKeyboard);

    document.body.classList.add("customer-security-lock");

    return () => {
      document.removeEventListener("contextmenu", blockEvent);
      document.removeEventListener("selectstart", blockEvent);
      document.removeEventListener("copy", blockEvent);
      document.removeEventListener("cut", blockEvent);
      document.removeEventListener("dragstart", blockDrag);
      document.removeEventListener("keydown", blockKeyboard);

      document.body.classList.remove("customer-security-lock");
    };
  }, [pathname]);

  return null;
}
