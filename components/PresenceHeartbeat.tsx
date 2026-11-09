"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { PRESENCE_ACTIVITY_EVENT, readPresenceActivity, readPresenceEvents } from "@/lib/presenceActivity";

function getOrCreateVisitorKey() {
  if (typeof window === "undefined") return "";

  const keyName = "ruru_visitor_presence_key";
  const existing = window.localStorage.getItem(keyName);
  if (existing) return existing;

  const created =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.localStorage.setItem(keyName, created);
  return created;
}

function getNickname() {
  if (typeof window === "undefined") return "";

  return (
    window.localStorage.getItem("ruru_youtube_nickname") ||
    window.localStorage.getItem("ruru_customer_nickname") ||
    window.localStorage.getItem("ruru_order_nickname") ||
    ""
  );
}

// [2026-08-31] 손님이 마지막으로 담은 상품 — 주문 페이지가 담는 순간 기록. 10분 지나면 옛 정보라 안 보냄.
function getViewingProduct() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("ruru_viewing_product");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { name?: unknown; at?: unknown };
    const at = Number(parsed?.at) || 0;
    if (!at || Date.now() - at > 10 * 60 * 1000) return "";
    return String(parsed?.name || "").trim().slice(0, 80);
  } catch { return ""; }
}

// [2026-11-09] 카카오 계정(고객 식별 키) — 관리자 「지금 접속」이 장바구니·오늘 주문을 정확히 붙이려고. 로그인 전엔 빈값.
function getKakaoId() {
  if (typeof window === "undefined") return "";
  try { return String(window.localStorage.getItem("ruru_kakao_id") || "").trim(); } catch { return ""; }
}

function detectPageType(pathname: string) {
  if (pathname.startsWith("/order")) return "order_form";
  if (pathname.startsWith("/myorder")) return "order_lookup";
  if (pathname.startsWith("/group-buy")) return "group_buy";
  if (pathname.startsWith("/admin")) return "admin";
  return "page";
}

export default function PresenceHeartbeat() {
  const pathname = usePathname() || "/";

  const pageType = useMemo(() => detectPageType(pathname), [pathname]);

  useEffect(() => {
    // OBS/embedded display routes share the parent's visitor key. They must
    // never overwrite admin/customer presence or create visitor history.
    if (/^\/event-(survival|race|roulette|claw|mission)(\/|$)/.test(pathname)) return;
    let stopped = false;

    const send = async () => {
      if (stopped) return;

      const visitorKey = getOrCreateVisitorKey();
      if (!visitorKey) return;

      // [2026-08-29 수정] 예전에는 /api/admin-live/presence 로 보냈다.
      //   그 주소는 middleware 가 관리자 전용으로 막고 있어서 손님 신호가 401 로 전부 튕겼고,
      //   그래서 관리자 브라우저 1개만 잡혀 "지금 접속 1명" 에서 멈춰 있었다.
      //   → 손님도 통과하는 공개 쓰기 주소 /api/presence 로 보낸다.
      try {
        await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            visitorKey,
            pageType,
            path: pathname,
            nickname: getNickname(),
            viewingProduct: getViewingProduct(),
            kakaoId: getKakaoId(),
            activity: readPresenceActivity(),
            // [2026-11-09] 최근 동작 목록(최근 30개·3시간) — 같은 신호에 실어 보내 요청 수는 그대로
            events: readPresenceEvents(),
          }),
        });
      } catch {
        // presence는 운영 보조 기능이므로 실패해도 화면 흐름을 막지 않습니다.
      }
    };

    void send();
    const timer = window.setInterval(send, 30000);

    // [2026-11-09] 손님이 옵션 창을 열거나 담거나 주문서를 열면 30초를 기다리지 않고 바로 알린다(3초에 한 번으로 묶음 — 요청 폭주 방지).
    let lastQuick = 0;
    let quickTimer: number | null = null;
    const onActivity = () => {
      const wait = Math.max(0, 3000 - (Date.now() - lastQuick));
      if (quickTimer !== null) return;
      quickTimer = window.setTimeout(() => { quickTimer = null; lastQuick = Date.now(); void send(); }, wait);
    };
    window.addEventListener(PRESENCE_ACTIVITY_EVENT, onActivity);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      if (quickTimer !== null) window.clearTimeout(quickTimer);
      window.removeEventListener(PRESENCE_ACTIVITY_EVENT, onActivity);
    };
  }, [pathname, pageType]);

  return null;
}
