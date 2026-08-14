"use client";

// [2026-08-14] 채팅읽기 상주 루프 — 방송 컨트롤타워가 열려 있는 동안 7초마다 서버에 읽기를 요청한다.
//   채팅주문 팝업을 열 필요가 없다. 채팅읽기 OFF면 서버가 설정만 보고 즉시 건너뛴다(유튜브 쿼터 0).
//   탭이 안 보이면(백그라운드) 쉰다. 화면에 아무것도 그리지 않는다.
import { useEffect } from "react";

export default function ChatOrderReaderLoop() {
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      busy = true;
      try {
        await fetch("/api/chat-orders/read", { method: "POST", cache: "no-store" });
      } catch { /* 네트워크 오류는 다음 주기에 재시도 */ }
      finally { busy = false; }
    };
    const t = setInterval(() => { void tick(); }, 7000);
    return () => clearInterval(t);
  }, []);
  return null;
}
