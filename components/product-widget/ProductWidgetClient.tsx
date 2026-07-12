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

// 주문성공(초록) / 입금·카드완료(파랑) 알림 배너
type ToastItem = { icon: string; title: string; name: string; detail: string; tone: "green" | "blue" };

// 고객 주문서 주소 — QR로 그린다(파일 불필요, 항상 최신)

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

// [2026-07-09 사장님 지침] 사이즈는 항상 "36(S)" 형태로 표시. 표시 전용 — 저장값은 안 건드림.
// [2026-07-10 사장님 지침] 36/38/40 세 개만 괄호로 알파벳 병기(app/order/page.tsx와 동일 규칙).
//   4·6·8·10·12, S/M/L/XL/2XL, 250 등은 원문 그대로. (문자 S를 "36(S)"로 되돌리던 오표기 제거)
const SIZE_NUM_TO_LETTER: Record<string, string> = { "36": "S", "38": "M", "40": "L" };
function sizeDisplayLabel(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  if (SIZE_NUM_TO_LETTER[v]) return `${v}(${SIZE_NUM_TO_LETTER[v]})`;
  return v; // 그 외 사이즈는 저장된 그대로
}

// 사이즈 옵션 — 방송에서 "사이즈 뭐 있어요?"를 줄이기 위해 위젯에도 표시
function sizeTextOf(p: AnyProduct | null): string {
  if (!p) return "";
  const cleaned = cleanOptionText(sizesOf(p));
  if (!cleaned) return "";
  return cleaned.split(" · ").map(sizeDisplayLabel).filter(Boolean).join(" · ");
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

// 주문성공/입금완료/카드결제완료 폭죽(표시 전용) — 카드 밖에서 사방으로 시원하게 퍼진다.
//   [2026-07-09] 방송에서 잘 보이도록 입자 14 → 26개, 크기·비산거리 확대.
const CONFETTI_PIECES = [
  { tx: "104px", ty: "-38px", r: "-232deg", color: "#7B2D43", size: 11, round: true, dur: 1.49 },
  { tx: "71px", ty: "-34px", r: "-348deg", color: "#FFD9E0", size: 10, round: false, dur: 1.45 },
  { tx: "115px", ty: "-69px", r: "-101deg", color: "#F5C24B", size: 8, round: false, dur: 1.15 },
  { tx: "98px", ty: "-74px", r: "-397deg", color: "#22c55e", size: 9, round: true, dur: 1.15 },
  { tx: "92px", ty: "-84px", r: "-419deg", color: "#ffffff", size: 12, round: false, dur: 1.17 },
  { tx: "66px", ty: "-73px", r: "-414deg", color: "#6FC3E8", size: 12, round: false, dur: 1.45 },
  { tx: "45px", ty: "-61px", r: "-88deg", color: "#7B2D43", size: 8, round: true, dur: 1.43 },
  { tx: "45px", ty: "-75px", r: "53deg", color: "#FFD9E0", size: 11, round: false, dur: 1.19 },
  { tx: "36px", ty: "-77px", r: "91deg", color: "#F5C24B", size: 12, round: false, dur: 1.59 },
  { tx: "31px", ty: "-88px", r: "-329deg", color: "#22c55e", size: 12, round: true, dur: 1.44 },
  { tx: "23px", ty: "-91px", r: "222deg", color: "#ffffff", size: 8, round: false, dur: 1.43 },
  { tx: "11px", ty: "-77px", r: "-418deg", color: "#6FC3E8", size: 12, round: false, dur: 1.22 },
  { tx: "7px", ty: "-138px", r: "335deg", color: "#7B2D43", size: 10, round: true, dur: 1.38 },
  { tx: "-6px", ty: "-128px", r: "200deg", color: "#FFD9E0", size: 10, round: false, dur: 1.25 },
  { tx: "-14px", ty: "-92px", r: "-41deg", color: "#F5C24B", size: 8, round: false, dur: 1.44 },
  { tx: "-33px", ty: "-133px", r: "473deg", color: "#22c55e", size: 10, round: true, dur: 1.54 },
  { tx: "-36px", ty: "-100px", r: "-391deg", color: "#ffffff", size: 8, round: false, dur: 1.41 },
  { tx: "-39px", ty: "-82px", r: "160deg", color: "#6FC3E8", size: 9, round: false, dur: 1.66 },
  { tx: "-63px", ty: "-106px", r: "-460deg", color: "#7B2D43", size: 13, round: true, dur: 1.15 },
  { tx: "-84px", ty: "-113px", r: "102deg", color: "#FFD9E0", size: 10, round: false, dur: 1.52 },
  { tx: "-98px", ty: "-108px", r: "477deg", color: "#F5C24B", size: 12, round: false, dur: 1.58 },
  { tx: "-58px", ty: "-53px", r: "-349deg", color: "#22c55e", size: 10, round: true, dur: 1.38 },
  { tx: "-62px", ty: "-47px", r: "-416deg", color: "#ffffff", size: 13, round: false, dur: 1.52 },
  { tx: "-122px", ty: "-74px", r: "372deg", color: "#6FC3E8", size: 10, round: false, dur: 1.53 },
  { tx: "-103px", ty: "-49px", r: "-494deg", color: "#7B2D43", size: 11, round: true, dur: 1.31 },
  { tx: "-139px", ty: "-51px", r: "-301deg", color: "#FFD9E0", size: 11, round: false, dur: 1.14 },
];

export default function ProductWidgetClient() {
  const [pinned, setPinned] = useState<AnyProduct | null>(null);
  const [rotation, setRotation] = useState<AnyProduct[]>([]);
  const [rotIndex, setRotIndex] = useState(0);
  // 이벤트 토스트 — 여러 개 동시 도착 가능 → 큐로 순서대로 3초씩 표시
  // [2026-07-06] 문자열 → 구조화(제목/닉네임/내용): 상품 카드를 살짝 덮는 축하 오버레이로 표시
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([]);
  const [currentToast, setCurrentToast] = useState<ToastItem | null>(null);
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

        const broadcasts = await loadAdminLiveBroadcasts();
        const active = getActiveBroadcast(broadcasts);
        // [2026-07-12 사장님 지침] 현재 방송에 안 담긴 상품은 위젯에 안 띄운다.
        //   고정(is_pinned)이 전역 플래그라 지난 방송에서 고정한 상품이 새 방송에도 떠서
        //   "안 담았는데 왜 공개되냐" 사고가 남 → 고정 상품도 활성 방송 진열 목록에 있을 때만 표시.
        //   활성 방송이 없거나 진열 0개면 카드 없음(배너는 별개로 항상 표시). 표시 전용 — 고정 저장/DB 무변경.
        let ids: string[] = [];
        if (active?.id) {
          const { data: links } = await supabase
            .from("broadcast_products")
            .select("product_id, sort_order")
            .eq("broadcast_id", active.id)
            .order("sort_order", { ascending: true });
          ids = ((links as { product_id: unknown }[]) || []).map((r) => String(r.product_id));
          const byId = new Map(list.map((x) => [String(x?.id ?? x?.product_id), x]));
          const rot = ids.map((id) => byId.get(id)).filter(Boolean) as AnyProduct[];
          if (alive) setRotation(rot);
        } else if (alive) {
          setRotation([]);
        }

        const p = list.find((x) => x?.is_pinned === true || x?.pinned === true) || null;
        const pinnedInActive = p && ids.includes(String(p?.id ?? p?.product_id)) ? p : null;
        if (alive) setPinned(pinnedInActive);
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
    const push = (item: ToastItem) => setToastQueue((q) => [...q, item]);

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
        // 주문성공: "무엇을" 샀는지가 핵심 → 상품명. (입금완료는 "얼마" → 금액)
        push({ icon: "🎉", title: "주문성공!", name: `${nick(row)}님`, detail: pname(row), tone: "green" });
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
            push({ icon: "💰", title: "입금완료!", name: `${nick(row)}님`, detail: `${amount(row)}원`, tone: "blue" });
          }
        }

        // D. 카드 결제 완료
        if (status === "카드결제완료" && oldStatus !== "카드결제완료") {
          const key = `card:${groupKey(row)}`;
          if (!seenRef.current.has(key)) {
            seenRef.current.add(key);
            push({ icon: "💳", title: "카드결제완료!", name: `${nick(row)}님`, detail: `${amount(row)}원`, tone: "blue" });
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

  // [2026-07-09 v2] 사장님 지침 반영:
  //   ① 배경 바·그라데이션·그림자 전부 제거 → 글씨는 검정 아웃라인만으로 읽히게(상품 사진 안 가림)
  //   ② 카드 비율 1:1 → 3:4 (옷 사진이 세로로 길어서, 정사각형이면 글씨가 옷을 덮음)
  //   ※ 표시 전용 — 실시간 구독/금액 컬럼/중복가드/드래그 저장 로직은 무변경.
  //   [2026-07-11] 주문서 QR 블록 제거됨 — 아래 높이 서술은 히스토리.
  // 위젯 전체 폭(px). 상품카드가 이 폭을 쓴다.
  //   전체 높이 ≈ QR블록(폭+헤더 약 23px) + 간격 6px + 카드(폭×4/3)
  //   예) 200 → 약 496px  /  240 → 약 590px
  //   [2026-07-09] 방송화면에서 세로가 어깨 아래까지 내려와 240 → 200으로 축소.
  const CARD = 200;

  return (
    <div style={{ position: "fixed", inset: 0, background: "transparent", pointerEvents: "none", fontFamily: "Pretendard, Arial, sans-serif" }}>
      {/* [2026-07-12 사장님 지침] 주문방법 배너 — 위젯과 한 묶음. 브라우저 소스 하나로 배너+상품카드 동시 표시.
          항상 표시(상품카드 토글과 무관하게 유지 예정). 표시 전용 — 돈/주문/드래그 로직 무접촉. */}
      <img
        src="/order-banner.png"
        alt="주문방법 안내"
        style={{
          position: "absolute",
          top: "16px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(94vw, 1400px)",
          pointerEvents: "none",
        }}
      />
      {/* 카드·오버레이·폭죽을 한 앵커에 묶어, 드래그로 옮기면 전부 같이 따라간다 */}
      {/* [2026-07-12 사장님 지침] 기본 위치 좌하단 24px → 배너 바로 아래 오른쪽(참고 배열).
          PRISM에서 드래그가 어려워 기본값만으로 배너+카드 배열이 나오게 함.
          배너 높이 = 배너폭 × 700/2000(=0.35). 드래그 저장 위치(pos)가 있으면 기존대로 그게 우선. */}
      <div
        style={{
          position: "absolute",
          left: pos ? `${pos.x}px` : undefined,
          right: pos ? undefined : "24px",
          top: pos ? `${pos.y}px` : "calc(16px + min(94vw, 1400px) * 0.35 + 16px)",
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
              aspectRatio: "3 / 4",
              cursor: "move",
              pointerEvents: "auto",
              borderRadius: "10px",
              overflow: "hidden",
              background: "rgba(24,24,28,0.55)",
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
                {/* letter-spacing은 마지막 글자 뒤에도 공백을 넣어 가운데 정렬이 왼쪽으로 치우친다.
                    → textIndent로 그만큼 오른쪽으로 밀어 정확히 가운데 오게 보정. */}
                <span
                  style={{
                    fontSize: "30px", fontWeight: 900, lineHeight: 1, color: "#fff",
                    letterSpacing: "0.06em", textIndent: "0.06em",
                    textShadow: OUTLINE_TEXT,
                  }}
                >
                  SOLD OUT
                </span>
                <span
                  style={{
                    marginTop: "6px", fontSize: "17px", fontWeight: 900,
                    letterSpacing: "0.22em", textIndent: "0.22em",
                    color: "#fff", background: "#C0392B", borderRadius: "999px", padding: "3px 18px",
                  }}
                >
                  품절
                </span>
              </div>
            ) : null}

            {/* 하단: 상품명 / 옵션(색상·사이즈) / 금액 — 배경·음영 없이 아웃라인 글씨만 */}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 2, padding: "8px 9px 9px" }}>
              <div
                style={{
                  // [2026-07-11 사장님 요청] 상품명 폰트 17 → 20px
                  fontSize: "20px", fontWeight: 900, lineHeight: 1.15, color: "#fff",
                  textShadow: OUTLINE_TEXT,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {nameOf(current)}
              </div>

              {optionText ? (
                <div
                  style={{
                    marginTop: "1px", fontSize: "13px", fontWeight: 900, lineHeight: 1.25, color: "#fff",
                    textShadow: OUTLINE_TEXT_SM,
                    wordBreak: "keep-all", // 사이즈가 "36(S)·38(M)·4…"로 잘리지 않게 줄바꿈 허용
                  }}
                >
                  {optionText}
                </div>
              ) : null}

              <div style={{ marginTop: "2px", display: "flex", alignItems: "baseline", gap: "6px" }}>
                <span style={{ fontSize: "23px", fontWeight: 900, lineHeight: 1, color: "#fff", textShadow: OUTLINE_TEXT }}>
                  {priceOf(current).toLocaleString("ko-KR")}
                  <span style={{ fontSize: "14px", fontWeight: 800 }}>원</span>
                </span>
                {stock ? (
                  <span style={{ fontSize: "11px", fontWeight: 900, color: "#fff", textShadow: OUTLINE_TEXT_SM }}>{stock}</span>
                ) : null}
              </div>
            </div>

            {/* 주문성공(초록) / 입금·카드완료(파랑) 알림 — 3초 자동 소멸.
                반투명 위에 흰 글씨를 얹으면 뭉개지므로 불투명 배경 + 흰 테두리 + 상세는 흰 알약으로. */}
            {currentToast ? (
              <div
                style={{
                  position: "absolute", inset: 0, zIndex: 5,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "8px", background: "rgba(0,0,0,0.34)",
                  animation: "ruruToastPop 0.5s cubic-bezier(0.18,0.89,0.32,1.28)",
                }}
              >
                <div
                  style={{
                    width: "100%", borderRadius: "10px", padding: "9px 8px", textAlign: "center",
                    background: currentToast.tone === "green" ? "#16a34a" : "#1d4ed8",
                    border: "2px solid #fff",
                    color: "#fff",
                  }}
                >
                  <div style={{ fontSize: "14px", fontWeight: 900, lineHeight: 1.1 }}>
                    {currentToast.icon} {currentToast.title}
                  </div>
                  <div style={{ marginTop: "2px", fontSize: "18px", fontWeight: 900, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {currentToast.name}
                  </div>
                  {currentToast.detail ? (
                    <div
                      style={{
                        marginTop: "4px", display: "inline-block", maxWidth: "100%",
                        fontSize: "12px", fontWeight: 900,
                        color: currentToast.tone === "green" ? "#0b3d1e" : "#0b2a5e",
                        background: "#fff", borderRadius: "999px", padding: "3px 9px",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      {currentToast.detail}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

          </div>
        ) : currentToast ? (
          // 띄운 상품이 없을 때도 주문/입금 알림은 보이게(카드 없이 배너만)
          <div
            style={{
              background: currentToast.tone === "green" ? "#16a34a" : "#1d4ed8",
              border: "2px solid #fff",
              borderRadius: "10px", padding: "9px 10px", color: "#fff", textAlign: "center",
              animation: "ruruToastPop 0.5s cubic-bezier(0.18,0.89,0.32,1.28)",
            }}
          >
            <div style={{ fontSize: "14px", fontWeight: 900, lineHeight: 1.1 }}>{currentToast.icon} {currentToast.title}</div>
            <div style={{ marginTop: "2px", fontSize: "18px", fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentToast.name}</div>
            {currentToast.detail ? (
              <div style={{ marginTop: "4px", display: "inline-block", maxWidth: "100%", fontSize: "12px", fontWeight: 900, color: currentToast.tone === "green" ? "#0b3d1e" : "#0b2a5e", background: "#fff", borderRadius: "999px", padding: "3px 9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentToast.detail}</div>
            ) : null}
          </div>
        ) : null}

        {/* 폭죽 — 카드 밖(앵커)에서 터뜨려야 카드 overflow:hidden 에 안 잘리고 시원하게 퍼진다.
            주문성공/입금완료/카드결제완료 어떤 알림이든 1회 재생(표시 전용). */}
        {confettiOn ? (
          <div key={confettiKey} style={{ position: "absolute", left: "50%", top: "62%", width: 0, height: 0, pointerEvents: "none", zIndex: 9 }}>
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
