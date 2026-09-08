"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatOrderOptionText } from "@/lib/orderOptionText";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";
import type { LiveOrder } from "./types";
import { resolveOrderItemPhoto } from "@/lib/orderItemPhoto";
// [2026-09-08] 페이스터 주소는 설정 › 상점 정보에서 온다(하드코딩 제거)
import { getShopInfoNow, useShopInfo } from "@/lib/useShopInfo";
// [2026-09-08] 복사 카드를 «항상 맨 위에 뜨는 작은 창»으로 빼내기 (사유·실측근거는 그 파일 상단)
import { usePipWindow, copyTextIn, preopenPipWindow, isPipSupported, getPipWindow } from "@/lib/usePipWindow";
// [2026-09-09] 두 창의 «보이는 상자»를 같게 맞추려면 창 두께를 재야 한다 (근거는 그 파일 상단)
import { readPopupChrome, measurePopupChrome } from "@/lib/windowChrome";

// ═══ 페이스터를 «어떻게» 열 것인가 — 2026-09-08 확정. 다시 뒤집지 말 것 ═══
//
// 이 파일은 iframe ↔ 별도 창 사이를 네 번 오갔다(e0757de → 08f7eeb → 5b95833 →
// 0301f98 → 1fc8464). 원인을 밝히지 않고 «안 되니까 반대로» 바꾸기만 반복한 흔적이다.
//
// 2026-09-08 실측으로 확인한 것 (추측 아님):
//   · iframe 안 → 흰 화면. 아무리 해도 안 그려진다.
//   · 별도 창(opener 끊고) → 페이스터 화면이 «정상»으로 뜬다.
//   · 일반 탭 → 정상.
//   ⇒ 결론은 하나: 페이스터는 «프레임 안»에서는 안 뜨고, «독립된 창»이면 뜬다.
//     (X-Frame-Options 거부 메시지는 없었다. 페이스터 앱 자체가 프레임 안에서
//      안 그려지는 것으로 보인다. 어느 쪽이든 우리가 뚫을 수 없다.)
//
//   ※ 한때 「크롬의 다른 사이트 쿠키 차단 때문」이라고 적었는데 틀렸다.
//     사장님 크롬은 사이트 데이터 저장이 이미 «허용»이었다. 그 설명은 폐기한다.
//
// 그래서 이렇게 한다 — 예전 «왼쪽 복사창 / 오른쪽 페이스터» 모양을 «창»으로 그대로 재현:
//   · 모달 박스 크기는 예전과 «똑같은 px» 이다 — 가로 980(왼쪽 490 + 오른쪽 490),
//     세로 min(1500, 화면높이−16). 50vw·100dvh 처럼 화면따라 늘었다 줄었다 하지 않는다.
//   · 왼쪽 490 = 복사창(모달) / 오른쪽 490 = 그 자리에 페이스터 «창»이 정확히 겹쳐 뜬다.
//   · 창에 «고정 이름»을 준다 → 누를 때마다 같은 창을 다시 쓴다.
//   · 반드시 클릭 제스처 «안에서» 불러야 팝업차단에 안 걸린다.
//
// ※ [2026-09-08 정정] 한때 「이름을 주면 window.opener 가 남아 흰 화면이 된다」고 적어두고
//   이름 없이(noopener) 열었다. 그 진단은 «틀렸다». 실제로 이름을 주고 noopener 없이 열어
//   화면을 확인한 결과, 페이스터가 정상 동작했다(#/payment/smspayment/success 까지 진행됨).
//   그 잘못된 기록 때문에 카드결제를 누를 때마다 «새 창»이 떴고,
//   페이스터 로그인이 창마다 따로라 사장님이 매번 다시 로그인해야 했다.
//     사장님: 「매번 창을 꺼버리면 계속 로그인해야 하는데 로그인 유지 할 수 있는 방법 없어?」
//   → 고정 이름으로 «한 창»만 쓴다. 같은 창이면 로그인이 유지된다.
//
// ※ opener 를 끊지 않는 것의 위험 (검토 후 수용):
//   교차출처라 페이스터가 우리 화면을 «읽지»는 못한다. 할 수 있는 건 opener.location 변경
//   (관리자 탭이 다른 주소로 넘어감) 정도다. 페이스터는 사장님이 실제 결제에 쓰는 도구이고,
//   방송 중 창이 쌓이거나 로그인이 풀리는 쪽이 훨씬 큰 사고라 이쪽을 택한다.

// 박스 치수 — «한 곳»에서만 정한다. 화면(JSX)과 창 위치 계산이 어긋나면 안 되기 때문.
const BOX_W = 980;          // 가로 px (왼쪽 복사창 490 + 오른쪽 페이스터 490)
const BOX_W_RATIO = 0.96;   // 좁은 화면에서만 96vw 로 줄어든다 (예전과 동일)
const BOX_H_MAX = 1500;     // 세로 상한 px (예전과 동일)
const BOX_V_GAP = 16;       // 위아래 8px씩 (예전과 동일)
// 모달이 차지하는 «왼쪽 절반» 폭. 490px 은 여백이 아니라 «자리 좌표»라서 4px 격자와 무관하다.
const HALF_CSS = `min(${BOX_W / 2}px, ${(BOX_W_RATIO * 100) / 2}vw)`;

/** 모달 «오른쪽 절반»(예전 iframe 자리)이 «모니터 좌표»로 어디인지.
 *  창을 그 자리에 정확히 겹쳐 띄우기 위한 값이다. */
function paysterSlotRect() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const boxW = Math.min(BOX_W, vw * BOX_W_RATIO);
  const boxH = Math.min(BOX_H_MAX, vh - BOX_V_GAP);
  const width = Math.round(boxW / 2);
  const height = Math.round(boxH);
  const availW = window.screen?.availWidth || vw;
  const availH = window.screen?.availHeight || vh;
  // 브라우저 «내용 영역»이 모니터의 어디서 시작하나.
  //   보통 outerHeight − innerHeight 가 주소창·탭줄 높이다. 그런데
  //   [2026-09-08 실측] 사장님 크롬은 outerWidth·outerHeight·screenX·screenY 를 «전부 0»으로 준다.
  //   그대로 쓰면 주소창 높이(약 121px)가 통째로 빠져 페이스터 창이 위로 붕 뜬다(실제로 그랬다).
  //   → 0 이면 창이 최대화된 상태로 보고 availHeight − innerHeight 로 대신 구한다.
  const chromeH = window.outerHeight > 0 ? Math.max(0, window.outerHeight - vh) : Math.max(0, availH - vh);
  const originX = window.screenX + (window.outerWidth > vw ? Math.round((window.outerWidth - vw) / 2) : 0);
  const originY = window.screenY + chromeH;
  const left = Math.round(originX + (vw - boxW) / 2 + boxW / 2);
  const top = Math.round(originY + (vh - boxH) / 2);
  // 모니터 밖으로 나가면 잘리므로 안쪽으로 붙인다
  return {
    left: Math.max(0, Math.min(left, availW - width)),
    top: Math.max(0, Math.min(top, availH - height)),
    width,
    height,
  };
}

/** 페이스터 창 이름 — «고정». 이 이름 덕분에 누를 때마다 같은 창을 다시 쓴다.
 *  이름을 빼거나 "_blank" 로 바꾸면 창이 매번 새로 생기고 로그인이 풀린다. 바꾸지 말 것. */
const PAYSTER_WINDOW_NAME = "ruru_payster";

/** 복사창(항상 위) «바로 옆» 자리 — 두 창의 «보이는 상자»가 한치도 안 어긋나게.
 *  [2026-09-08 실측] 복사창은 screenX/screenY/outerWidth/outerHeight 를 «정확히» 알려준다.
 *    (예: 1206 / 259 / 490 / 834 — 운영체제가 보고한 창 위치와 일치)
 *  [2026-09-09 정정] 예전엔 복사창의 outer 값을 window.open 의 «내용영역» 인자로 그대로 넘겼다.
 *    페이스터 창엔 탭줄·주소창이 더 붙으므로 세로가 그만큼 커지고 내용이 아래로 밀렸다(사장님: 「이질감」).
 *    → 창 두께(readPopupChrome)를 빼서 준다. 두께는 페이스터 창을 «처음 만들 때» 재 둔다. */
function rectBesidePip(pipWin: Window) {
  const availW = window.screen?.availWidth || window.innerWidth;

  // 복사창의 «보이는 상자»(outer) 좌표·크기. screenX/Y 는 viewport 기준이라 위 띠만큼 빼서 상자 좌상단을 구한다.
  const pipInnerW = pipWin.innerWidth || Math.round(BOX_W / 2);
  const pipInnerH = pipWin.innerHeight || Math.round(BOX_H_MAX);
  const pipBoxW = pipWin.outerWidth || pipInnerW;
  const pipBoxH = pipWin.outerHeight || pipInnerH;
  const pipTopBar = Math.max(0, pipBoxH - pipInnerH);
  const pipSideBar = Math.max(0, Math.round((pipBoxW - pipInnerW) / 2));
  const boxLeft = pipWin.screenX - pipSideBar;
  const boxTop = pipWin.screenY - pipTopBar;

  // 오른쪽에 같은 크기 상자가 들어가면 오른쪽(예전 배치), 아니면 왼쪽에 붙인다.
  const left = boxLeft + pipBoxW + pipBoxW <= availW ? boxLeft + pipBoxW : Math.max(0, boxLeft - pipBoxW);

  const chrome = readPopupChrome();
  if (!chrome) {
    // 아직 페이스터 창 두께를 못 쟀다(첫 창). 예전 방식으로 열고, 여는 김에 재 둔다 → 다음 창부터 정확해진다.
    return { left, top: boxTop, width: Math.round(BOX_W / 2), height: pipInnerH };
  }
  // ★ 요청값은 «내용 영역» 기준(MDN) → 두께를 빼서 주면 «창 전체»가 복사창과 똑같아진다.
  return {
    left,
    top: boxTop,
    width: Math.max(200, pipBoxW - chrome.wGap),
    height: Math.max(200, pipBoxH - chrome.hGap),
  };
}

/** 페이스터 창을 «정해진 자리»에 연다.
 *  ⚠ 위치는 «창을 처음 만들 때»만 정해진다. 이미 열려 있는 창은 위치를 못 바꾼다
 *    (남의 사이트라 moveTo 가 안 먹는다 — 실측 확인). 그래서 첫 생성 위치가 중요하다. */
let paysterWin: Window | null = null;

/** 페이스터 창이 «지금 살아 있나». 살아 있으면 클릭 권한 없이도 다시 부를 수 있다(실측). */
function paysterAlive() {
  try {
    return !!paysterWin && !paysterWin.closed;
  } catch {
    return false;
  }
}

/** 페이스터 창을 «주소 없이» 잡아서 곧바로 앞으로 부른다.
 *  · 주소를 안 주므로 이동이 없고, 클릭 «열 권한»도 안 닳는다 (2026-09-08 실측 ③)
 *  · 창이 없으면 이 자리·크기로 새로 생긴다. about:blank(우리 오리진)라 창 두께를 잴 수 있다
 *    → 그 값으로 다음 창부터 복사창과 «보이는 상자»가 정확히 같아진다
 *  · ★ focus() 를 «여기서» 부르는 게 핵심 — 사용자 클릭 권한이 아직 살아 있는 순간이라야 창이 올라온다
 *  ⚠ 이름(PAYSTER_WINDOW_NAME)은 그대로. 빼면 창이 매번 새로 생겨 로그인이 풀린다. */
function grabPaysterWindow(r: { left: number; top: number; width: number; height: number }) {
  let win: Window | null = null;
  try {
    win = window.open("", PAYSTER_WINDOW_NAME, `popup=yes,left=${r.left},top=${r.top},width=${r.width},height=${r.height}`);
  } catch {
    win = null;
  }
  if (!win) return null; // 팝업 차단 — 복사창의 「페이스터 창 다시 열기 ↗」로 복구된다
  paysterWin = win;

  let isNewWindow = false;
  try {
    isNewWindow = win.location.href === "about:blank"; // 읽히면 새 창, SecurityError 면 기존 페이스터 창
  } catch {
    isNewWindow = false;
  }
  if (isNewWindow) measurePopupChrome(win, { top: r.top });

  try {
    win.focus(); // 뒤로 숨어 있던 창을 앞으로 (⚠ «최소화»된 창은 웹이 되살릴 방법이 없다)
  } catch {
    /* 포커스는 보조 동작 — 실패해도 창은 떠 있다 */
  }
  return win;
}

function openPaysterAt(url: string, r: { left: number; top: number; width: number; height: number }) {
  const win = grabPaysterWindow(r);
  if (!win) return;
  try {
    win.location.href = url; // 새 창이면 페이스터 로드, 기존 창이면 결제 폼으로 되돌린다
  } catch {
    /* 이동 실패해도 창은 이미 앞에 있다 */
  }
  try {
    win.focus();
  } catch {
    /* 보조 동작 */
  }
}

export function openPayster(url: string) {
  if (typeof window === "undefined") return;
  //   ⚠ 반드시 «클릭 제스처 안에서» 불러야 팝업차단에 안 걸린다.
  //   ⚠ 같은 이름의 창이 이미 있으면 «그 창»이 이 주소로 이동한다(새 창 안 생김 → 로그인 유지).
  const pipWin = getPipWindow();
  openPaysterAt(url, pipWin ? rectBesidePip(pipWin) : paysterSlotRect());
}

/** 복사창(고정식) 크기 — 예전 모달 복사창과 «같은 폭», 세로는 화면 끝까지.
 *  작게 만들지 않는다(사장님 지시). 자동열기와 비상 버튼이 같은 값을 쓰도록 여기 하나로 둔다. */
function pipSize() {
  const availH = (typeof window !== "undefined" && window.screen?.availHeight) || 900;
  return { width: BOX_W / 2, height: Math.min(BOX_H_MAX, availH - 40) };
}

/** 카드결제 버튼에서 호출 — 페이스터 창을 띄운다.
 *  [2026-09-08] 📌 를 한 번 켜두면 여기서 복사창(항상 위)도 «같이» 연다.
 *    브라우저는 «클릭 순간»에만 창을 열어주므로, 팝업이 뜬 뒤에는 자동으로 못 연다.
 *    그래서 주문표 클릭 안인 이 자리에서 미리 열어두고, 팝업이 그 창을 이어받는다.
 *  ⚠ 주문표(LiveOrderTable)의 클릭 «안에서» 불려야 팝업차단에 안 걸린다.
 *  ⚠ 순서 주의 — await 없이 둘 다 «동기적으로» 부른다. */
export function openPaysterRightHalf() {
  const url = getShopInfoNow().paysterUrl;
  const pip = getPipWindow();
  const rect = pip ? rectBesidePip(pip) : paysterSlotRect();

  // ★ [2026-09-09 사장님] 「카드결제 클릭해도 페이스터창 뒤에 가있는거 앞으로 다시 안나옴」
  //   원인: 복사창 열기(requestWindow)가 클릭 «권한»을 먼저 써버려서, 그 뒤의 focus() 가
  //   사용자 조작 없이 실행돼 창이 안 올라왔다.
  //   [2026-09-08 실측 ③] «주소 없이» 참조 + focus() 는 열 권한을 «안 닳게» 한다.
  //   → 순서를 ① 페이스터를 잡아 앞으로 → ② 복사창에 권한 사용 → ③ 결제 폼으로 이동 으로 바꾼다.
  //   ⚠ ③(이동)을 ② 뒤에 두는 것이 중요하다. 주소를 먼저 주면 권한이 닳아 복사창이 막힌다(실측 ②).
  const win = grabPaysterWindow(rect); // ① 권한 안 씀 + focus

  if (isPipSupported() && !pip) {
    // ② 클릭 권한은 «없는 창»(복사창)에 쓴다. 화면에는 복사창 하나만 뜬다.
    const size = pipSize();
    void preopenPipWindow(size.width, size.height);
  }

  if (win) {
    // ③ 결제 폼으로 (기존 창이면 이동, 방금 만든 창이면 첫 로드)
    try {
      win.location.href = url;
    } catch {
      /* 이동 실패해도 창은 이미 앞에 있다 */
    }
  }
}

type Props = {
  order: LiveOrder;
  onClose: () => void;
  onAfterStatusChange?: () => void | Promise<void>;
};

function orderSummary(order: LiveOrder) {
  const items = Array.isArray(order.items) ? order.items : [];
  const first = items[0]?.productName?.trim() || "상품";
  return items.length > 1 ? `${first} 외 ${items.length - 1}건` : first;
}

function cardAmount(order: LiveOrder) {
  return Number(order.cardPaymentTotalAmount || 0) || Number(order.totalAmount || 0);
}

function phoneDigits(order: LiveOrder) {
  return String(order.phone || "").replace(/[^0-9]/g, "");
}

export default function AdminLiveCardPayPopup({ order, onClose, onAfterStatusChange }: Props) {
  const { paysterUrl } = useShopInfo();
  // 「항상 맨 위에 뜨는 작은 창」 — 페이스터 창이 뒤로 밀리지 않게 복사 카드만 빼낸다
  const pip = usePipWindow();
  const [copiedKey, setCopiedKey] = useState("");
  const [saving, setSaving] = useState(false);
  // [2026-08-29] 카톡으로 결제링크 보낸 뒤, 유튜브 채팅에 자동 안내
  // [2026-08-29 사장님 요청] 페이스터는 남의 사이트라 자동 입력이 안 된다(브라우저 동일출처 정책).
  //   예전: 상품명·금액·닉네임·전화번호를 1→2→3→4 순서로 네 번 복사해야 했다.
  //   지금: 닉네임과 상품명을 하나로 합쳐서 "한 번만" 복사한다. 닉네임이 앞에 온다(매칭 기준).
  //         금액·전화번호는 페이스터에서 입력칸이 따로라 합칠 수 없어 보조 복사로 남긴다.
  const amount = cardAmount(order);
  const summary = orderSummary(order);
  // [2026-08-31 사장님 요청] 팝업 가운데 빈 공간에 "이 주문 내용" 확인 카드 — 표시 전용, 데이터 무변경
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const baseAmount = Number(order.totalAmount || 0); // 상품금액 + 배송비
  const cardExtra = Number(order.cardExtraAmount || 0) || Math.max(0, amount - baseAmount);
  // [2026-08-31 사장님 요청] 확인 카드에 상품 사진 — 주문상세 서랍과 같은 방식(세부상품 사진 → 대표사진 폴백). 표시 전용.
  const [itemImages, setItemImages] = useState<Record<string, string>>({});
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  useEffect(() => {
    let stopped = false;
    const ids = Array.from(new Set(orderItems.map((it) => String(it.productId || "").trim()).filter(Boolean)));
    if (ids.length === 0) { setItemImages({}); return; }
    (async () => {
      try {
        const { data } = await supabase.from("products").select("*").in("id", ids);
        if (stopped || !Array.isArray(data)) return;
        const byId = new Map<string, Record<string, unknown>>();
        for (const p of data as Record<string, unknown>[]) byId.set(String((p as { id?: unknown }).id ?? ""), p);
        const next: Record<string, string> = {};
        for (const it of orderItems) {
          const pid = String(it.productId || "").trim();
          if (!pid) continue;
          const prow = byId.get(pid);
          if (!prow) continue;
          // [2026-08-31] 사진 매칭은 공용 규칙(lib/orderItemPhoto) 하나만 쓴다 —
          //   이름 수정·코드·괄호 차이까지 흡수, 못 찾으면 엉뚱한 사진 대신 표시 안 함.
          const r = resolveOrderItemPhoto(prow as Record<string, unknown>, {
            productName: it.productName,
            color: (it as { color?: string }).color,
          });
          if (r.url) next[String(it.id)] = r.url;
        }
        setItemImages(next);
      } catch { /* 사진은 보조 표시 — 실패해도 팝업은 정상 */ }
    })();
    return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);
  const phone = phoneDigits(order);
  const nickname = String(order.nickname || "").trim();

  // 페이스터 「상품명」 칸에 그대로 붙여넣는 값 — 닉네임 먼저, 뒤에 상품명
  const pasteValue = [nickname, summary].filter(Boolean).join(" ");

  // [2026-08-30 사장님 확인] 카드결제 링크는 "돈 내는 사람"에게 간다.
  //   받는 곳이 본인 집이 아닐 수 있지만(선물·다른 집 수령 등) 결제는 계정 주인이 한다.
  //   order.phone = 주문자 번호, order.recipientPhone = 택배 받는분 번호 (별개)
  // [2026-08-31 사장님 지시] 복사 순서: 1 결제금액 → 2 상품명 → 3 주문자 번호 (숫자키도 이 순서)
  const fields: { key: string; label: string; value: string; hint?: string; highlight?: boolean }[] = [
    { key: "amount", label: "결제금액", value: String(amount), hint: "카드 7% 포함" },
    { key: "paste", label: "상품명 칸", value: pasteValue, hint: "닉네임 + 상품명" },
    { key: "phone", label: "주문자 번호", value: phone, hint: "결제하는 분 · - 없이" },
  ];

  // [2026-08-31 실사고] 손님이 주문자 번호를 바꿔 주문하면 주문에는 옛 번호가 남아,
  //   카드결제 링크가 손님이 안 쓰는 번호로 나갔다(루루짱929 님 건).
  //   → 받는분 번호가 다르면 그것도 복사할 수 있게 같이 보여준다. 사장님이 골라 쓰면 된다.
  const recipientPhoneForPick = String((order as { recipientPhone?: string | null }).recipientPhone || "").replace(/[^0-9]/g, "");
  if (recipientPhoneForPick && recipientPhoneForPick !== phone) {
    fields.push({ key: "recipientPhone", label: "받는분 번호", value: recipientPhoneForPick, hint: "주문자 번호와 다름 · 확인 후 사용" });
  }

  // [2026-08-30] 집·사무실 전화(02 등)로도 주문할 수 있게 열었다.
  //   카드결제 링크는 문자로 가므로 휴대폰이 아니면 발송이 안 된다.
  //   → 관리자가 링크를 만들기 전에 눈으로 알 수 있게 경고를 띄운다.
  //   ⚠️ 주문·금액·입금·정산은 건드리지 않는다. 화면 경고만.
  const phoneIsMobile = /^01[016789][0-9]{7,8}$/.test(phone);
  const recipientPhoneDigits = String((order as { recipientPhone?: string | null }).recipientPhone || "").replace(/[^0-9]/g, "");
  const recipientIsMobile = /^01[016789][0-9]{7,8}$/.test(recipientPhoneDigits);

  // [2026-09-08] 복사는 «클릭이 일어난 창»에서 해야 한다.
  //   작은 창(항상 위)에서 눌렀는데 관리자 창의 클립보드를 쓰면 «포커스 없음»으로 거부된다.
  //   sourceWindow 를 안 주면 예전과 똑같이 관리자 창에서 복사한다.
  const copyValue = async (key: string, value: string, sourceWindow?: Window | null) => {
    const ok = await copyTextIn(sourceWindow || pip.pipWindow || window, value);
    if (!ok) {
      showAdminToast("복사 실패 — 길게 눌러 직접 복사해주세요.", "warning");
      return;
    }
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((k) => (k === key ? "" : k)), 1500);
  };

  // 칸 하나를 바로 복사한다(순서·단계 없음).
  const copyFieldValue = async (index: number, sourceWindow?: Window | null) => {
    const field = fields[index];
    if (!field || !field.value) return;
    await copyValue(field.key, field.value, sourceWindow);
  };

  // 숫자키 1~4 로도 복사 (마우스 안 옮기고 붙여넣기만 반복할 수 있게)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const tag = String(el?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || el?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = ["1", "2", "3", "4"].indexOf(event.key);
      if (index < 0) return;
      event.preventDefault();
      void copyFieldValue(index);
    };
    // 📌 켜져 있으면 키 입력이 «그 창»으로 가므로 양쪽 다 듣는다
    const targets: Window[] = pip.pipWindow ? [window, pip.pipWindow] : [window];
    targets.forEach((t) => t.addEventListener("keydown", onKey));
    return () => targets.forEach((t) => t.removeEventListener("keydown", onKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, pip.pipWindow]);

  // [2026-08-31 사장님 지시] 유튜브 채팅 자동 게시는 쿼터를 먹는다(봇 글 하루 상한 공유)
  //   → 안내문구를 복사만 해주고, 유튜브 채팅에는 사장님이 직접 붙여넣는다. (금액·전화번호는 공개 채팅이라 안 넣음)
  const chatNoticeText = `💳 ${order.nickname}님 카카오톡으로 카드결제 링크 보내드렸어요! 📩 확인 부탁드려요 🙏`;

  // 결제완료처리: LiveOrderDetailDrawer.handleCardPaymentStatusChange와 동일 패턴(주문상태만 변경, 금액/배송/송장 로직 무변경)
  const handleComplete = async () => {
    const items = Array.isArray(order.items) ? order.items : [];
    const rowIds = items.map((i) => Number(i.id)).filter((id) => Number.isFinite(id));

    if (rowIds.length === 0) {
      showAdminToast("상태 변경할 주문 ID가 없습니다.", "warning");
      return;
    }

    const ok = await showAdminConfirm(
      [
        "카드결제완료 처리할까요?",
        "",
        "실제 카드결제가 확인된 경우에만 진행하세요.",
        "주문상태만 카드결제완료로 변경합니다.",
      ].join("\n"),
    );

    if (!ok) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          admin_order_status_v2: "카드결제완료",
          order_manage_status: "카드결제완료",
        })
        .in("id", rowIds);

      if (error) {
        showAdminToast("카드결제 상태 변경 실패\n\n" + error.message, "error");
        return;
      }

      showAdminToast("카드결제완료 처리됐습니다.", "success");
      await onAfterStatusChange?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // ── 복사창은 «한 벌»만 만든다 ────────────────────────────────────────
  //   [2026-09-08 사장님] 「그냥 원래 왼쪽 복사창을 띄어놓는 느낌으로 만들면 안되는건지?
  //     굳이 왜 따로 작은창을 띄어놓게 설계함?」 — 맞는 지적이라 고쳤다.
  //
  //   창을 따로 띄우는 것 자체는 피할 수 없다 — 브라우저에서 «항상 맨 위»가 되는 건
  //   별도 창뿐이고, 페이지 안의 패널은 아무리 해도 페이스터 창 위로 못 올라간다.
  //   하지만 «화면»을 새로 그릴 이유는 없었다. 아래 복사창 하나를 만들어서
  //     · 평소     → 팝업(모달) 안에
  //     · 📌 켜면  → 항상 맨 위에 뜨는 창 안에
  //   둘 중 «한 곳»에만 그린다. 그래서 두 화면의 생김새가 갈라질 수 없다.
  const copyPanel = (
    // [2026-09-09 사장님 지적] 「글씨 다 깨지는거 안보임?」
    //   원인: 바깥에 overflowY:auto 를 두고 안쪽 카드에 flex-1 을 줬더니, 창이 짧을 때
    //   스크롤이 안 생기고 «카드 안이 잘려» 합계 줄과 아래 버튼이 겹쳐 보였다.
    //   → 본문만 스크롤하고, 결제 버튼 두 개는 아래에 «고정»한다. 이제 어떤 창 높이에서도 안 잘린다.
    <div style={{ width: "100%", height: "100%", background: "#F4F6FB", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ background: "#101C3D" }}>
          <span className="text-[16px] font-black text-white">💳 카드결제 — {order.nickname}</span>
          <button type="button" onClick={onClose} className="text-xl leading-none text-white/60 hover:text-white">
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-3 pt-5">
          {/* [2026-08-31 사장님 확인] 맨 위 큰 복사 버튼은 2번 칸과 같은 값이라 삭제 — 1·2·3 카드로 통일 */}
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] font-bold" style={{ color: "#5A6B92" }}>
            <span>오른쪽 페이스터 창에 1 → 2 → 3 순서대로 붙여넣으세요 (숫자키 1~4) · 페이스터 창은 <b>최소화하지 마세요</b></span>
            {/* [2026-09-08] 페이스터 창을 실수로 닫았을 때 다시 여는 길. 화면 오른쪽 절반에 뜬다. */}
            <button type="button" onClick={() => openPayster(paysterUrl)} className="ru-btn ru-btn-sm" title="페이스터 창을 화면 오른쪽 절반에 다시 엽니다">
              페이스터 창 다시 열기 ↗
            </button>
            {/* [2026-09-09 사장님 지시] 켜기/끄기 토글(📌) 삭제 — 복사창은 «항상 고정식 하나»가 기준.
                  이 버튼은 그 창을 «못 열었을 때»(팝업차단 등)만 보이는 비상 복구 버튼이다.
                  누르면 자기 클릭 권한으로 복사창을 열고, 이 페이지 모달은 사라진다. */}
            {pip.supported && !pip.pipWindow ? (
              <button
                type="button"
                onClick={() => {
                  const s = pipSize();
                  void pip.open(s.width, s.height);
                }}
                className="ru-btn ru-btn-sm"
                title="복사창을 «항상 맨 위에 뜨는 독립 창»으로 띄웁니다. 페이스터 창이 뒤로 밀리지 않습니다."
              >
                📌 복사창 띄우기 ↗
              </button>
            ) : null}
          </div>

          <div className="space-y-3">
            {!phoneIsMobile && phone ? (
              <div className="rounded-xl border border-warn-tx/35 bg-warn-bg px-3 py-2.5 text-[12px] font-bold leading-relaxed text-warn-tx">
                ⚠️ 주문자 번호가 휴대폰이 아닙니다 ({phone}) — 결제링크 문자가 가지 않습니다.
                {recipientIsMobile ? (
                  <> 배송지 연락처 <b>{recipientPhoneDigits}</b> 로 보내거나, 카카오톡으로 링크를 직접 보내주세요.</>
                ) : (
                  <> 카카오톡으로 링크를 직접 보내거나, 손님께 휴대폰 번호를 여쭤보세요.</>
                )}
              </div>
            ) : null}
            {fields.map((f, fieldIndex) => (
              <div
                key={f.key}
                className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 shadow-sm"
                style={{ border: f.highlight ? "1.5px solid #2B6BEB" : "1px solid #DDE4F2" }}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-black text-white" style={{ background: f.highlight ? "#2B6BEB" : "#8B99BC" }}>{fieldIndex + 1}</span>
                <div className="w-[70px] shrink-0">
                  <div className="text-[12px] font-black" style={{ color: f.highlight ? "#2B6BEB" : "#5A6B92" }}>{f.label}</div>
                  {f.hint ? <div className="text-[11px] font-bold" style={{ color: "#8B99BC" }}>{f.hint}</div> : null}
                </div>
                <div className="min-w-0 flex-1 truncate text-[14px] font-black" style={{ color: "#101C3D" }}>
                  {f.value || <span style={{ color: "#8B99BC" }}>없음</span>}
                </div>
                <button
                  type="button"
                  onClick={() => void copyFieldValue(fieldIndex)}
                  disabled={!f.value}
                  className="h-9 shrink-0 rounded-lg px-3 text-[12px] font-black transition disabled:opacity-40"
                  style={copiedKey === f.key ? { background: "#059669", color: "#fff" } : { background: "#EAF0FE", color: "#2B6BEB", border: "1px solid #BFD2F8" }}
                >
                  {copiedKey === f.key ? "복사됨" : "⧉ 복사"}
                </button>
              </div>
            ))}
          </div>

          {/* [2026-08-31 사장님 요청] 가운데 빈 공간 활용 — 결제 전에 주문·금액을 눈으로 검산 (표시 전용) */}
          <div className="mt-4 flex flex-col rounded-2xl bg-white px-4 py-3.5 shadow-sm" style={{ border: "1px solid #DDE4F2" }}>
            <div className="mb-2 shrink-0 text-[12px] font-black" style={{ color: "#5A6B92" }}>🧾 이 주문 내용 — 결제 전에 확인하세요</div>
            <div className="space-y-1.5">
              {/* [2026-09-09 사장님 지적] 복사창에서 이 칸이 «비어» 있었다. 원인은 order.items 가 빈 주문.
                    빈 칸으로 두면 화면이 고장 난 것처럼 보이고, 결제 전 검산도 못 한다.
                    → 왜 비었는지 화면에 말해 준다. ⚠ 표시 전용 — 금액·돈 처리와 무관(아래 합계는 그대로). */}
              {orderItems.length === 0 ? (
                <div className="rounded-xl px-3 py-2.5 text-[12px] font-bold leading-relaxed" style={{ background: "#FFF7E6", color: "#8A5A00", border: "1px solid #F0DCB0" }}>
                  ⚠️ 이 주문에 <b>상품 내역이 없습니다.</b> 아래 합계 금액만 확인하시고, 무슨 상품인지는 <b>주문상세</b>에서 봐주세요.
                </div>
              ) : null}
              {orderItems.map((item, itemIndex) => {
                const opt = formatOrderOptionText(item.color, item.size);
                return (
                  <div key={itemIndex} className="flex items-center justify-between gap-2 text-[13px] font-bold" style={{ color: "#101C3D" }}>
                    {itemImages[String(item.id)] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={itemImages[String(item.id)]} alt="" onClick={() => setImagePreviewUrl(itemImages[String(item.id)])} className="h-9 w-9 shrink-0 cursor-zoom-in rounded-lg object-cover" style={{ border: "1px solid #DDE4F2" }} />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[14px]" style={{ background: "#F4F6FB" }}>🛍</span>
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {item.productName}
                      {opt ? ` (${opt})` : ""}
                      {Number(item.qty) > 1 ? ` ×${item.qty}` : ""}
                    </span>
                    <span className="shrink-0" style={{ color: "#5A6B92" }}>{Number(item.amount || 0).toLocaleString()}원</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2.5 shrink-0 space-y-1 border-t pt-2.5 text-[12px] font-bold" style={{ borderColor: "#EAF0FE", color: "#5A6B92" }}>
              <div className="flex justify-between"><span>상품금액 + 배송비</span><span>{baseAmount.toLocaleString()}원</span></div>
              <div className="flex justify-between"><span>카드 추가금</span><span style={{ color: "#7C3AED" }}>+{cardExtra.toLocaleString()}원</span></div>
              <div className="flex justify-between text-[14px] font-black" style={{ color: "#2B6BEB" }}><span>카드 결제금액</span><span>{amount.toLocaleString()}원</span></div>
            </div>
          </div>

        </div>

        {/* [2026-09-09] 결제 버튼은 «항상 보이게» 아래 고정. 위 본문만 스크롤한다. */}
        <div className="shrink-0 px-5 pb-5 pt-3" style={{ background: "#F4F6FB", borderTop: "1px solid #E3E9F5" }}>
          <button
            type="button"
            onClick={() => void copyValue("chatNotice", chatNoticeText)}
            title="카카오톡으로 결제링크를 보낸 뒤 누르세요. 안내문구가 복사되고, 유튜브 채팅에 붙여넣기만 하면 됩니다. (자동 게시 안 함 — 쿼터 무소모)"
            className="w-full rounded-2xl px-4 py-3.5 text-sm font-black shadow-md transition"
            style={copiedKey === "chatNotice" ? { background: "#059669", color: "#fff" } : { background: "#101C3D", color: "#fff" }}
          >
            {copiedKey === "chatNotice" ? "✔ 복사됨 · 유튜브 채팅에 붙여넣기" : "📢 카톡 발송완료 안내문구 복사"}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={handleComplete}
            className="mt-2.5 w-full rounded-2xl bg-[var(--color-ok-tx)] px-4 py-3.5 text-sm font-black text-white shadow-md transition hover:bg-[var(--color-ok-tx)] disabled:bg-surface-3"
          >
            {saving ? "처리 중…" : "✔ 카드결제완료 처리"}
          </button>

        </div>
    </div>
  );

  // [2026-09-09 사장님 지적] 「복사창 X 누르면 왜 또 뒤에 뭐가 숨어있어?」
  //   원인: 복사창이 닫히면 pip.pipWindow 가 null 이 되어 아래 «페이지 모달»이 그대로 드러났다.
  //   → 복사창 ✕ = 이 주문 카드결제 «종료». 뒤에 아무것도 남기지 않는다.
  //   ⚠ 돈 처리(handleComplete)와는 무관하다. 화면을 닫을 뿐이다.
  const hadPipRef = useRef(false);
  useEffect(() => {
    if (pip.pipWindow) {
      hadPipRef.current = true;
      return;
    }
    if (hadPipRef.current) {
      hadPipRef.current = false;
      onClose();
    }
  }, [pip.pipWindow, onClose]);

  const imagePreview = imagePreviewUrl ? (
    <div onClick={() => setImagePreviewUrl("")} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imagePreviewUrl} alt="상품 사진 크게 보기" style={{ maxHeight: "85vh", maxWidth: "90vw", borderRadius: "16px", objectFit: "contain" }} />
    </div>
  ) : null;

  // [2026-09-09] 복사창을 «여는 중»에는 아무것도 그리지 않는다.
  //   예전엔 이 사이에 페이지 모달이 한 번 그려졌다가 복사창으로 바뀌어, 두 벌처럼 보였다.
  if (pip.pending) return null;

  // 복사창이 열려 있으면 «그 창에만» 그린다. 페이지 모달은 안 그린다(두 벌이 되지 않게).
  if (pip.pipWindow) {
    return createPortal(
      <div style={{ width: "100%", height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden", background: "#F4F6FB" }}>
        {copyPanel}
        {imagePreview}
      </div>,
      pip.pipWindow.document.body,
    );
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {/* [2026-08-31 사장님 지시] 세로는 화면 거의 끝까지(위아래 8px만), 왼쪽은 페이스터풍 네이비·블루로
          위 쏠림 없이 세로 공간을 나눠 쓴다(헤더 → 복사 카드들 → (여백) → 하단 액션). */}
      {/* [2026-09-08 사장님] 「옆에 안뜨는데 저 안뜨는 부분은 삭제 하던지」 — 오른쪽 빈칸을 없앴다.
            페이스터는 프레임 안에서 안 그려진다(실측). 창으로만 뜨는데, 그 창이 뒤로 숨으면
            오른쪽 칸이 «빈 흰 판»으로 남아 고장 난 것처럼 보였다. 그래서 칸 자체를 삭제한다.
            모달 크기·자리는 그대로다 — 예전 박스(가로 980)의 «왼쪽 490 자리»를 그대로 차지한다.
              width       = 490 (예전 왼쪽 칸과 같은 px)
              marginRight = 490 → 가운데 정렬했을 때 왼쪽 절반 자리에 딱 앉는다
              (좁은 화면에서는 예전 maxWidth:96vw 와 같은 비율로 48vw 까지 줄어든다)
            ⚠ pointerEvents 는 건드리지 않는다 — 예전에 그것 때문에 X 버튼이 안 눌렸다. */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "row", width: HALF_CSS, marginRight: HALF_CSS, height: `min(${BOX_H_MAX}px, calc(100dvh - ${BOX_V_GAP}px))`, borderRadius: "16px", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        {copyPanel}
      </div>
      {imagePreview}
    </div>
  );
}
