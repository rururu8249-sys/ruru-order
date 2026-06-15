"use client";

// 방송 위젯 (OBS 브라우저 소스용) — 시안 6번.
// - 고정 상품(products.is_pinned): 카드 1개 좌하단 표시(📌)
// - 순환 상품(활성 방송 broadcast_products): 몇 초마다 스르륵 자동 전환
// - 주문 들어오면 "🛒 ○○님 주문!" 2~3초 표시 후 사라짐 (orders INSERT 실시간)
// - 배경 투명(크로마키). 읽기 전용 — 돈/주문 로직 건드리지 않음.

import { useEffect, useRef, useState } from "react";
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

// 입금확인 폭죽 파티클(표시 전용) — 좌하단에서 위/바깥으로 흩어짐. 브랜드 톤(버건디/핑크/골드).
const CONFETTI_PIECES = [
  { tx: "-46px", ty: "-70px", r: "200deg", color: "#7B2D43", size: 8, round: false, dur: 1.2 },
  { tx: "-18px", ty: "-96px", r: "-160deg", color: "#FFD9E0", size: 7, round: true, dur: 1.3 },
  { tx: "16px", ty: "-104px", r: "140deg", color: "#F5C24B", size: 9, round: false, dur: 1.25 },
  { tx: "48px", ty: "-88px", r: "-220deg", color: "#7B2D43", size: 7, round: true, dur: 1.15 },
  { tx: "74px", ty: "-58px", r: "180deg", color: "#FFD9E0", size: 8, round: false, dur: 1.3 },
  { tx: "-66px", ty: "-44px", r: "-120deg", color: "#F5C24B", size: 6, round: true, dur: 1.1 },
  { tx: "90px", ty: "-30px", r: "240deg", color: "#FFD9E0", size: 9, round: false, dur: 1.35 },
  { tx: "-30px", ty: "-80px", r: "160deg", color: "#F5C24B", size: 7, round: true, dur: 1.2 },
  { tx: "34px", ty: "-72px", r: "-200deg", color: "#7B2D43", size: 8, round: false, dur: 1.25 },
  { tx: "-86px", ty: "-58px", r: "120deg", color: "#FFD9E0", size: 6, round: true, dur: 1.15 },
  { tx: "60px", ty: "-100px", r: "-140deg", color: "#F5C24B", size: 8, round: false, dur: 1.4 },
  { tx: "4px", ty: "-118px", r: "260deg", color: "#7B2D43", size: 7, round: true, dur: 1.3 },
  { tx: "-54px", ty: "-90px", r: "-180deg", color: "#FFD9E0", size: 9, round: false, dur: 1.35 },
  { tx: "104px", ty: "-46px", r: "150deg", color: "#F5C24B", size: 6, round: true, dur: 1.2 },
] as const;

export default function ProductWidgetClient() {
  const [pinned, setPinned] = useState<AnyProduct | null>(null);
  const [rotation, setRotation] = useState<AnyProduct[]>([]);
  const [rotIndex, setRotIndex] = useState(0);
  // 이벤트 토스트 — 여러 개 동시 도착 가능 → 큐로 순서대로 3초씩 표시
  const [toastQueue, setToastQueue] = useState<string[]>([]);
  const [currentToast, setCurrentToast] = useState("");
  const seenRef = useRef<Set<string>>(new Set());
  // 입금확인 폭죽(표시 전용). key 증가로 애니메이션 재시작, on으로 1회 표시.
  const [confettiKey, setConfettiKey] = useState(0);
  const [confettiOn, setConfettiOn] = useState(false);

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

  // 실시간 이벤트 토스트: 주문(INSERT) / 입금확인·카드결제완료(UPDATE). 실제 컬럼명 기준.
  useEffect(() => {
    const nick = (row: AnyProduct) => String(row?.youtube_nickname || row?.nickname || row?.customer_name || "손님").trim();
    // 주문 row의 실제 금액 컬럼: submit route가 final_amount(=total_price=adjusted_total_price)에 합계를 저장. total_amount는 인서트에 없어 0원이 떴음.
    const amount = (row: AnyProduct) =>
      (Number(row?.final_amount ?? row?.total_amount ?? row?.totalAmount ?? row?.total_price ?? row?.adjusted_total_price ?? 0) || 0).toLocaleString("ko-KR");
    const pname = (row: AnyProduct) => String(row?.product_name || row?.name || "상품").trim();
    // 입금/카드 상태가 기록되는 실제 컬럼들
    const statusOf = (row: AnyProduct) => String(row?.admin_order_status_v2 || row?.order_manage_status || row?.deposit_status || "").trim();
    const groupKey = (row: AnyProduct) => String(row?.order_group_id || row?.id || "");
    const push = (msg: string) => setToastQueue((q) => [...q, msg]);

    const channel = supabase
      .channel("ruru-product-widget-events")
      // A. 주문서 작성 완료
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const row = (payload.new || {}) as AnyProduct;
        const key = `ins:${groupKey(row)}`;
        if (seenRef.current.has(key)) return; // 한 주문(여러 상품행) 중복 방지
        seenRef.current.add(key);
        push(`🛒 ${nick(row)}님 주문! ${pname(row)} ${amount(row)}원`);
      })
      // B·C. 입금 확인(자동/수동) / D. 카드 결제 완료
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const row = (payload.new || {}) as AnyProduct;
        const oldRow = (payload.old || {}) as AnyProduct;
        const status = statusOf(row);
        const oldStatus = statusOf(oldRow);

        // B·C. 입금확인 (자동입금확인/수동입금확인/입금확인)
        if (/입금확인/.test(status) && !/입금확인/.test(oldStatus)) {
          const key = `dep:${groupKey(row)}`;
          if (!seenRef.current.has(key)) {
            seenRef.current.add(key);
            push(`✅ ${nick(row)}님 입금 확인! ${amount(row)}원`);
          }
        }

        // D. 카드 결제 완료
        if (status === "카드결제완료" && oldStatus !== "카드결제완료") {
          const key = `card:${groupKey(row)}`;
          if (!seenRef.current.has(key)) {
            seenRef.current.add(key);
            push(`💳 ${nick(row)}님 카드 결제 완료! ${amount(row)}원`);
          }
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 큐에서 다음 토스트 꺼내기: 표시 중이 아니고 대기열이 있으면 하나 꺼낸다.
  useEffect(() => {
    if (currentToast || toastQueue.length === 0) return;
    setCurrentToast(toastQueue[0]);
    setToastQueue((q) => q.slice(1));
    // 어떤 토스트든(주문/입금확인/카드결제) 새로 표시되는 순간 폭죽 1회(표시 전용 — 큐/판정/금액 로직 무관)
    setConfettiKey((k) => k + 1);
    setConfettiOn(true);
  }, [currentToast, toastQueue]);

  // 자동 숨김: currentToast가 생기면 3초 뒤 비운다. (이 effect는 currentToast에만 의존 →
  // 큐 변경으로 재실행되며 타이머가 즉시 clear되던 버그 수정. 3초 후 사라지고 다음 큐로 넘어감)
  useEffect(() => {
    if (!currentToast) return;
    const t = window.setTimeout(() => setCurrentToast(""), 3000);
    return () => window.clearTimeout(t);
  }, [currentToast]);

  // 폭죽 1회 재생 후 종료(1.4초). confettiKey가 바뀔 때마다 타이머 재무장.
  useEffect(() => {
    if (!confettiOn) return;
    const t = window.setTimeout(() => setConfettiOn(false), 1400);
    return () => window.clearTimeout(t);
  }, [confettiKey, confettiOn]);

  const current = pinned || rotation[rotIndex] || null;
  const img = imageOf(current);
  const colors = colorsOf(current); // 색상만 표시(사이즈는 제외)
  const stock = stockLabel(current);

  return (
    <div style={{ position: "fixed", inset: 0, background: "transparent", pointerEvents: "none", fontFamily: "Pretendard, Arial, sans-serif" }}>
      {currentToast ? (
        <div
          style={{
            position: "absolute",
            left: "24px",
            bottom: "160px",
            background: "rgba(123,45,67,0.95)",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: "12px",
            fontSize: "15px",
            fontWeight: 800,
            whiteSpace: "nowrap",
            boxShadow: "0 0 18px rgba(123,45,67,0.65), 0 4px 14px rgba(0,0,0,0.3)",
            animation: "ruruToastPop 0.5s cubic-bezier(0.18,0.89,0.32,1.28)",
          }}
        >
          {currentToast}
        </div>
      ) : null}

      {current ? (
        <div
          key={String(current?.id ?? rotIndex)}
          style={{
            position: "absolute",
            left: "24px",
            bottom: "24px",
            width: "336px",
            display: "flex",
            gap: "12px",
            alignItems: "center",
            background: "rgba(38,38,44,0.60)",
            backdropFilter: "blur(9px)",
            WebkitBackdropFilter: "blur(9px)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: "12px",
            padding: "12px",
            color: "#fff",
            animation: "ruruWidgetIn 0.5s ease",
          }}
        >
          <div style={{ position: "relative", width: "86px", height: "86px", flexShrink: 0, borderRadius: "9px", overflow: "hidden", background: "rgba(255,255,255,0.1)" }}>
            {img ? (
              <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px" }}>👟</div>
            )}
            {pinned ? (
              <span style={{ position: "absolute", top: "4px", left: "4px", fontSize: "15px" }}>📌</span>
            ) : null}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "17px", fontWeight: 800, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-all" }}>
              {nameOf(current)}
            </div>
            {colors ? (
              <div style={{ marginTop: "4px", fontSize: "14px", color: "rgba(255,255,255,0.78)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{colors}</div>
            ) : null}
            <div style={{ marginTop: "5px", display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontSize: "19px", fontWeight: 800, color: "#FFD9E0" }}>{priceOf(current).toLocaleString("ko-KR")}원</span>
              {stock ? <span style={{ fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{stock}</span> : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* 입금/주문 토스트 폭죽 — 좌하단 국소, 표시 전용, pointerEvents none */}
      {confettiOn ? (
        <div key={confettiKey} style={{ position: "absolute", left: "78px", bottom: "150px", width: 0, height: 0, pointerEvents: "none" }}>
          {CONFETTI_PIECES.map((p, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                width: `${p.size}px`,
                height: `${p.size}px`,
                borderRadius: p.round ? "50%" : "2px",
                background: p.color,
                ["--tx" as any]: p.tx,
                ["--ty" as any]: p.ty,
                ["--r" as any]: p.r,
                animation: `ruruConfetti ${p.dur}s ease-out forwards`,
              }}
            />
          ))}
        </div>
      ) : null}

      <style>{`
        @keyframes ruruWidgetIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ruruToastPop {
          0% { opacity: 0; transform: scale(0.8) translateY(8px); }
          60% { opacity: 1; transform: scale(1.05) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes ruruConfetti {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) rotate(var(--r)); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
