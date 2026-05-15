// app/components/AdminRealtimeOrderAlert.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/components/AdminRealtimeOrderAlert.tsx
//
// 기능:
// - 관리자 페이지(/admin)에서만 작동
// - orders 신규 주문 실시간 감지
// - 신규 주문 화면 팝업
// - 알림 소리 ON/OFF
// - 브라우저 데스크톱 알림 지원
// - 1.5초 후 자동 새로고침
//
// 사용 조건:
// - 관리자 페이지 탭은 열려 있어야 합니다.
// - 처음 1회 "주문 알림켜기" 클릭 시 브라우저 알림 권한을 허용해야 합니다.
// - Mac 시스템 설정에서 사용 중인 브라우저 알림이 허용되어 있어야 합니다.

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

type NewOrder = {
  id?: number | string;
  youtube_nickname?: string;
  customer_name?: string;
  customer_phone?: string;
  product_name?: string;
  color?: string;
  size?: string;
  qty?: number;
  total_price?: number;
  adjusted_total_price?: number;
  payment_method?: string;
  order_lookup_code?: string;
};

export default function AdminRealtimeOrderAlert() {
  const pathname = usePathname();
  const isAdminPage = pathname?.startsWith("/admin");

  const [enabled, setEnabled] = useState(false);
  const [newOrder, setNewOrder] = useState<NewOrder | null>(null);
  const [status, setStatus] = useState<"idle" | "connected" | "error">("idle");
  const [notificationPermission, setNotificationPermission] = useState<
    "default" | "granted" | "denied" | "unsupported"
  >("default");

  const audioContextRef = useRef<AudioContext | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formatWon = (value: number | undefined) =>
    `${Number(value || 0).toLocaleString()}원`;

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    setNotificationPermission(Notification.permission);
  }, []);

  const playBeep = () => {
    try {
      const context = audioContextRef.current;
      if (!context || !enabled) return;

      const makeTone = (frequency: number, delay: number) => {
        setTimeout(() => {
          const osc = context.createOscillator();
          const gain = context.createGain();

          osc.type = "sine";
          osc.frequency.setValueAtTime(frequency, context.currentTime);

          gain.gain.setValueAtTime(0.001, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.35, context.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.3);

          osc.connect(gain);
          gain.connect(context.destination);

          osc.start(context.currentTime);
          osc.stop(context.currentTime + 0.32);
        }, delay);
      };

      makeTone(880, 0);
      makeTone(1175, 160);
    } catch {
      // 소리 실패 시 화면 알림만 유지
    }
  };

  const showDesktopNotification = (order: NewOrder) => {
    try {
      if (typeof window === "undefined") return;
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;

      const title = "🛒 루루동이 신규 주문";
      const optionText = [order.color, order.size].filter(Boolean).join(" / ");

      const body = [
        `닉네임: ${order.youtube_nickname || "-"}`,
        `주문자: ${order.customer_name || "-"}`,
        `상품: ${order.product_name || "-"}`,
        optionText ? `옵션: ${optionText}` : "",
        `수량: ${order.qty || 0}개`,
        `금액: ${formatWon(order.adjusted_total_price || order.total_price)}`,
        `결제: ${order.payment_method || "-"}`,
      ]
        .filter(Boolean)
        .join("\n");

      const notification = new Notification(title, {
        body,
        tag: `ruru-order-${order.id || Date.now()}`,
        requireInteraction: false,
        silent: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      setTimeout(() => {
        notification.close();
      }, 8000);
    } catch {
      // 데스크톱 알림 실패 시 화면 알림만 유지
    }
  };

  const enableSound = async () => {
    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;

      if (AudioContextClass) {
        const context = new AudioContextClass();
        audioContextRef.current = context;

        if (context.state === "suspended") {
          await context.resume();
        }
      }

      if ("Notification" in window) {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
      } else {
        setNotificationPermission("unsupported");
      }

      setEnabled(true);

      setTimeout(() => {
        try {
          const context = audioContextRef.current;
          if (!context) return;

          const osc = context.createOscillator();
          const gain = context.createGain();

          osc.type = "sine";
          osc.frequency.setValueAtTime(880, context.currentTime);

          gain.gain.setValueAtTime(0.001, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);

          osc.connect(gain);
          gain.connect(context.destination);

          osc.start(context.currentTime);
          osc.stop(context.currentTime + 0.26);
        } catch {}
      }, 50);
    } catch {
      alert("알림 활성화에 실패했습니다.");
    }
  };

  const disableSound = () => {
    setEnabled(false);
  };

  useEffect(() => {
    if (!isAdminPage) return;

    const channel = supabase
      .channel("admin-realtime-orders")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const order = payload.new as NewOrder;

          setNewOrder(order);

          playBeep();
          showDesktopNotification(order);

          if (reloadTimerRef.current) {
            clearTimeout(reloadTimerRef.current);
          }

          reloadTimerRef.current = setTimeout(() => {
            window.location.reload();
          }, 1500);
        }
      )
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === "SUBSCRIBED") setStatus("connected");
        if (subscribeStatus === "CHANNEL_ERROR" || subscribeStatus === "TIMED_OUT") {
          setStatus("error");
        }
      });

    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [isAdminPage, enabled]);

  if (!isAdminPage) return null;

  const notificationText =
    notificationPermission === "granted"
      ? "브라우저 알림 허용됨"
      : notificationPermission === "denied"
      ? "브라우저 알림 차단됨"
      : notificationPermission === "unsupported"
      ? "브라우저 알림 미지원"
      : "브라우저 알림 대기";

  return (
    <>
      <div className="fixed right-4 bottom-4 z-[99998] flex flex-col items-end gap-3">
        {!enabled ? (
          <button
            onClick={enableSound}
            className="rounded-2xl bg-black text-white px-5 py-3 text-sm font-extrabold shadow-xl"
          >
            🔔 주문 알림켜기
          </button>
        ) : (
          <div className="rounded-2xl bg-white border border-green-200 p-2 shadow-lg min-w-[210px]">
            <div className="px-3 py-2 text-sm font-extrabold text-green-700">
              🔔 실시간 주문 알림 ON
            </div>

            <div className="px-3 pb-2 text-[11px] font-bold text-gray-500">
              {notificationText}
            </div>

            <button
              onClick={disableSound}
              className="w-full rounded-xl bg-gray-100 px-3 py-2 text-xs font-extrabold text-gray-700 hover:bg-gray-200"
            >
              알림끄기
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-extrabold text-red-700 shadow-lg">
            실시간 연결 오류
          </div>
        )}

        {notificationPermission === "denied" && (
          <div className="max-w-[260px] rounded-2xl bg-yellow-50 border border-yellow-200 px-4 py-3 text-xs font-bold text-yellow-800 shadow-lg leading-5">
            브라우저 알림이 차단되어 있습니다.
            <br />
            주소창 왼쪽 설정에서 알림 허용으로 바꿔주세요.
          </div>
        )}
      </div>

      {newOrder && (
        <div className="fixed right-4 top-4 z-[99999] w-[340px] max-w-[calc(100vw-2rem)] rounded-[1.5rem] bg-white border border-gray-200 shadow-2xl overflow-hidden">
          <div className="bg-black text-white px-5 py-4">
            <div className="text-xs font-extrabold opacity-70">NEW ORDER</div>
            <div className="text-xl font-extrabold mt-1">🛒 신규 주문 접수</div>
          </div>

          <div className="p-5 text-sm font-bold text-gray-800 leading-7">
            <div>👤 닉네임: {newOrder.youtube_nickname || "-"}</div>
            <div>🙍 주문자: {newOrder.customer_name || "-"}</div>
            <div>📦 상품: {newOrder.product_name || "-"}</div>
            <div>옵션: {[newOrder.color, newOrder.size].filter(Boolean).join(" / ") || "-"}</div>
            <div>수량: {newOrder.qty || 0}개</div>
            <div>💰 금액: {formatWon(newOrder.adjusted_total_price || newOrder.total_price)}</div>
            <div>결제: {newOrder.payment_method || "-"}</div>

            {newOrder.order_lookup_code && (
              <div>조회번호: {newOrder.order_lookup_code}</div>
            )}

            <div className="mt-3 rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3 text-blue-700">
              1.5초 후 주문목록이 자동 갱신됩니다.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
