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

// [2026-07-09] "없음"류 값 제거 — 상품에 색상이 없으면 color_options에 문자 그대로 "없음"이 저장돼 있어
//   위젯에 `[없음]`으로 찍히던 문제. 고객 주문페이지와 동일하게 이런 값은 옵션으로 안 친다.
// 배경(그라데이션) 없이도 밝은 상품 사진 위에서 글씨가 읽히도록 하는 검정 아웃라인.
//   다방향 text-shadow로 테두리를 만들고, 마지막에 약한 그림자로 입체감만 살짝.
const OUTLINE_TEXT =
  "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000," +
  "-2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000, 0 3px 8px rgba(0,0,0,0.55)";
const OUTLINE_TEXT_SM =
  "-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000," +
  "0 2px 6px rgba(0,0,0,0.5)";

const EMPTY_OPTION_WORDS = new Set(["없음", "없슴", "무", "-", "none", "n/a", "na"]);
function cleanOptionText(raw: string): string {
  return raw
    .split(" · ")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !EMPTY_OPTION_WORDS.has(s.toLowerCase()))
    .join(" · ");
}

// 색상 옵션 — 기존엔 이 함수/렌더가 없어서 색상이 표시되지 않았음
function colorsOf(p: AnyProduct | null): string {
  return p ? cleanOptionText(joinOptionValues(p.color_options ?? p.colors ?? p.color ?? p.product_colors)) : "";
}

// 사이즈 옵션 — 방송에서 "사이즈 뭐 있어요?"를 줄이기 위해 위젯에도 표시
function sizeTextOf(p: AnyProduct | null): string {
  return p ? cleanOptionText(sizesOf(p)) : "";
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

// [2026-07-09] 품절 판정 — 고객 주문페이지 isSoldOutOrderProduct(app/order/page.tsx:775)와 동일 기준.
//   * 재고관리 OFF면 품절 처리 안 함(레거시 상품 보호)
//   * 옵션 상품 → 모든 옵션 재고가 0일 때만 품절
//   * 옵션 없는 상품 → 총재고 0일 때 품절
//   읽기 전용(주문/재고 로직 무관, 표시만).
function isSoldOutWidgetProduct(p: AnyProduct | null): boolean {
  if (!p) return false;
  let note: any = p.product_note;
  if (typeof note === "string") {
    try {
      note = JSON.parse(note);
    } catch {
      note = null;
    }
  }
  if (note?.stock_management_enabled !== true) return false;

  const variants = Array.isArray(note?.stock_variants) ? note.stock_variants : [];
  if (variants.length > 0) {
    return variants.every((v: any) => Number(v?.stock ?? 0) <= 0);
  }

  const stock = Number(p.stock ?? p.total_stock);
  return Number.isFinite(stock) && stock <= 0;
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
  // [2026-07-06] 문자열 → 구조화(제목/닉네임/내용): 상품 카드를 살짝 덮는 축하 오버레이로 표시
  const [toastQueue, setToastQueue] = useState<Array<{ icon: string; title: string; name: string; detail: string }>>([]);
  const [currentToast, setCurrentToast] = useState<{ icon: string; title: string; name: string; detail: string } | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  // 입금확인 폭죽(표시 전용). key 증가로 애니메이션 재시작, on으로 1회 표시.
  const [confettiKey, setConfettiKey] = useState(0);
  const [confettiOn, setConfettiOn] = useState(false);
  // 주문/취소 실시간 이벤트가 오면 상품(재고)을 즉시 다시 읽기 위한 핸들
  const reloadProductsRef = useRef<null | (() => void)>(null);

  // 위젯 위치 — 운영자가 드래그해서 원하는 곳에 두면 기억(localStorage, 보기 상태 전용·돈 로직 무관).
  // 저장 전(null)에는 기본 좌하단(left:24/bottom:24) 유지.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("ruru_product_widget_pos");
      if (raw) setPos(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);
  const startDragWidget = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, ev.clientX - dragRef.current.dx),
        y: Math.max(0, ev.clientY - dragRef.current.dy),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setPos((p) => {
        if (p && typeof window !== "undefined") {
          try {
            window.localStorage.setItem("ruru_product_widget_pos", JSON.stringify(p));
          } catch {
            // ignore
          }
        }
        return p;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

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
    // [2026-07-09] 주문이 들어오면 실시간 구독 쪽에서 이 함수를 불러 재고를 즉시 다시 읽는다.
    //   (평소 20초 폴링은 관리자 재고 수정 등 다른 변경 대비용으로 그대로 유지)
    reloadProductsRef.current = () => {
      void load();
    };

    void load();
    const timer = window.setInterval(() => void load(), 20000);
    return () => {
      alive = false;
      reloadProductsRef.current = null;
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
    const push = (item: { icon: string; title: string; name: string; detail: string }) => setToastQueue((q) => [...q, item]);

    // [2026-07-09] 재고 즉시 반영 — 주문/취소가 들어오면 상품을 곧바로 다시 읽는다.
    //   한 주문에 상품이 여러 개면 INSERT가 여러 번 오므로 0.4초 디바운스로 한 번만 재조회.
    //   (주문 제출 RPC가 재고차감과 orders INSERT를 같은 트랜잭션에서 커밋하므로, 이 시점엔 새 재고가 보인다)
    let reloadTimer: number | null = null;
    const scheduleStockReload = () => {
      if (reloadTimer) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        reloadProductsRef.current?.();
      }, 400);
    };

    const channel = supabase
      .channel("ruru-product-widget-events")
      // A. 주문서 작성 완료
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const row = (payload.new || {}) as AnyProduct;
        scheduleStockReload(); // 재고 즉시 갱신(중복 토스트 가드보다 먼저 — 상품행마다 재고가 줄기 때문)
        const key = `ins:${groupKey(row)}`;
        if (seenRef.current.has(key)) return; // 한 주문(여러 상품행) 중복 방지
        seenRef.current.add(key);
        push({ icon: "🛒", title: "주문서 제출!", name: `${nick(row)}님`, detail: `${pname(row)} · ${amount(row)}원` });
      })
      // B·C. 입금 확인(자동/수동) / D. 카드 결제 완료
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const row = (payload.new || {}) as AnyProduct;
        const oldRow = (payload.old || {}) as AnyProduct;
        const status = statusOf(row);
        const oldStatus = statusOf(oldRow);

        // 주문취소 등으로 상태가 바뀌면 재고가 복구될 수 있으므로 재고도 다시 읽는다.
        if (status !== oldStatus) scheduleStockReload();

        // B·C. 입금확인 (자동입금확인/수동입금확인/입금확인)
        if (/입금확인/.test(status) && !/입금확인/.test(oldStatus)) {
          const key = `dep:${groupKey(row)}`;
          if (!seenRef.current.has(key)) {
            seenRef.current.add(key);
            push({ icon: "✅", title: "입금 확인!", name: `${nick(row)}님`, detail: `${amount(row)}원 입금 완료` });
          }
        }

        // D. 카드 결제 완료
        if (status === "카드결제완료" && oldStatus !== "카드결제완료") {
          const key = `card:${groupKey(row)}`;
          if (!seenRef.current.has(key)) {
            seenRef.current.add(key);
            push({ icon: "💳", title: "카드 결제 완료!", name: `${nick(row)}님`, detail: `${amount(row)}원 결제 완료` });
          }
        }
      })
      .subscribe();
    return () => {
      if (reloadTimer) window.clearTimeout(reloadTimer);
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
    const t = window.setTimeout(() => setCurrentToast(null), 3000);
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
  const colors = colorsOf(current);
  const sizeText = sizeTextOf(current);
  // 색상 · 사이즈를 한 줄로. 둘 다 없으면 아예 안 그림("없음" 표시 금지)
  const optionText = [colors, sizeText].filter(Boolean).join("  |  ");
  const soldOut = isSoldOutWidgetProduct(current);
  const stock = soldOut ? "" : stockLabel(current); // 품절이면 "남은 0" 대신 SOLD OUT 오버레이로 알림

  // [2026-07-09] 시안 반영: 정사각형(1:1) 카드. 이미지가 카드를 채우고, 하단에 상품명[옵션]·금액.
  //   주문 제출/입금 확인 시 카드 위를 초록 "주문성공!" 오버레이가 덮는다(3초 자동 소멸).
  //   ※ 표시 전용 — 실시간 구독/금액 컬럼/중복가드/드래그 저장 로직은 무변경.
  const CARD = 240; // 카드 한 변(px). OBS에서 소스 크기로 더 키울 수 있음(벡터/이미지라 또렷).

  return (
    <div style={{ position: "fixed", inset: 0, background: "transparent", pointerEvents: "none", fontFamily: "Pretendard, Arial, sans-serif" }}>
      {/* 카드·오버레이·폭죽을 한 앵커에 묶어, 드래그로 옮기면 전부 같이 따라간다 */}
      <div
        style={{
          position: "absolute",
          left: pos ? `${pos.x}px` : "24px",
          top: pos ? `${pos.y}px` : undefined,
          bottom: pos ? undefined : "24px",
          width: `${CARD}px`,
          pointerEvents: "none",
        }}
      >
        {current ? (
          <div
            key={String(current?.id ?? rotIndex)}
            onMouseDown={startDragWidget}
            title="드래그해서 위치 이동 (위치 자동 저장)"
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "1 / 1",
              cursor: "move",
              pointerEvents: "auto",
              borderRadius: "14px",
              overflow: "hidden",
              background: "rgba(24,24,28,0.72)",
              backdropFilter: "blur(9px)",
              WebkitBackdropFilter: "blur(9px)",
              border: "1px solid rgba(255,255,255,0.16)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
              color: "#fff",
              animation: "ruruWidgetIn 0.5s ease",
            }}
          >
            {/* 상품 이미지 — 카드 전체를 채움 */}
            {img ? (
              <img src={img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "56px", opacity: 0.8 }}>👟</div>
            )}

            {/* [2026-07-09] 상품이 가려져서 하단 어두운 그라데이션 제거.
                대신 글씨에 검정 아웃라인(다방향 text-shadow)을 둘러 배경 없이도 또렷하게 읽히게 함. */}

            {pinned ? (
              <span style={{ position: "absolute", top: "7px", right: "8px", zIndex: 3, fontSize: "15px" }}>📌</span>
            ) : null}

            {/* 품절 오버레이 — 고객페이지와 동일 기준. 주문/입금 배너(zIndex 5)는 이 위에 뜬다. */}
            {soldOut ? (
              <div
                style={{
                  position: "absolute", inset: 0, zIndex: 4,
                  background: "rgba(0,0,0,0.55)",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: "4px",
                  pointerEvents: "none",
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: 900, letterSpacing: "0.12em", color: "#fff" }}>SOLD OUT</span>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>품절</span>
              </div>
            ) : null}

            {/* 하단: 상품명 / 옵션(색상·사이즈) / 금액 — 배경 없이 아웃라인 글씨만 */}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 2, padding: "10px 11px 11px" }}>
              <div
                style={{
                  fontSize: "15px", fontWeight: 900, lineHeight: 1.3, color: "#fff",
                  textShadow: OUTLINE_TEXT,
                  overflow: "hidden", textOverflow: "ellipsis",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-all",
                }}
              >
                {nameOf(current)}
              </div>

              {optionText ? (
                <div
                  style={{
                    marginTop: "2px", fontSize: "12px", fontWeight: 800, color: "#fff",
                    textShadow: OUTLINE_TEXT_SM,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {optionText}
                </div>
              ) : null}

              <div style={{ marginTop: "3px", display: "flex", alignItems: "baseline", gap: "7px" }}>
                <span style={{ fontSize: "20px", fontWeight: 900, color: "#fff", textShadow: OUTLINE_TEXT }}>
                  {priceOf(current).toLocaleString("ko-KR")}원
                </span>
                {stock ? (
                  <span style={{ fontSize: "11px", fontWeight: 800, color: "#fff", textShadow: OUTLINE_TEXT_SM }}>{stock}</span>
                ) : null}
              </div>
            </div>

            {/* 주문/입금 오버레이 — 카드 위를 덮는 초록 배너 (3초 자동 소멸) */}
            {currentToast ? (
              <div
                style={{
                  position: "absolute", left: "8px", right: "8px", top: "32%", zIndex: 5,
                  background: "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)",
                  border: "1.5px solid rgba(255,255,255,0.55)",
                  borderRadius: "11px",
                  padding: "9px 10px",
                  color: "#fff",
                  boxShadow: "0 0 24px rgba(34,197,94,0.55), 0 6px 16px rgba(0,0,0,0.4)",
                  animation: "ruruToastPop 0.5s cubic-bezier(0.18,0.89,0.32,1.28)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "16px", flexShrink: 0 }}>{currentToast.icon}</span>
                  <span style={{ fontSize: "14px", fontWeight: 900, letterSpacing: "0.02em" }}>{currentToast.title}</span>
                </div>
                <div style={{ marginTop: "2px", fontSize: "16px", fontWeight: 900, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {currentToast.name}
                </div>
                <div style={{ marginTop: "1px", fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.95)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {currentToast.detail}
                </div>
              </div>
            ) : null}

            {/* 폭죽 — 카드 중앙에서 터짐 */}
            {confettiOn ? (
              <div key={confettiKey} style={{ position: "absolute", left: "50%", top: "42%", width: 0, height: 0, pointerEvents: "none", zIndex: 6 }}>
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
          </div>
        ) : currentToast ? (
          // 띄운 상품이 없을 때도 주문/입금 알림은 보이게(카드 없이 배너만)
          <div
            style={{
              background: "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)",
              border: "1.5px solid rgba(255,255,255,0.55)",
              borderRadius: "11px", padding: "10px 12px", color: "#fff",
              boxShadow: "0 0 24px rgba(34,197,94,0.55), 0 6px 16px rgba(0,0,0,0.4)",
              animation: "ruruToastPop 0.5s cubic-bezier(0.18,0.89,0.32,1.28)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "16px" }}>{currentToast.icon}</span>
              <span style={{ fontSize: "14px", fontWeight: 900 }}>{currentToast.title}</span>
            </div>
            <div style={{ marginTop: "2px", fontSize: "16px", fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentToast.name}</div>
            <div style={{ marginTop: "1px", fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.95)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentToast.detail}</div>
          </div>
        ) : null}
      </div>

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
