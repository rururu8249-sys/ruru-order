"use client";

// ═══ 팝업 창의 «두께»(탭줄·주소창·테두리) 실측 ═══
//
// 왜 필요한가 — [2026-09-09 사장님]
//   「오른쪽 페이스터창이랑 왼쪽 복사창(고정식)이랑 가로세로 px 한치의 오차도 없이 못만들어? 이질감 든다」
//
// [MDN 공식문서 확인 2026-09-09]
//   · documentPictureInPicture.requestWindow({width,height}) → 그 창의 «viewport(내용 영역)»
//   · window.open(..., "width=,height=")                     → «content area(내용 영역)»
//   · window.open 의 left/top                                → 창 «전체»의 좌상단 (작업영역 기준)
//   · window.screenX / screenY                               → «viewport»의 좌상단
//   ⇒ 둘 다 내용 영역 기준인데, 눈에 보이는 상자는 «창 전체»다.
//     페이스터 창에는 탭줄·주소창이 더 붙으므로, 같은 내용영역을 줘도 상자가 그만큼 크다.
//     예전 코드는 복사창의 outer 값을 window.open 의 내용영역 인자로 넘겨서 세로가 어긋났다.
//
// 왜 «재야만» 하나 — 페이스터는 남의 사이트(교차출처)라 outerHeight/screenY 를 못 읽는다.
//   창을 «만드는 순간»에는 about:blank(우리 오리진을 물려받음)라서 그때만 읽을 수 있다.
//   그래서 새 창을 만들 때 한 번 재서 기억하고, 다음 새 창부터 정확히 맞춘다.
//   ⚠ 이미 열려 있는 창은 위치·크기를 못 바꾼다(교차출처 moveTo 불가 — 2026-09-08 실측).

const KEY = "ruru_popup_chrome_v1";

export type PopupChrome = {
  /** 요청한 top 과 실제 viewport 상단의 차이 = 탭줄+주소창 높이 */
  top: number;
  /** outerHeight − innerHeight (위 UI + 아래 테두리) */
  hGap: number;
  /** outerWidth − innerWidth (좌우 테두리) */
  wGap: number;
};

/** 말이 안 되는 값이 저장되면 화면이 망가지므로 범위를 넘으면 «없는 셈» 친다. */
function sane(v: Partial<PopupChrome> | null): PopupChrome | null {
  if (!v) return null;
  const { top, hGap, wGap } = v;
  if (typeof top !== "number" || !Number.isFinite(top) || top < 0 || top > 400) return null;
  if (typeof hGap !== "number" || !Number.isFinite(hGap) || hGap < 0 || hGap > 400) return null;
  if (typeof wGap !== "number" || !Number.isFinite(wGap) || wGap < 0 || wGap > 200) return null;
  return { top: Math.round(top), hGap: Math.round(hGap), wGap: Math.round(wGap) };
}

/** 기억해 둔 창 두께. 아직 잰 적이 없으면 null(그때는 예전 방식으로 연다). */
export function readPopupChrome(): PopupChrome | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return sane(JSON.parse(raw) as Partial<PopupChrome>);
  } catch {
    return null;
  }
}

/** 갓 만든 «우리 오리진(about:blank)» 팝업창에서 두께를 잰다.
 *  ⚠ 교차출처 주소로 이동한 «뒤»에는 못 읽는다. 반드시 이동 전에 부를 것. */
export function measurePopupChrome(win: Window, requested: { top: number }): PopupChrome | null {
  try {
    const measured = sane({
      top: win.screenY - requested.top,
      hGap: win.outerHeight - win.innerHeight,
      wGap: win.outerWidth - win.innerWidth,
    });
    if (!measured) return null;
    window.localStorage.setItem(KEY, JSON.stringify(measured));
    return measured;
  } catch {
    return null; // 못 재도 창은 정상적으로 열린다 — 정렬만 예전 방식이 된다
  }
}
