"use client";

// ═══ 카드결제 «복사창» = 우리 사이트의 «이름 붙은 팝업 창» — 2026-09-22 B안 ═══
//
//   사장님: 「복사창 + 결제창을 하나로 묶고 싶은데」 → 「창 두 개가 나란히 자동으로 뜨는」 B안 채택
//
//   왜 «작은 창»인가 (2026-09-22):
//     복사 패널이 큰 관리자 창 «안»(모달)에 있으면, 복사를 누르는 순간 관리자 창 전체가 앞으로 와서
//     그 위에 떠 있던 페이스터 창이 뒤로 밀린다. 복사 패널도 «작은 창»으로 빼서 페이스터 창 «옆에»
//     겹치지 않게 두면, 눌러도 복사창만 앞으로 오고 페이스터는 그대로 보인다.
//     → 「항상 맨 위(PiP)」가 필요 없다. 예전 📌 고정은 모달 시절의 땜질이었다.
//
//   PiP(lib/usePipWindow.ts)와 다른 점:
//     · window.open 으로 여는 «보통 팝업 창» — 위치·크기를 우리가 정한다(PiP 는 크롬이 정했다)
//     · 항상 위가 아니다 — 결제 안 할 땐 관리자 창 뒤로 들어간다(다른 업무 방해 없음)
//     · «고정 이름»(COPY_WINDOW_NAME)이라 같은 창을 다시 쓴다
//   같은 점: 새 창은 CSS 를 안 물려받으므로 <link>/<style> 을 복제해 넣는다(copyStyles).
//
//   ⚠ 브라우저 규칙: 클릭 한 번에 «새 창»은 하나만. 이미 있는 이름창을 참조+focus 하는 건 공짜.
//     여는 순서는 AdminLiveCardPayPopup.tsx 의 openPaysterRightHalf() 주석에 있다.

import { useCallback, useEffect, useRef, useState } from "react";
import { cardPayWindowSlots, popupFeatures, type WindowRect } from "@/lib/cardPayWindowSlots";

/** 복사창 이름 — 고정. 이 이름으로 같은 창을 계속 다시 쓴다. */
export const COPY_WINDOW_NAME = "ruru_cardpay_copy";
const STYLE_MARK = "data-ruru-copy-styles";

let copyWin: Window | null = null;

/** 지금 살아 있는 복사창(없으면 null). */
export function getCopyWindow(): Window | null {
  try {
    return copyWin && !copyWin.closed ? copyWin : null;
  } catch {
    return null;
  }
}

/** 모니터 기준 두 창 자리. 브라우저에서만 부른다. */
export function currentCardPaySlots() {
  const s = typeof window !== "undefined" ? window.screen : null;
  return cardPayWindowSlots({
    availWidth: s?.availWidth || 1440,
    availHeight: s?.availHeight || 900,
    availLeft: (s as unknown as { availLeft?: number })?.availLeft || 0,
    availTop: (s as unknown as { availTop?: number })?.availTop || 0,
  });
}

/** 새 창은 CSS 를 물려받지 않는다 — 지금 문서의 스타일시트를 그대로 복제해 넣는다.
 *  (<link> 복제 방식이라 cssRules 를 안 읽는다 → 교차출처 예외 없음. usePipWindow 와 동일) */
function copyStyles(target: Window) {
  const doc = target.document;
  doc.documentElement.className = document.documentElement.className;
  doc.documentElement.setAttribute("lang", document.documentElement.getAttribute("lang") || "ko");
  document.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style').forEach((node) => {
    doc.head.appendChild(node.cloneNode(true));
  });
  const mark = doc.createElement("meta");
  mark.setAttribute(STYLE_MARK, "1");
  doc.head.appendChild(mark);
  doc.body.style.margin = "0";
  doc.title = "카드결제 복사창";
}

/** 복사창을 잡는다 — 없으면 이 자리에 «새로» 만들고(클릭 권한 소모), 있으면 참조+focus(권한 안 씀).
 *  ⚠ 반드시 «클릭 안에서» 부를 것(없을 때 새로 만들려면 사용자 조작이 필요하다). */
export function grabCopyWindow(rect?: WindowRect): Window | null {
  if (typeof window === "undefined") return null;
  const r = rect || currentCardPaySlots().copy;
  let win: Window | null = null;
  try {
    win = window.open("", COPY_WINDOW_NAME, popupFeatures(r));
  } catch {
    win = null;
  }
  if (!win) return null; // 팝업 차단(이 클릭의 권한을 이미 다른 창에 썼다) → 페이지 모달 + 「복사창 열기」 버튼
  copyWin = win;
  try {
    if (!win.document.head.querySelector(`[${STYLE_MARK}]`)) copyStyles(win);
  } catch {
    /* 문서 접근이 안 되면(있을 수 없지만) 그냥 둔다 */
  }
  try {
    win.focus();
  } catch {
    /* 보조 동작 */
  }
  return win;
}

/** 복사창을 React 가 그리는 «대상»으로 쓰기 위한 훅.
 *  · 마운트 때 이미 살아 있는 복사창이 있으면 이어받는다(주문표 클릭에서 미리 열어둔 창)
 *  · 사장님이 창의 ✕ 를 누르면 win 이 null 이 된다(부르는 쪽에서 «카드결제 종료»로 처리)
 *  · 언마운트(카드결제 종료) 때 창을 닫는다 — 결제할 때만 떴다가 같이 사라진다 */
/** 창 안에 남아 있던 옛 그림(페이지 새로고침 전 React 가 그려둔 것)을 비운다.
 *  ⚠ React 포털이 «그리기 전»에만 부를 것 — 그린 뒤에 비우면 포털이 깨진다. */
function clearStale(w: Window) {
  try {
    w.document.body.replaceChildren();
  } catch {
    /* 무시 */
  }
}

export function useCopyWindow() {
  // 첫 렌더 «전»(초기화 함수)에 이어받는다 → 페이지 모달이 한 프레임 그려졌다 바뀌는 일이 없다.
  const [win, setWin] = useState<Window | null>(() => {
    const w = getCopyWindow();
    if (w) clearStale(w);
    return w;
  });
  const openedRef = useRef<Window | null>(null);

  const attach = useCallback((w: Window) => {
    openedRef.current = w;
    setWin(w);
    try {
      w.addEventListener(
        "pagehide",
        () => {
          if (openedRef.current === w) openedRef.current = null;
          setWin((cur) => (cur === w ? null : cur));
        },
        { once: true },
      );
    } catch {
      /* 무시 */
    }
  }, []);

  useEffect(() => {
    const alive = getCopyWindow();
    if (alive) attach(alive);
    // pagehide 가 안 오는 경우를 대비해 닫힘을 감시한다(0.5초)
    const timer = window.setInterval(() => {
      const w = openedRef.current;
      if (w && w.closed) {
        openedRef.current = null;
        setWin(null);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [attach]);

  /** ⚠ 클릭 안에서만. 페이지 모달의 「복사창 열기 ↗」 버튼이 부른다(이때 이 창엔 포털이 없다 → 비워도 됨). */
  const open = useCallback(() => {
    const w = grabCopyWindow();
    if (w) {
      clearStale(w);
      attach(w);
    }
    return w;
  }, [attach]);

  // 카드결제 종료(언마운트) → 복사창도 닫는다
  useEffect(() => {
    return () => {
      const w = openedRef.current;
      openedRef.current = null;
      try {
        w?.close();
      } catch {
        /* 이미 닫혔으면 무시 */
      }
    };
  }, []);

  return { win, open };
}
