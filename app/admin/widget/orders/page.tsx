// app/admin/widget/orders/page.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/admin/widget/orders/page.tsx
//
// 주문서 완료 방송 위젯
// - 최근 주문 3줄
// - 신규 주문 들어오면 배너 안에서 주문서 완료 효과
// - 닉네임 → 주문서 → 완료!
// - ✓ 주문서가 정상 접수 되었습니다
// - 💳 입금 부탁드립니다!
// - 최근 주문은 맨 아래가 최신순 느낌으로 표시
// - 자동 새로고침 90초 + Supabase realtime

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type OrderRow = {
  id: number;
  created_at?: string;
  youtube_nickname?: string;
  customer_name?: string;
  product_name?: string;
  color?: string;
  size?: string;
  qty?: number;
  total_price?: number;
  adjusted_total_price?: number;
  order_manage_status?: string;
};

const won = (value: any) => `${Number(value || 0).toLocaleString()}원`;

const cleanText = (value: any) => {
  const text = String(value || "").trim();
  if (!text || text === "없음" || text === "-" || text.toLowerCase() === "none") {
    return "";
  }
  return text;
};

const shortText = (value: any, maxLength = 9) => {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
};

const getOrderTotal = (order: OrderRow) =>
  Number(order.adjusted_total_price || order.total_price || 0);

const getNickname = (order?: OrderRow | null) => {
  const nickname = cleanText(order?.youtube_nickname);
  const name = cleanText(order?.customer_name);
  return nickname || name || "고객";
};

const getNicknameClass = (nickname: string) => {
  if (nickname.length <= 4) return "text-[43px]";
  if (nickname.length <= 7) return "text-[35px]";
  if (nickname.length <= 10) return "text-[29px]";
  return "text-[24px]";
};

export default function PrismOrderWidgetPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [phase, setPhase] = useState<"idle" | "name" | "order" | "done" | "ok" | "pay">("idle");
  const [lastOrder, setLastOrder] = useState<OrderRow | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current = [];
  };

  const loadOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .neq("is_deleted", true)
      .neq("is_permanently_deleted", true)
      .order("created_at", { ascending: false })
      .limit(12);

    if (!error) {
      setOrders(data || []);
    }
  };

  const triggerAnimation = (order?: OrderRow) => {
    if (order) setLastOrder(order);

    clearTimers();
    setPhase("name");

    timersRef.current.push(setTimeout(() => setPhase("order"), 750));
    timersRef.current.push(setTimeout(() => setPhase("done"), 1600));
    timersRef.current.push(setTimeout(() => setPhase("ok"), 3900));
    timersRef.current.push(setTimeout(() => setPhase("pay"), 5000));
    timersRef.current.push(setTimeout(() => setPhase("idle"), 6700));
  };

  useEffect(() => {
    loadOrders();

    const channel = supabase
      .channel("prism-order-widget-v2")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const newOrder = payload.new as OrderRow;

          setOrders((prev) =>
            [newOrder, ...prev.filter((order) => order.id !== newOrder.id)].slice(0, 12)
          );
          triggerAnimation(newOrder);
        }
      )
      .subscribe();

    const interval = window.setInterval(loadOrders, 90000);

    return () => {
      clearTimers();
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const visibleOrders = useMemo(() => orders.slice(0, 3).reverse(), [orders]);
  const nickname = shortText(getNickname(lastOrder), 11);

  return (
    <main className="min-h-screen w-full overflow-hidden bg-transparent">
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: transparent !important;
          overflow: hidden;
          font-family:
            Pretendard,
            -apple-system,
            BlinkMacSystemFont,
            "Apple SD Gothic Neo",
            "Noto Sans KR",
            "Malgun Gothic",
            sans-serif;
        }

        @keyframes softFloat {
          0%, 100% { transform: translateY(2px); }
          50% { transform: translateY(-3px); }
        }

        @keyframes popIn {
          0% { transform: scale(0.82); opacity: 0; filter: blur(5px); }
          35% { transform: scale(1.06); opacity: 1; filter: blur(0); }
          100% { transform: scale(1); opacity: 1; filter: blur(0); }
        }

        @keyframes fadePay {
          0% { transform: translateY(12px) scale(0.94); opacity: 0; }
          20%, 80% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-8px) scale(0.98); opacity: 0; }
        }

        .soft-float { animation: softFloat 2.6s ease-in-out infinite; }
        .pop-in { animation: popIn 0.5s ease-out both; }
        .fade-pay { animation: fadePay 1.75s ease-in-out both; }
      `}</style>

      <section className="relative h-[370px] w-[260px] overflow-hidden rounded-[1.75rem] text-white">
        <div className="absolute inset-0 rounded-[1.75rem] border border-white/24 bg-black/50 shadow-2xl backdrop-blur-md" />
        <div className="absolute inset-0 rounded-[1.75rem] bg-gradient-to-br from-white/12 via-pink-300/10 to-black/18" />

        <div className="relative z-10 flex h-full flex-col px-4 py-4">
          <header className="flex h-[48px] items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-xl">🛵</div>
              <div className="text-xl font-black tracking-tight">신규 주문</div>
            </div>

            <div className="text-xs font-black text-pink-200">{orders.length}건</div>
          </header>

          <div className="grid h-[36px] grid-cols-[54px_1fr_48px] items-center text-[11px] font-extrabold text-white/65">
            <div>닉네임</div>
            <div>상품 / 옵션</div>
            <div className="text-right">금액</div>
          </div>

          <div className="soft-float flex-1">
            {visibleOrders.length > 0 ? (
              visibleOrders.map((order) => {
                const optionText = [cleanText(order.color), cleanText(order.size)]
                  .filter(Boolean)
                  .join(" / ");

                return (
                  <article
                    key={order.id}
                    className="grid min-h-[68px] grid-cols-[54px_1fr_48px] items-center gap-2 border-b border-white/12"
                  >
                    <div className="truncate text-[13px] font-black">
                      {shortText(getNickname(order), 5)}
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-black">
                        {shortText(order.product_name || "상품명없음", 16)}
                      </div>
                      <div className="mt-1 truncate text-[11px] font-bold text-white/55">
                        {[optionText, `${order.qty || 0}개`].filter(Boolean).join(" / ")}
                      </div>
                    </div>

                    <div className="text-right text-[13px] font-black text-pink-200">
                      {won(getOrderTotal(order)).replace("원", "")}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="text-3xl">🛒</div>
                <div className="mt-2 text-lg font-black">주문 대기중</div>
              </div>
            )}
          </div>

          <footer className="h-[24px] text-center text-[10px] font-bold text-white/45">
            최근 주문이 아래에 표시됩니다
          </footer>
        </div>

        {phase !== "idle" && lastOrder && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
            <div className="absolute inset-0 rounded-[1.75rem] bg-black/64 backdrop-blur-[2px]" />

            <div className="relative flex h-full w-full flex-col items-center justify-center rounded-[1.45rem] border border-pink-300/60 bg-black/36 px-3 text-center shadow-[0_0_28px_rgba(255,105,180,0.72)]">
              {(phase === "name" || phase === "order" || phase === "done") && (
                <div className="flex h-full w-full flex-col items-center justify-center">
                  <div className={`pop-in max-w-full truncate whitespace-nowrap font-black leading-none text-white drop-shadow-[0_0_14px_rgba(255,105,180,0.95)] ${getNicknameClass(String(nickname))}`}>
                    {nickname}님
                  </div>

                  {(phase === "order" || phase === "done") && (
                    <div className="pop-in mt-4 text-[42px] font-black leading-none text-pink-100 drop-shadow-[0_0_14px_rgba(255,105,180,0.95)]">
                      주문서
                    </div>
                  )}

                  {phase === "done" && (
                    <div className="pop-in mt-3 text-[48px] font-black leading-none text-white drop-shadow-[0_0_14px_rgba(255,105,180,0.95)]">
                      완료!
                    </div>
                  )}
                </div>
              )}

              {phase === "ok" && (
                <div className="fade-pay whitespace-nowrap rounded-full bg-white/12 px-3 py-2 text-[15px] font-black text-white shadow-[0_0_14px_rgba(255,105,180,0.45)]">
                  ✓ 주문서가 정상 접수 되었습니다
                </div>
              )}

              {phase === "pay" && (
                <div className="fade-pay text-[28px] font-black leading-tight text-pink-100 drop-shadow-[0_0_16px_rgba(255,105,180,0.95)]">
                  💳 입금 부탁드립니다!
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
