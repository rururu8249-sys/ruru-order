"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";

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
    let stopped = false;

    const send = async () => {
      if (stopped) return;

      const visitorKey = getOrCreateVisitorKey();
      if (!visitorKey) return;

      try {
        await fetch("/api/admin-live/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            visitorKey,
            pageType,
            path: pathname,
            nickname: getNickname(),
          }),
        });
      } catch {
        // presence는 운영 보조 기능이므로 실패해도 화면 흐름을 막지 않습니다.
      }
    };

    void send();
    const timer = window.setInterval(send, 30000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pathname, pageType]);

  return null;
}
