"use client";

// [2026-09-20 사장님] 「바텀시트 올라오는 모든 메뉴 세로 px 최대치로 키워줘. 전부 동일해야 하고 닫는 방식도 동일하게.」
//   손님 화면 바텀시트 «한 벌» 틀. 15개 시트가 전부 이 틀을 쓴다(표시·닫기 전용 — 담기/제출/저장 로직은 각 시트가 그대로 가짐).
//
//   규격(실측 근거: 2026-09-20 작업기록 «manysell v3.1 분석 · 바텀시트 통일»)
//   · 높이   : 모든 시트 calc(100dvh − 40px) 고정. 내용이 짧아도 같은 높이(위 40px만 뒤 화면이 비침).
//   · 틀     : 최대폭 430 · 모서리 24 · 흰 배경 · 배경막 rgba(0,0,0,.45) · z 100(시트 위 시트 110 · 확인창 120 · 토스트 200)
//   · 헤더   : 그래버 → [제목 17/800 잉크색 + 부제 12/700] + 우상단 ✕ 40px 원형(aria-label="닫기")
//   · 닫기   : ✕ · 배경 탭 · 그래버 끌기 · 안드로이드 뒤로가기(popstate) · ESC — 다섯 가지 전부 requestClose 한 곳으로.
//   · 푸터   : sticky. 풀폭 주 버튼 1개 52px 권장(csPrimaryButtonStyle). 2버튼은 되돌릴 수 없는 결정만, 1:1 · 왼쪽 「취소」.
//   · closeGuard: 입력 중(직접입력·정보수정)인 시트만 닫기 전에 한 번 묻는다. 닫는 «방법»은 같고 안전장치만 더한 것.
//
//   뒤로가기: 열릴 때 history 한 칸(pushState {ruruSheet}) 쌓고, popstate 오면 닫는다. 다른 방법으로 닫히면 그 한 칸만 되돌린다.
//   Next 16 app-router 가 pushState 를 패치해 자기 내부 상태(__NA·tree)를 같이 복사하므로 popstate 로 reload 되지 않는다
//   (node_modules/next/dist/client/components/app-router.js copyNextJsInternalHistoryState 확인, 09-20).

import { useEffect, useId, useRef, type CSSProperties, type ReactNode, type Ref, type UIEvent } from "react";
import SheetGrabber from "./SheetGrabber";

export const CS_SHEET_Z = 100;
export const CS_SHEET_Z_STACKED = 110;
// [2026-09-20 사장님] 「문의는 내용이 별로 없어서 너무 높이면 별로」 → 높이는 딱 2종. 둘 다 고정(내용 따라 들쭉날쭉 없음).
//   full = 화면 − 40px (내용 많은 시트) · half = 화면의 절반 (문의하기·방송알림처럼 짧은 시트)
export const CS_SHEET_HEIGHT = "calc(100dvh - 40px)";
export const CS_SHEET_HEIGHT_HALF = "50dvh";
export type CustomerSheetSize = "full" | "half";
export const CS_SHEET_MAX_WIDTH = "430px";
export const CS_SHEET_BACKDROP = "rgba(0,0,0,0.45)";

// 풀폭 주 버튼(52px). ready=false 면 눌러도 되지만 «아직 준비 안 됨» 색.
export function csPrimaryButtonStyle(ready = true): CSSProperties {
  return {
    width: "100%",
    height: "52px",
    borderRadius: "16px",
    border: "none",
    background: ready ? "#7A1E47" : "#CFC4C8",
    color: "#fff",
    fontSize: "16px",
    fontWeight: 900,
    cursor: "pointer",
  };
}

// 되돌릴 수 없는 결정에서만 쓰는 왼쪽 「취소」(1:1 그리드의 왼쪽 칸).
export const csCancelButtonStyle: CSSProperties = {
  width: "100%",
  height: "52px",
  borderRadius: "16px",
  border: "1px solid #D9C5CC",
  background: "#fff",
  color: "#7A1E47",
  fontSize: "15px",
  fontWeight: 900,
  cursor: "pointer",
};

type Props = {
  open: boolean;
  /** 닫기 5종(✕·배경·그래버·뒤로가기·ESC)이 전부 이 함수로 온다. */
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** ✕ 왼쪽에 놓는 작은 것(예: 「단위 cm」, 개수 알약) */
  headerRight?: ReactNode;
  /** 헤더 아래 고정 띠(브레드크럼·탭). 스크롤되지 않는다. */
  headerBelow?: ReactNode;
  /** sticky 푸터. 없으면 안 그린다. */
  footer?: ReactNode;
  children: ReactNode;
  /** 시트 위에 또 시트를 띄울 때 CS_SHEET_Z_STACKED */
  zIndex?: number;
  /** 본문 padding (기본 14px 16px) */
  bodyPadding?: string;
  bodyStyle?: CSSProperties;
  /** 본문 스크롤 영역에 붙일 data-* 속성(옵션 시트의 data-registered-option-scroll 등) */
  bodyDataAttr?: string;
  ariaLabel?: string;
  /** true 를 돌려주면 닫힌다. 입력 중인 시트가 「지워져요, 닫을까요?」를 묻는 자리. */
  closeGuard?: () => boolean;
  /** 제출 중 등 닫기 자체를 막아야 할 때 */
  closeDisabled?: boolean;
  /** 헤더 왼쪽 「‹」 같은 뒤로 버튼(배송지 관리 → 정보수정). 있으면 제목 앞에 놓인다. */
  headerLeft?: ReactNode;
  /** 본문 스크롤 영역 ref / onScroll (주문조회 무한 스크롤 등) */
  bodyRef?: Ref<HTMLDivElement>;
  onBodyScroll?: (event: UIEvent<HTMLDivElement>) => void;
  /** 높이 2종 중 하나. 기본 full. */
  size?: CustomerSheetSize;
  /** 키보드가 올라온 만큼 시트를 위로(직접입력 시트의 visualViewport 계산값). 0이면 무시. */
  bottomInset?: number;
};

const TITLE_ID_PREFIX = "cs-sheet-title-";

// [2026-09-20 사장님 「제출 후 입금계좌 안내 시트가 사라짐」] 원인: 주문서 시트가 닫히며 되돌린 history.back() 이
//   «비동기»라, 같은 순간 열린 입금안내 시트가 먼저 한 칸을 쌓고 → 그 back 이 입금안내 칸을 빼 버려
//   입금안내가 «손님이 뒤로가기를 눌렀다»고 오해하고 닫혔다.
//   → 우리가 부른 back 은 세어 두고(pendingBacks), 그 popstate 는 «손님 뒤로가기»로 치지 않는다.
//     그 pop 으로 칸을 잃은 시트는 칸을 다시 쌓는다. 또 이미 안 열린 시트의 칸이 맨 위에 남아 있으면
//     새 시트는 push 대신 replace 로 그 칸을 재사용한다(빈 칸이 쌓여 뒤로가기를 두 번 눌러야 하는 일 방지).
const mountedSheetKeys = new Set<string>();
let pendingBacks = 0;
let consumedPopEvent: PopStateEvent | null = null;
let popGuardInstalled = false;
function installPopGuard() {
  if (popGuardInstalled || typeof window === "undefined") return;
  popGuardInstalled = true;
  // 시트들의 popstate 리스너보다 먼저 등록되어 먼저 실행된다(같은 target 은 등록 순서).
  window.addEventListener("popstate", (event) => {
    if (pendingBacks > 0) {
      pendingBacks -= 1;
      consumedPopEvent = event;
    }
  });
}

// [2026-09-20] 시트·가운데 확인창이 같이 쓰는 «닫기 5종 + history 한 칸» 훅.
//   returns requestClose — ✕·배경·그래버·뒤로가기·ESC 가 전부 이걸 부른다.
export function useCustomerOverlayClose(opts: {
  open: boolean;
  onClose: () => void;
  closeGuard?: () => boolean;
  closeDisabled?: boolean;
}): { key: string; requestClose: () => boolean } {
  const { open, onClose, closeGuard, closeDisabled = false } = opts;
  const key = `${TITLE_ID_PREFIX}${useId()}`;

  // 최신 콜백을 ref 로 — 이펙트 재등록 없이 popstate/ESC 에서 최신 함수를 부른다(렌더 중이 아니라 이펙트에서 갱신).
  const onCloseRef = useRef(onClose);
  const guardRef = useRef(closeGuard);
  const disabledRef = useRef(closeDisabled);
  useEffect(() => {
    onCloseRef.current = onClose;
    guardRef.current = closeGuard;
    disabledRef.current = closeDisabled;
  });

  // history 한 칸을 쌓았는지 + 그때의 주소(다른 데로 이동했으면 되돌리지 않는다)
  const pushedRef = useRef(false);
  const pushedHrefRef = useRef("");

  const pushEntry = () => {
    try {
      const top = window.history.state as { ruruSheet?: string } | null;
      const staleTop = Boolean(top?.ruruSheet && top.ruruSheet !== key && !mountedSheetKeys.has(top.ruruSheet));
      if (staleTop) window.history.replaceState({ ruruSheet: key }, "");
      else window.history.pushState({ ruruSheet: key }, "");
      pushedRef.current = true;
      pushedHrefRef.current = window.location.href;
    } catch {
      pushedRef.current = false;
    }
  };

  // 닫기 요청 한 곳: 막힘/가드 검사 후 onClose.
  const requestClose = () => {
    if (disabledRef.current) return false;
    if (guardRef.current && !guardRef.current()) return false;
    onCloseRef.current();
    return true;
  };

  useEffect(() => {
    if (!open) return;
    installPopGuard();
    mountedSheetKeys.add(key);
    pushEntry();

    const onPop = (event: PopStateEvent) => {
      const stillOurs = Boolean((event.state as { ruruSheet?: string } | null)?.ruruSheet === key);
      // 다른 시트가 닫히며 부른 back 이 우리 칸을 빼 간 경우 — 손님 뒤로가기가 아니다. 칸만 다시 쌓는다.
      if (consumedPopEvent === event) {
        if (!stillOurs) { pushedRef.current = false; pushEntry(); }
        return;
      }
      // 우리 칸이 빠져나간 것 = 손님이 뒤로가기를 누른 것. 가드가 막으면 칸을 다시 쌓아 둔다.
      if (stillOurs) return;
      pushedRef.current = false;
      if (!requestClose()) pushEntry();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      mountedSheetKeys.delete(key);
      // ✕·배경·그래버·ESC 로 닫힌 경우: 우리가 쌓은 한 칸이 아직 맨 위에 있으면 그 칸만 되돌린다.
      //   다른 페이지로 이동한 뒤라면(href 가 다르거나 state 가 우리 것이 아니면) 손대지 않는다.
      if (pushedRef.current) {
        pushedRef.current = false;
        try {
          const st = window.history.state as { ruruSheet?: string } | null;
          if (st?.ruruSheet === key && window.location.href === pushedHrefRef.current) {
            pendingBacks += 1;
            window.history.back();
          }
        } catch {
          /* noop */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  return { key, requestClose };
}

export default function CustomerBottomSheet({
  open,
  onClose,
  title,
  subtitle,
  headerRight,
  headerBelow,
  footer,
  children,
  zIndex = CS_SHEET_Z,
  bodyPadding = "14px 16px",
  bodyStyle,
  bodyDataAttr,
  ariaLabel,
  closeGuard,
  closeDisabled = false,
  headerLeft,
  bodyRef,
  onBodyScroll,
  size = "full",
  bottomInset = 0,
}: Props) {
  const { key, requestClose } = useCustomerOverlayClose({ open, onClose, closeGuard, closeDisabled });

  if (!open) return null;

  const bodyProps: Record<string, string> = {};
  if (bodyDataAttr) bodyProps[bodyDataAttr] = "true";

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      style={{ position: "fixed", inset: 0, zIndex, background: CS_SHEET_BACKDROP, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        data-sheet
        role="dialog"
        aria-modal="true"
        aria-labelledby={typeof title === "string" ? key : undefined}
        aria-label={ariaLabel ?? (typeof title === "string" ? undefined : "시트")}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: CS_SHEET_MAX_WIDTH,
          height: bottomInset > 0
            ? `calc(${size === "half" ? CS_SHEET_HEIGHT_HALF : CS_SHEET_HEIGHT} - ${bottomInset}px)`
            : size === "half" ? CS_SHEET_HEIGHT_HALF : CS_SHEET_HEIGHT,
          marginBottom: bottomInset > 0 ? `${bottomInset}px` : undefined,
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: "24px 24px 0 0",
          overflow: "hidden",
          boxShadow: "0 -10px 40px rgba(0,0,0,0.22)",
        }}
      >
        <SheetGrabber onClose={() => { requestClose(); }} style={{ paddingTop: "8px", paddingBottom: "6px", minHeight: "24px" }} />

        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "10px", padding: "0 16px 12px", borderBottom: "1px solid #F0EAE0" }}>
          {headerLeft ? <div style={{ flexShrink: 0 }}>{headerLeft}</div> : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id={key} style={{ fontSize: "17px", fontWeight: 800, color: "#151923", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
            {subtitle ? <div style={{ marginTop: "2px", fontSize: "12px", fontWeight: 700, color: "#7B736D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div> : null}
          </div>
          {headerRight ? <div style={{ flexShrink: 0 }}>{headerRight}</div> : null}
          <button
            type="button"
            onClick={() => { requestClose(); }}
            aria-label="닫기"
            disabled={closeDisabled}
            style={{ flexShrink: 0, width: "40px", height: "40px", borderRadius: "50%", border: "none", background: "#F1ECEE", color: "#444", fontSize: "18px", fontWeight: 800, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", cursor: closeDisabled ? "not-allowed" : "pointer", opacity: closeDisabled ? 0.5 : 1 }}
          >
            ✕
          </button>
        </div>

        {headerBelow ? <div style={{ flexShrink: 0 }}>{headerBelow}</div> : null}

        <div {...bodyProps} ref={bodyRef} onScroll={onBodyScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: bodyPadding, ...bodyStyle }}>
          {children}
        </div>

        {footer ? (
          <div style={{ flexShrink: 0, padding: "12px 16px calc(14px + env(safe-area-inset-bottom))", borderTop: "1px solid #F0EAE0", background: "#fff" }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
