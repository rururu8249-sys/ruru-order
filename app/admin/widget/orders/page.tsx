// app/admin/widget/orders/page.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/admin/widget/orders/page.tsx
//
// 프리즘라이브 방송화면용 신규주문 미니 위젯
// - 작은 세로형 위젯 사이즈 유지
// - 반투명 유리 느낌
// - 최근 주문이 맨 아래에 오도록 정렬
// - 닉네임 / 상품·옵션·수량 / 금액 오와열 정렬
// - 신규 주문 들어오면 같은 배너 안에서 약 2초간 주문내역을 덮고
//   "{닉네임}님 주문서 완료!" 크게 표시
// - 효과 종료 후 원래 주문내역 화면으로 복귀
//
// 프리즘 권장 브라우저 소스 크기:
// 폭 300
// 높이 430
//
// 접속 주소:
// http://localhost:3000/admin/widget/orders
// 실제 배포 후:
// https://ruru-order.vercel.app/admin/widget/orders

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
  order_lookup_code?: string;
};

const won = (value: any) => `${Number(value || 0).toLocaleString()}원`;

const cleanText = (value: any) => {
  const text = String(value || "").trim();

  if (!text) return "";
  if (text === "없음") return "";
  if (text === "-") return "";
  if (text.toLowerCase() === "none") return "";

  return text;
};

const shortText = (value: any, maxLength = 9) => {
  const text = String(value || "").trim();

  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength)}…`;
};

const getOrderTotal = (order: OrderRow) =>
  Number(order.adjusted_total_price || order.total_price || 0);

const getMinuteAgo = (value?: string) => {
  if (!value) return "";

  const created = new Date(value).getTime();
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - created) / 60000));

  if (diff <= 0) return "방금";
  if (diff < 60) return `${diff}분 전`;

  return "";
};

const getNickname = (order?: OrderRow | null) => {
  const nickname = cleanText(order?.youtube_nickname);
  const name = cleanText(order?.customer_name);

  return nickname || name || "고객";
};

export default function PrismOrderWidgetPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [lastOrder, setLastOrder] = useState<OrderRow | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("order_manage_status", "주문확인전")
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      console.error(error);
      return;
    }

    setOrders(data || []);
  };

  const triggerAnimation = (order?: OrderRow) => {
    if (order) setLastOrder(order);

    setIsAnimating(false);

    window.setTimeout(() => {
      setIsAnimating(true);
    }, 50);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setIsAnimating(false);
    }, 2200);
  };

  useEffect(() => {
    loadOrders();

    const channel = supabase
      .channel("prism-glass-new-order-widget")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const newOrder = payload.new as OrderRow;

          setOrders((prev) => {
            const exists = prev.some((order) => order.id === newOrder.id);
            if (exists) return prev;

            return [newOrder, ...prev].slice(0, 12);
          });

          triggerAnimation(newOrder);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const updatedOrder = payload.new as OrderRow;

          setOrders((prev) => {
            const filtered = prev.filter((order) => order.id !== updatedOrder.id);

            if (updatedOrder.order_manage_status === "주문확인전") {
              return [updatedOrder, ...filtered]
                .sort((a, b) => {
                  const aTime = new Date(a.created_at || "").getTime();
                  const bTime = new Date(b.created_at || "").getTime();
                  return bTime - aTime;
                })
                .slice(0, 12);
            }

            return filtered;
          });
        }
      )
      .subscribe();

    const interval = window.setInterval(loadOrders, 12000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  // 화면 표시 순서:
  // 오래된 주문이 위, 최근 주문이 맨 아래
  // 새 주문이 들어오면 맨 아래에 추가되는 느낌
  const visibleOrders = useMemo(() => {
    return orders.slice(0, 3).reverse();
  }, [orders]);

  const latestVisibleOrderId =
    visibleOrders.length > 0 ? visibleOrders[visibleOrders.length - 1].id : null;

  return (
    <main className="min-h-screen w-full bg-transparent overflow-hidden">
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

        @keyframes orderSlide {
          0% {
            transform: translateY(3px);
          }
          50% {
            transform: translateY(-3px);
          }
          100% {
            transform: translateY(3px);
          }
        }

        @keyframes overlayInOut {
          0% {
            transform: scale(0.88);
            opacity: 0;
            filter: blur(4px);
          }
          14% {
            transform: scale(1.04);
            opacity: 1;
            filter: blur(0);
          }
          78% {
            transform: scale(1);
            opacity: 1;
            filter: blur(0);
          }
          100% {
            transform: scale(0.96);
            opacity: 0;
            filter: blur(2px);
          }
        }

        @keyframes bikeRun {
          0% {
            transform: translateX(-58px);
            opacity: 0;
          }
          18% {
            opacity: 1;
          }
          100% {
            transform: translateX(300px);
            opacity: 0;
          }
        }

        @keyframes sparkle {
          0% {
            transform: translateY(-10px) scale(0.8) rotate(0deg);
            opacity: 0;
          }
          25% {
            opacity: 1;
          }
          100% {
            transform: translateY(95px) scale(1.1) rotate(280deg);
            opacity: 0;
          }
        }

        @keyframes newGlow {
          0%,
          100% {
            box-shadow: 0 0 0 rgba(255, 105, 180, 0);
          }
          50% {
            box-shadow:
              0 0 16px rgba(255, 105, 180, 0.7),
              inset 0 0 12px rgba(255, 255, 255, 0.14);
          }
        }

        .order-list-motion {
          animation: orderSlide 2.4s ease-in-out infinite;
        }

        .overlay-in-out {
          animation: overlayInOut 2.15s ease-in-out forwards;
        }

        .bike-run {
          animation: bikeRun 1.55s ease-in-out forwards;
        }

        .sparkle {
          animation: sparkle 1.9s ease-in-out forwards;
        }

        .new-glow {
          animation: newGlow 1.2s ease-in-out 2;
        }
      `}</style>

      <section className="relative w-[300px] h-[430px] rounded-[1.75rem] overflow-hidden text-white">
        <div className="absolute inset-0 rounded-[1.75rem] bg-black/46 backdrop-blur-md border border-white/24 shadow-2xl" />
        <div className="absolute inset-0 rounded-[1.75rem] bg-gradient-to-br from-white/12 via-pink-300/10 to-black/18 pointer-events-none" />
        <div className="absolute inset-x-5 top-[72px] h-px bg-pink-300/48" />
        <div className="absolute inset-x-5 top-[128px] h-px bg-white/16" />

        <div className="relative z-10 h-full px-5 py-5 flex flex-col">
          <header className="h-[58px] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-2xl drop-shadow-[0_0_9px_rgba(255,105,180,0.9)]">
                🛵
              </div>

              <div className="text-2xl font-black tracking-tight">
                신규 주문
              </div>
            </div>

            <div className="flex items-center gap-2 text-[12px] font-black text-pink-200 drop-shadow-[0_0_8px_rgba(255,105,180,0.85)]">
              <span>{orders.length}건</span>
              <span className="w-2 h-2 rounded-full bg-pink-300 shadow-[0_0_8px_rgba(255,105,180,0.9)]" />
            </div>
          </header>

          <div className="h-[43px] grid grid-cols-[70px_1fr_72px] items-center text-[13px] font-extrabold text-white/72">
            <div>닉네임</div>
            <div>상품 / 옵션 / 수량</div>
            <div className="text-right">금액</div>
          </div>

          <div className="order-list-motion flex-1">
            {visibleOrders.length > 0 ? (
              visibleOrders.map((order) => {
                const optionParts = [cleanText(order.color), cleanText(order.size)].filter(Boolean);
                const optionText = optionParts.length > 0 ? optionParts.join(" / ") : "없음";
                const isNewest = order.id === latestVisibleOrderId;
                const isLastInserted = lastOrder?.id === order.id;

                return (
                  <article
                    key={order.id}
                    className={`grid grid-cols-[70px_1fr_72px] gap-2 items-center min-h-[82px] border-b border-white/13 ${
                      isLastInserted && isAnimating ? "new-glow" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className={`w-2 h-2 rounded-full mb-2 ${
                        isNewest ? "bg-pink-300 shadow-[0_0_10px_rgba(255,105,180,0.9)]" : "bg-white/35"
                      }`} />

                      <div className={`text-[12px] font-bold ${
                        isNewest ? "text-pink-200" : "text-white/50"
                      }`}>
                        {isNewest ? "NEW" : getMinuteAgo(order.created_at)}
                      </div>

                      <div className="mt-1 text-[17px] leading-tight font-black truncate">
                        {shortText(getNickname(order), 6)}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="text-[17px] leading-tight font-black truncate text-white">
                        {shortText(order.product_name || "상품명없음", 9)}
                      </div>

                      <div className="mt-1 text-[13px] leading-tight font-bold text-white/58 truncate">
                        {shortText(optionText, 8)} / {order.qty || 0}개
                      </div>
                    </div>

                    <div className="min-w-0 text-right">
                      <div className="text-[20px] leading-tight font-black text-pink-200 drop-shadow-[0_0_7px_rgba(255,105,180,0.52)]">
                        {won(getOrderTotal(order)).replace("원", "")}
                      </div>
                      <div className="text-[12px] font-black text-white/70">
                        원
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="text-3xl">🛒</div>
                <div className="mt-2 text-lg font-black">주문 대기중</div>
                <div className="mt-1 text-xs font-bold text-white/55">
                  신규 주문이 들어오면 표시됩니다
                </div>
              </div>
            )}
          </div>

          <footer className="h-[30px] flex items-center gap-2 text-[11px] font-bold text-white/52">
            <span className="w-2 h-2 rounded-full bg-pink-300 shadow-[0_0_8px_rgba(255,105,180,0.8)]" />
            최근 주문이 아래에 표시됩니다
          </footer>
        </div>

        {isAnimating && lastOrder && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-5 pointer-events-none">
            <div className="absolute inset-0 rounded-[1.75rem] bg-black/58 backdrop-blur-[2px]" />

            <div className="overlay-in-out relative w-full h-full rounded-[1.5rem] border border-pink-300/65 bg-black/42 shadow-[0_0_28px_rgba(255,105,180,0.75)] overflow-hidden">
              <div className="bike-run absolute top-6 left-0 text-3xl drop-shadow-[0_0_10px_rgba(255,105,180,0.95)]">
                🛵💨
              </div>

              {Array.from({ length: 16 }).map((_, index) => (
                <span
                  key={index}
                  className="sparkle absolute text-sm"
                  style={{
                    left: `${8 + ((index * 17) % 84)}%`,
                    top: `${18 + (index % 4) * 11}px`,
                    animationDelay: `${(index % 6) * 0.08}s`,
                  }}
                >
                  {index % 4 === 0 ? "✨" : index % 4 === 1 ? "💗" : index % 4 === 2 ? "🎉" : "⭐"}
                </span>
              ))}

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                <div className="text-[42px] leading-[1.05] font-black text-white drop-shadow-[0_0_14px_rgba(255,105,180,0.95)]">
                  {shortText(getNickname(lastOrder), 7)}님
                </div>

                <div className="mt-2 text-[40px] leading-[1.05] font-black text-pink-100 drop-shadow-[0_0_16px_rgba(255,105,180,0.98)]">
                  주문서 완료!
                </div>

                <div className="mt-5 rounded-full bg-pink-500/82 border border-pink-200/70 px-4 py-2 text-[15px] font-black text-white shadow-[0_0_14px_rgba(255,105,180,0.75)]">
                  ✓ 주문서가 정상 접수되었습니다
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
