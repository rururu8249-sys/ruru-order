// app/admin/widget/page.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/admin/widget/page.tsx
//
// 프리즘라이브 브라우저소스용 주문완료 위젯
// 링크: /admin/widget
// - 최근 주문 감지
// - 닉네임 → 주문서 → 완료!
// - 폭죽/반짝이/배달오토바이 애니메이션
// - 자동 새로고침 대신 5초 폴링 방식

"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type WidgetOrder = {
  id: number;
  youtube_nickname?: string;
  customer_name?: string;
  product_name?: string;
  qty?: number;
  created_at?: string;
};

export default function AdminWidgetPage() {
  const [currentOrder, setCurrentOrder] = useState<WidgetOrder | null>(null);
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<"name" | "order" | "done" | "message">("name");
  const lastOrderIdRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    const savedLastId = Number(localStorage.getItem("ruru_widget_last_order_id") || 0);
    if (savedLastId) lastOrderIdRef.current = savedLastId;

    checkLatestOrder();

    const timer = window.setInterval(() => {
      checkLatestOrder();
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const checkLatestOrder = async () => {
    if (isPlayingRef.current) return;

    const { data, error } = await supabase
      .from("orders")
      .select("id, youtube_nickname, customer_name, product_name, qty, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.id) return;

    const latestId = Number(data.id);

    if (!lastOrderIdRef.current) {
      lastOrderIdRef.current = latestId;
      localStorage.setItem("ruru_widget_last_order_id", String(latestId));
      return;
    }

    if (latestId > lastOrderIdRef.current) {
      lastOrderIdRef.current = latestId;
      localStorage.setItem("ruru_widget_last_order_id", String(latestId));
      playOrder(data as WidgetOrder);
    }
  };

  const playOrder = (order: WidgetOrder) => {
    isPlayingRef.current = true;
    setCurrentOrder(order);
    setVisible(true);
    setPhase("name");

    window.setTimeout(() => setPhase("order"), 700);
    window.setTimeout(() => setPhase("done"), 1500);
    window.setTimeout(() => setPhase("message"), 2400);
    window.setTimeout(() => {
      setVisible(false);
      isPlayingRef.current = false;
    }, 6200);
  };

  const displayName =
    currentOrder?.youtube_nickname ||
    currentOrder?.customer_name ||
    "고객";

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-transparent">
      <style>{`
        html, body {
          background: transparent !important;
          overflow: hidden;
        }

        @keyframes popIn {
          0% { opacity: 0; transform: translateY(26px) scale(.86); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }

        @keyframes softOut {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(.96); }
        }

        @keyframes firework {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(.15) rotate(0deg); }
          20% { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.8) rotate(24deg); }
        }

        @keyframes bike {
          0% { transform: translateX(-180%) translateY(0); opacity: 0; }
          14% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateX(180%) translateY(-3px); opacity: 0; }
        }

        @keyframes glow {
          0%, 100% { box-shadow: 0 0 24px rgba(236,72,153,.35), 0 18px 50px rgba(0,0,0,.25); }
          50% { box-shadow: 0 0 46px rgba(236,72,153,.65), 0 18px 60px rgba(0,0,0,.32); }
        }

        .widget-card {
          animation: popIn .45s ease-out both, glow 1.6s ease-in-out infinite;
        }

        .widget-hide {
          animation: softOut .35s ease-in both;
        }

        .phase {
          animation: popIn .42s ease-out both;
        }

        .firework {
          position: absolute;
          left: 50%;
          top: 40%;
          pointer-events: none;
          animation: firework 1.25s ease-out both;
        }

        .bike {
          animation: bike 2.4s ease-in-out both;
        }
      `}</style>

      {visible && (
        <section className="absolute inset-0 flex items-center justify-center">
          <div className="widget-card relative w-[520px] max-w-[92vw] rounded-[42px] border border-white/50 bg-black/78 px-8 py-9 text-center text-white backdrop-blur-md">
            {phase === "done" || phase === "message" ? (
              <>
                <div className="firework text-7xl">🎆</div>
                <div className="firework text-5xl" style={{ left: "25%", top: "34%", animationDelay: ".18s" }}>✨</div>
                <div className="firework text-5xl" style={{ left: "76%", top: "34%", animationDelay: ".28s" }}>🎉</div>
              </>
            ) : null}

            {phase === "name" && (
              <div className="phase text-5xl font-black tracking-[-0.05em]">
                {displayName}님
              </div>
            )}

            {phase === "order" && (
              <div className="phase text-6xl font-black tracking-[-0.08em] text-pink-200">
                주문서
              </div>
            )}

            {phase === "done" && (
              <div className="phase">
                <div className="text-6xl font-black tracking-[-0.08em]">
                  완료!
                </div>
                <div className="bike mt-5 text-5xl">🛵💨</div>
              </div>
            )}

            {phase === "message" && (
              <div className="phase">
                <div className="text-3xl font-black tracking-[-0.04em] text-pink-100">
                  ✓ 주문서가 정상 접수되었습니다
                </div>
                <div className="mt-4 text-xl font-black text-white/90">
                  입금 확인 후 순차 준비됩니다
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
