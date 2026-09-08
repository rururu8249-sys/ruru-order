"use client";

// ═══ 「항상 맨 위에 뜨는 작은 창」 (Document Picture-in-Picture) ═══
//
// 왜 필요한가 — 2026-09-08 사장님 지적:
//   「복사하고 페이스터창 왔다 갔다할때마다 창이 닫히고 뒤로 밀리고 하니까 복잡한데」
//
//   페이스터는 남의 사이트라 우리 화면(프레임) 안에 못 넣는다(실측 확정).
//   그래서 별도 창으로 띄우는데, 복사하려고 관리자 창을 «클릭»하는 순간
//   맥이 관리자 창을 위로 올려 페이스터 창이 뒤로 숨는다. 겹쳐 있기 때문이다.
//
//   해결: 복사 카드만 «항상 맨 위에 뜨는 창»으로 빼낸다.
//   그 창은 관리자 창이 아니므로, 눌러도 관리자 창이 올라오지 않는다 → 페이스터가 계속 보인다.
//
// [2026-09-08 사장님 크롬에서 직접 확인한 것] (추측 아님)
//   · Chrome 152 · documentPictureInPicture.requestWindow 존재 → 창 열림 확인
//   · 그 창이 페이스터 창 «위»에 계속 떠 있는 것 화면으로 확인
//   · 창 안 버튼으로 복사 → 페이스터 결제금액 칸에 실제로 붙여넣기 되는 것 확인
//
// ※ 브라우저가 지원 안 하면 이 훅은 조용히 «없는 셈»이 된다(버튼을 숨긴다).
//   기존 팝업 동작은 그대로다 — 이 파일은 «추가 기능»이지 대체가 아니다.

import { useCallback, useEffect, useRef, useState } from "react";

type PipApi = {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  window: Window | null;
};

function pipApi(): PipApi | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture;
  return api && typeof api.requestWindow === "function" ? api : null;
}

/** 이 브라우저가 «항상 위에 뜨는 창»을 지원하나. 화면에 버튼을 보일지 결정할 때만 쓴다. */
export function isPipSupported() {
  return pipApi() !== null;
}

/** 새 창은 CSS를 물려받지 않는다 — 지금 문서의 스타일시트를 그대로 복사해 넣는다.
 *  <link> 를 «복제»하는 방식이라 cssRules 를 읽지 않는다(교차출처 예외가 안 난다). */
function copyStyles(target: Window) {
  const doc = target.document;
  // 다크모드 등 최상위 클래스도 같이 옮긴다 (안 그러면 색이 밝은 쪽으로만 나온다)
  doc.documentElement.className = document.documentElement.className;
  doc.documentElement.setAttribute("lang", document.documentElement.getAttribute("lang") || "ko");
  document.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style').forEach((node) => {
    doc.head.appendChild(node.cloneNode(true));
  });
  doc.body.style.margin = "0";
}

export function usePipWindow() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [supported, setSupported] = useState(false);
  const openedRef = useRef<Window | null>(null);

  // 서버 렌더와 화면이 어긋나지 않게, 지원 여부는 «브라우저에서» 확인한다
  useEffect(() => {
    setSupported(isPipSupported());
  }, []);

  /** ⚠ 반드시 «클릭 안에서» 불러야 한다 — 브라우저가 사용자 조작 없이는 창을 안 열어준다. */
  const open = useCallback(async (width: number, height: number) => {
    const api = pipApi();
    if (!api) return null;
    try {
      const w = await api.requestWindow({ width, height });
      copyStyles(w);
      openedRef.current = w;
      setPipWindow(w);
      // 사장님이 창의 ✕ 를 눌러 닫았을 때 화면 상태를 되돌린다
      w.addEventListener(
        "pagehide",
        () => {
          openedRef.current = null;
          setPipWindow(null);
        },
        { once: true },
      );
      return w;
    } catch {
      return null; // 거부되면 조용히 기존 방식 유지
    }
  }, []);

  const close = useCallback(() => {
    try {
      openedRef.current?.close();
    } catch {
      /* 이미 닫혀 있으면 무시 */
    }
    openedRef.current = null;
    setPipWindow(null);
  }, []);

  // 팝업이 닫히면(=이 훅을 쓰는 화면이 사라지면) 작은 창도 같이 닫는다.
  //   안 그러면 «주인 없는 창»이 화면에 남아 사장님이 손으로 닫아야 한다.
  useEffect(() => {
    return () => {
      try {
        openedRef.current?.close();
      } catch {
        /* 무시 */
      }
      openedRef.current = null;
    };
  }, []);

  return { pipWindow, supported, open, close };
}

/** 클립보드 복사 — 작은 창 안에서도 되도록 예비수단을 갖춘다.
 *  ① navigator.clipboard (표준)
 *  ② textarea + execCommand("copy") — 구형 방식이지만 클릭 안에서는 잘 동작한다
 *  둘 다 실패하면 false 를 돌려준다(부르는 쪽에서 안내를 띄운다). */
export async function copyTextIn(win: Window, value: string): Promise<boolean> {
  try {
    await win.navigator.clipboard.writeText(value);
    return true;
  } catch {
    /* ②로 넘어간다 */
  }
  try {
    const doc = win.document;
    const ta = doc.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    doc.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = doc.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
