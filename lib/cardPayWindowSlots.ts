// ═══ 카드결제 «두 창 나란히» 자리 계산 — 2026-09-22 B안 ═══
//
//   왼쪽 = 복사창(우리 팝업 창) 490 / 오른쪽 = 페이스터 창 490. 둘을 «겹치지 않게» 붙인다.
//   겹치지 않아야 복사창을 눌러도 페이스터가 뒤로 안 밀린다(창은 눌린 것만 앞으로 온다).
//
//   · 위치는 «모니터»(screen.avail*) 기준이다. 관리자 창의 outerWidth/screenX 는
//     사장님 크롬에서 전부 0 이라 쓰면 안 된다(2026-09-08 실측).
//   · window.open 의 width/height 는 «내용 영역», left/top 은 «창 바깥 좌상단» 이다(MDN).
//     두 창 다 «팝업»이라 위 띠 두께가 같다 → 같은 top·height 를 주면 바깥 상자가 똑같이 맞는다.
//   · 순수 함수라 테스트한다(scripts/test-card-pay-window-slots.mjs).

export const CARD_PAY_PANE_W = 490;      // 예전 좌우분할 박스(980)의 절반. 바꾸지 말 것
export const CARD_PAY_PANE_H_MAX = 1500; // 세로 상한(예전과 동일)
export const CARD_PAY_TOP_GAP = 20;      // 모니터 위에서 띄우는 여백
export const CARD_PAY_CHROME_H = 110;    // 팝업 창 위 띠(제목줄+주소줄) + 아래 여유. 내용 높이에서 뺀다

export type WindowRect = { left: number; top: number; width: number; height: number };

export type ScreenAvail = { availWidth: number; availHeight: number; availLeft?: number; availTop?: number };

/** 왼쪽(복사창)·오른쪽(페이스터) 두 자리. 두 창을 합친 980 을 모니터 가운데에 둔다. */
export function cardPayWindowSlots(s: ScreenAvail): { copy: WindowRect; payster: WindowRect } {
  const availW = Math.max(0, Math.round(s.availWidth || 0));
  const availH = Math.max(0, Math.round(s.availHeight || 0));
  const baseX = Math.round(s.availLeft || 0);
  const baseY = Math.round(s.availTop || 0);

  // 모니터가 980 보다 좁으면 두 창을 절반씩(최소 320)으로 줄인다
  const width = Math.max(320, Math.min(CARD_PAY_PANE_W, Math.floor(availW / 2)));
  const height = Math.max(400, Math.min(CARD_PAY_PANE_H_MAX, availH - CARD_PAY_CHROME_H));
  const left = baseX + Math.max(0, Math.round((availW - width * 2) / 2));
  const top = baseY + CARD_PAY_TOP_GAP;

  return {
    copy: { left, top, width, height },
    payster: { left: left + width, top, width, height },
  };
}

/** window.open 세 번째 인자 문자열. popup=yes 가 있어야 «창»(탭 아님)으로 뜬다. */
export function popupFeatures(r: WindowRect): string {
  return `popup=yes,left=${r.left},top=${r.top},width=${r.width},height=${r.height}`;
}
