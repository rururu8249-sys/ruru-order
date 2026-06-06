"use client";

// 방송 위젯 (OBS 브라우저 소스용) — 시안 6번.
// - 고정 상품(products.is_pinned): 카드 1개 좌하단 표시(📌)
// - 순환 상품(활성 방송 broadcast_products): 몇 초마다 스르륵 자동 전환
// - 주문 들어오면 "🛒 ○○님 주문!" 2~3초 표시 후 사라짐 (orders INSERT 실시간)
// - 배경 투명(크로마키). 읽기 전용 — 돈/주문 로직 건드리지 않음.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { resolveProductImageUrl } from "@/components/admin-live/quick-product/productImageUrl";
import { getActiveBroadcast, loadAdminLiveBroadcasts } from "@/components/admin-live/liveBroadcastController";

type AnyProduct = Record<string, any>;

function imageOf(p: AnyProduct | null): string {
  if (!p) return "";
  const direct = p.image_url || p.cover_image_url || p.main_image_url || p.thumbnail_url || "";
  if (direct) return resolveProductImageUrl(String(direct).trim());
  const arr = p.images || p.image_urls || p.detail_image_urls;
  if (Array.isArray(arr) && arr[0]) return resolveProductImageUrl(String(arr[0]).trim());
  return "";
}

function nameOf(p: AnyProduct | null): string {
  return String(p?.product_name || p?.name || p?.title || "상품").trim();
}

function priceOf(p: AnyProduct | null): number {
  return Number(p?.price ?? p?.sale_price ?? p?.selling_price ?? 0) || 0;
}

function joinOptionValues(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean).join(" · ");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean).join(" · ");
    } catch {
      /* 일반 문자열 */
    }
    return raw.split(/[,/|]+/g).map((s) => s.trim()).filter(Boolean).join(" · ");
  }
  return "";
}

function sizesOf(p: AnyProduct | null): string {
  return p ? joinOptionValues(p.size_options ?? p.sizes ?? p.size ?? p.product_sizes) : "";
}

// 색상 옵션 — 기존엔 이 함수/렌더가 없어서 색상이 표시되지 않았음
function colorsOf(p: AnyProduct | null): string {
  return p ? joinOptionValues(p.color_options ?? p.colors ?? p.color ?? p.product_colors) : "";
}

// 재고 "표시" 의도가 있을 때만 노출 — stock_management_enabled 이고 숫자일 때 "남은 N"
function stockLabel(p: AnyProduct | null): string {
  if (!p) return "";
  let note: any = p.product_note;
  if (typeof note === "string") {
    try {
      note = JSON.parse(note);
    } catch {
      note = null;
    }
  }
  const managed = note?.stock_management_enabled === true;
  if (!managed) return "";
  const stock = Number(p.stock ?? p.total_stock);
  if (!Number.isFinite(stock)) return "";
  return `남은 ${Math.max(0, stock)}`;
}

export default function ProductWidgetClient() {
  const [pinned, setPinned] = useState<AnyProduct | null>(null);
  const [rotation, setRotation] = useState<AnyProduct[]>([]);
  const [rotIndex, setRotIndex] = useState(0);
  const [orderToast, setOrderToast] = useState("");

  // 배경 투명 (OBS 크로마키)
  useEffect(() => {
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, []);

  // 상품 로드 (고정 + 순환)
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data: products } = await supabase.from("products").select("*");
        const list = (products || []) as AnyProduct[];
        const p = list.find((x) => x?.is_pinned === true || x?.pinned === true) || null;
        if (alive) setPinned(p);

        const broadcasts = await loadAdminLiveBroadcasts();
        const active = getActiveBroadcast(broadcasts);
        if (active?.id) {
          const { data: links } = await supabase
            .from("broadcast_products")
            .select("product_id, sort_order")
            .eq("broadcast_id", active.id)
            .order("sort_order", { ascending: true });
          const ids = ((links as { product_id: unknown }[]) || []).map((r) => String(r.product_id));
          const byId = new Map(list.map((x) => [String(x?.id ?? x?.product_id), x]));
          const rot = ids.map((id) => byId.get(id)).filter(Boolean) as AnyProduct[];
          if (alive) setRotation(rot);
        } else if (alive) {
          setRotation([]);
        }
      } catch {
        /* 로드 실패해도 위젯은 빈 화면 유지 */
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 20000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  // 순환 자동 전환 (고정상품 없을 때만)
  useEffect(() => {
    if (pinned || rotation.length <= 1) return;
    const timer = window.setInterval(() => {
      setRotIndex((i) => (i + 1) % rotation.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [pinned, rotation.length]);

  // 주문 들어오면 토스트 (orders INSERT 실시간)
  useEffect(() => {
    let hideTimer = 0;
    const channel = supabase
      .channel("ruru-product-widget-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const row = (payload.new || {}) as AnyProduct;
        const name = String(row.youtube_nickname || row.customer_name || row.nickname || "손님").trim();
        setOrderToast(`🛒 ${name}님 주문!`);
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => setOrderToast(""), 2800);
      })
      .subscribe();
    return () => {
      window.clearTimeout(hideTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  const current = pinned || rotation[rotIndex] || null;
  const img = imageOf(current);
  const colors = colorsOf(current);
  const sizes = sizesOf(current);
  const optionText = [colors, sizes].filter(Boolean).join("  /  ");
  const stock = stockLabel(current);

  return (
    <div style={{ position: "fixed", inset: 0, background: "transparent", pointerEvents: "none", fontFamily: "Pretendard, Arial, sans-serif" }}>
      {orderToast ? (
        <div
          style={{
            position: "absolute",
            left: "24px",
            bottom: "210px",
            background: "rgba(15,110,86,0.92)",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: "12px",
            fontSize: "19px",
            fontWeight: 800,
            boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
          }}
        >
          {orderToast}
        </div>
      ) : null}

      {current ? (
        <div
          key={String(current?.id ?? rotIndex)}
          style={{
            position: "absolute",
            left: "24px",
            bottom: "24px",
            width: "320px",
            display: "flex",
            gap: "13px",
            alignItems: "center",
            background: "rgba(38,38,44,0.60)",
            backdropFilter: "blur(9px)",
            WebkitBackdropFilter: "blur(9px)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: "18px",
            padding: "14px",
            color: "#fff",
            animation: "ruruWidgetIn 0.5s ease",
          }}
        >
          <div style={{ position: "relative", width: "82px", height: "82px", flexShrink: 0, borderRadius: "13px", overflow: "hidden", background: "rgba(255,255,255,0.1)" }}>
            {img ? (
              <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "30px" }}>👟</div>
            )}
            {pinned ? (
              <span style={{ position: "absolute", top: "4px", left: "4px", fontSize: "15px" }}>📌</span>
            ) : null}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "16px", fontWeight: 800, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-all" }}>
              {nameOf(current)}
            </div>
            {optionText ? (
              <div style={{ marginTop: "3px", fontSize: "12px", color: "rgba(255,255,255,0.78)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{optionText}</div>
            ) : null}
            <div style={{ marginTop: "4px", display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontSize: "19px", fontWeight: 800, color: "#FFD9E0" }}>{priceOf(current).toLocaleString("ko-KR")}원</span>
              {stock ? <span style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{stock}</span> : null}
            </div>
          </div>
        </div>
      ) : null}

      <style>{`@keyframes ruruWidgetIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
