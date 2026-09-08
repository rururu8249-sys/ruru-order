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

// ── 「켜두면 계속 켜짐」 ───────────────────────────────────────────────
//   [2026-09-08 사장님] 「복사 버튼 누르니까 페이스터창 사라짐」 — 📌 를 안 눌러서다.
//   매번 누르시라는 건 말이 안 된다. 한 번 켜면 그 선택을 기억하고, 다음부터는
//   카드결제를 누르는 «그 순간»에 자동으로 같이 연다(브라우저는 클릭 순간에만 창을 열어준다).
const PIP_PREF_KEY = "ruru_cardpay_pip_on";

/** 기본은 «켜짐». 사장님이 직접 끈 적이 있을 때만 꺼진다.
 *  [2026-09-08 사장님] 「애초에 복사창 항상위에 상태로 설계하면 돼잖아? 왜 일을 두번하게 만들어?」 */
export function isPipPreferred() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PIP_PREF_KEY) !== "0";
  } catch {
    return true;
  }
}

/** 지금 열려 있는 복사창(없으면 null). 페이스터를 «그 옆»에 붙이려고 위치를 읽을 때 쓴다. */
export function getPipWindow(): Window | null {
  const api = pipApi();
  const w = api?.window || null;
  return w && !w.closed ? w : null;
}

export function setPipPreferred(on: boolean) {
  try {
    window.localStorage.setItem(PIP_PREF_KEY, on ? "1" : "0");
  } catch {
    /* 저장 실패해도 이번 판은 정상 동작 */
  }
}

/** 클릭 «안에서» 미리 열어두는 창. 팝업(모달)이 뜬 뒤에는 창을 못 열기 때문에
 *  주문표 클릭 순간에 열어두고, 팝업이 마운트될 때 받아 쓴다. */
let pendingPip: Promise<Window | null> | null = null;

/** ⚠ 반드시 클릭 핸들러 «안에서» 부를 것. 돌려주는 약속(Promise)은 기다려도 된다 —
 *  크롬의 «사용자 조작» 유효시간(수 초) 안이면 그 뒤에 창을 하나 더 열 수 있다. */
export function preopenPipWindow(width: number, height: number): Promise<Window | null> {
  const api = pipApi();
  if (!api) return Promise.resolve(null);
  pendingPip = api
    .requestWindow({ width: Math.round(width), height: Math.round(height) })
    .then((w) => {
      copyStyles(w);
      return w;
    })
    .catch(() => null);
  return pendingPip;
}

async function takePreopenedPip(): Promise<Window | null> {
  const p = pendingPip;
  pendingPip = null;
  if (!p) return null;
  const w = await p;
  if (!w || w.closed) return null;
  return w;
}

export function usePipWindow() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [supported, setSupported] = useState(false);
  const openedRef = useRef<Window | null>(null);

  // 서버 렌더와 화면이 어긋나지 않게, 지원 여부는 «브라우저에서» 확인한다
  useEffect(() => {
    setSupported(isPipSupported());
    let stopped = false;
    // 이미 떠 있는 복사창이 있으면 그대로 이어받는다.
    //   [2026-09-08 실측] 브라우저는 «클릭 한 번에 창 하나»만 열어준다
    //   (팝업을 먼저 열면 requestWindow 가 NotAllowedError: requires user activation).
    //   그래서 복사창은 팝업이 닫혀도 «계속 살려두고» 다음 주문에서 이어받는다.
    const alive = getPipWindow();
    if (alive) {
      openedRef.current = alive;
      setPipWindow(alive);
      alive.addEventListener(
        "pagehide",
        () => {
          openedRef.current = null;
          setPipWindow(null);
        },
        { once: true },
      );
      return () => {
        stopped = true;
      };
    }
    // 주문표 클릭 순간에 미리 열어둔 창이 있으면 그대로 이어받는다
    void takePreopenedPip().then((w) => {
      if (stopped || !w) return;
      openedRef.current = w;
      setPipWindow(w);
      w.addEventListener(
        "pagehide",
        () => {
          openedRef.current = null;
          setPipWindow(null);
        },
        { once: true },
      );
    });
    return () => {
      stopped = true;
    };
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

  // 팝업이 닫혀도 복사창은 «닫지 않는다».
  //   [2026-09-08] 브라우저가 클릭 한 번에 창 하나만 열어주기 때문에, 매번 닫았다 열면
  //   그 한 번의 «열 권한»을 복사창이 써버려 페이스터가 안 열린다(사장님이 겪은 증상).
  //   대신 «엉뚱한 주문의 금액»이 남아 있으면 위험하므로 안내 문구로 비운다.
  useEffect(() => {
    return () => {
      const w = openedRef.current;
      openedRef.current = null;
      if (!w || w.closed) return;
      try {
        w.document.body.innerHTML =
          '<div style="display:flex;height:100vh;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;font-weight:700;color:#8B99BC;line-height:1.7">카드결제할 주문을 선택하면<br>여기에 복사창이 나옵니다.<br><span style="font-size:11px">이 창은 닫지 마세요 — 닫으면 다음에 페이스터가 같이 안 열립니다.</span></div>';
      } catch {
        /* 이미 닫혔으면 무시 */
      }
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
