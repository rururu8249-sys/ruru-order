"use client";

// components/order-feed-widget/OrderFeedWidgetClient.tsx
// [2026-09-12] 방송 화면용 «주문·입금 피드» 위젯 (PRISM/OBS 브라우저 소스) — 시안: 유튜브 채팅 말풍선처럼 쌓이는 알림
//
//   왜 만드나 (사장님 09-12)
//     봇이 유튜브 채팅에 글을 올리면 유튜브 API 쿼터를 쓴다(글 1개 = 50, 하루 60건 상한 — lib/chatOrderPipeline.ts).
//     이 위젯은 «영상 안에 그리는» 것이라 유튜브 API를 아예 안 쓴다 → 쿼터 0, 건수 제한 없음.
//     시청자 채팅창(앱이 그리는 부분)에 올라가는 게 아니므로 답글·다시보기 채팅에는 안 남는다 — 사장님 확인함.
//
//   실측 근거 (베베픽 세로 방송 캡처 900×2000, 2026-09-12)
//     · 앱 채팅 글자 ≈ 34px(= 화면 폭의 3.8%), 아바타 40px, 줄 간격 ≈ 60px, 흰 글자 + 그림자
//     · 앱 채팅이 차지하는 영역 = 아래 약 35% / 상단 채널바 = 위 약 9%
//     · 베베픽은 카톡 로고를 왼쪽 위(세로 15~20%), 채팅 강조 상자를 오른쪽 위(세로 20~31%)에 둔다
//     → 이 위젯 기본 크기: 폭 640px(세로 1080 방송에서 59%, 가로 1920 방송에서 33%), 닉네임 30px(세로 방송 폭의 2.8%)
//       = 앱 채팅보다 조금 작아서 «화면을 해치지 않으면서» 읽힌다. 배치는 사장님이 PRISM 에서 정한다.
//
//   무엇을 보여주나 (옵션·수량·금액은 안 띄움 — 남들이 보는 화면. 사이즈=몸 정보, 금액=돈 정보. lib/feedText.ts)
//     🛒 주문   「닉네임」님 주문 감사합니다 · 상품명(꼬리표·코드 뗀 20자) (여러 상품이면 「외 N종」)
//     💰 입금   「닉네임」님 입금 감사합니다
//     💳 카드   「닉네임」님 카드결제 감사합니다
//     · 전체 최대 3줄(📌 공지 포함) — 공지가 있으면 알림 2줄, 없으면 3줄. 아래에서 위로 쌓임(최신이 아래), 10초 뒤 사라짐.
//       (사장님 09-12: 「공지 포함해서 3줄, 4줄은 너무 많다」. 새 건이 오면 가장 오래된 줄이 먼저 빠진다)
//     · 줄 앞 작은 「주문/입금/카드」 표시 — 진짜 채팅으로 착각하지 않게(«댓글 왜 안 보여요» 혼란 방지).
//     · 📌 고정 공지 한 줄 (broadcasts.feed_pin_text · «이번 방송»의 속성) — 관리자 방송 콘솔 「제목·URL 수정」에서 쓰고 비우면 사라짐.
//       방송이 끝나면 같이 끝나고 다음 방송은 빈칸에서 시작(지난 방송 공지가 새어나가지 않음).
//       방송 ON 동안 맨 위에 계속 떠 있다(«입금자명은 닉네임으로» 같은 상시 안내용).
//
//   ⚠ 읽기 전용. orders 를 실시간 구독(INSERT/UPDATE)해서 «표시»만 한다. 돈·입금·상태 판정 로직은 상품 위젯과 같은 문자열 기준.
//   ⚠ 방송 OFF(활성 방송 없음)면 아무것도 안 그린다.   ?preview=1 이면 견본 3줄을 띄워 크기·위치 맞추기용.
//   ⚠ /product-widget 의 주문/입금 말풍선은 09-13 부터 기본 OFF(이 위젯이 그 역할). 예전처럼 켜려면 상품 위젯 주소에 ?toast=1.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getActiveBroadcast, loadAdminLiveBroadcasts } from "@/components/admin-live/liveBroadcastController";
import { feedOrderLines, type FeedLine, type FeedOrderItem } from "@/lib/feedText";
import { formatOrderOptionText } from "@/lib/orderOptionText";

type AnyRow = Record<string, any>;
type FeedKind = "order" | "deposit" | "card";
type FeedItem = { id: string; kind: FeedKind; nick: string; lines: FeedLine[]; at: number };   // lines: 상품 줄(왼쪽 상품명·옵션 / 오른쪽 금액), 최대 2줄

const SHOW_MS = 10000;      // 한 줄이 떠 있는 시간 (사장님 09-12: 10초)
const MAX_LINES = 3;        // 화면에 보이는 전체 줄 수 상한 — 📌 공지가 있으면 알림은 2줄 (사장님 09-12)
const WIDGET_W = 640;       // 기본 폭(px)
// [2026-09-13] «프리즘 네모 크기 = 위젯 크기» — 권장 네모 660×280 이 1배. 네모를 키우면 글자도 그 비율로 커지고, 줄이면 작아진다(비율 고정).
const BOX_W = 660, BOX_H = 300;   // 공지 + (상품 2줄 알림) 2개 = 약 270 → 300

const KIND_META: Record<FeedKind, { icon: string; tag: string; verb: string; accent: string }> = {
  order:   { icon: "🛒", tag: "주문", verb: "주문 감사합니다",   accent: "#22c55e" },   // 초록 = 상품 위젯 주문성공과 같은 톤
  deposit: { icon: "💰", tag: "입금", verb: "입금 감사합니다",   accent: "#60a5fa" },   // 파랑 = 입금/카드
  card:    { icon: "💳", tag: "카드", verb: "카드결제 감사합니다", accent: "#60a5fa" },
};

// [2026-09-13 사장님] 알림 줄 등장 = «커튼이 젖혀지듯» 왼쪽→오른쪽 열림 + 빛 한 줄이 따라감 + 「주문 감사합니다」 톡 튀며 등장 + 강조색 잔광.
//   📌 공지 줄은 상시라 애니메이션 없음. 전부 GPU 속성(clip-path·transform·opacity·box-shadow)이라 PRISM 부담 없음.
//   글로우 색: CEF 구버전을 생각해 color-mix 대신 rgba 문자열을 직접 만든다.
function glowOf(hex: string, alpha: number) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return `rgba(255,255,255,${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

// [2026-09-13 사장님] 닉네임 첫 글자 동그라미(아바타) 없앰 — 이름이 바로 첫 글자부터 보이게.
const EXIT_MS = 500;        // 사라질 때 커튼이 닫히는 시간(왼쪽→오른쪽) — 등장과 대칭. 알림은 «1회성»: 등장 1번, 퇴장 1번, 반복 없음.

const nickOf = (row: AnyRow) => String(row?.youtube_nickname || row?.nickname || row?.customer_name || "손님").trim();
const productOf = (row: AnyRow) => String(row?.product_name || row?.name || "").trim();
const statusOf = (row: AnyRow) => String(row?.admin_order_status_v2 || row?.order_manage_status || row?.deposit_status || "").trim();
const groupOf = (row: AnyRow) => String(row?.order_group_id || row?.id || "");

const PREVIEW_ROWS: FeedItem[] = [
  { id: "p1", kind: "order",   nick: "지니키키", lines: [{ left: "나이키 쭈리후드티_센터자수 · 블랙/L", right: "59,000원" }, { left: "뉴발란스740 · 240", right: "129,000원" }], at: 0 },
  { id: "p2", kind: "deposit", nick: "용서린",   lines: [], at: 0 },
  { id: "p3", kind: "card",    nick: "루루짱929", lines: [], at: 0 },
];

export default function OrderFeedWidgetClient() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [live, setLive] = useState(false);          // 활성 방송 있음
  const [previewMode, setPreviewMode] = useState(false);
  const [fitScale, setFitScale] = useState(1);
  const [pinText, setPinText] = useState("");
  const seenRef = useRef<Set<string>>(new Set());
  // 같은 주문(order_group_id)의 상품 여러 줄이 INSERT 로 따로 오므로 0.6초 모아서 한 줄로
  const pendingOrdersRef = useRef<Map<string, { nick: string; items: FeedOrderItem[]; timer: number | null }>>(new Map());

  // 배경 투명 (크로마키)
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

  // ?preview=1
  useEffect(() => {
    try { setPreviewMode(new URLSearchParams(window.location.search).get("preview") === "1"); } catch { setPreviewMode(false); }
  }, []);

  // 브라우저 소스 네모에 맞춰 통째로 확대/축소(비율 유지) — 권장 660×280 이면 1배
  useEffect(() => {
    const calc = () => {
      const s = Math.min(window.innerWidth / BOX_W, window.innerHeight / BOX_H);
      setFitScale(Number.isFinite(s) && s > 0 ? Math.min(3, s) : 1);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // 방송 ON/OFF + 📌 고정 공지 — 활성 방송 행 하나에서 같이 읽는다 (20초 폴링 + broadcasts 실시간)
  //   관리자가 📌 를 저장하면 broadcasts UPDATE → 즉시 다시 읽어 바로 반영. 방송 OFF 면 공지도 같이 사라짐.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const list = await loadAdminLiveBroadcasts();
        if (!alive) return;
        const active = getActiveBroadcast(list);
        setLive(Boolean(active));
        setPinText(String(active?.feed_pin_text ?? "").trim());
      } catch { /* 조회 실패 시 상태 유지 */ }
    };
    void check();
    const timer = window.setInterval(() => void check(), 20000);
    const ch = supabase
      .channel("ruru-order-feed-broadcasts")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "broadcasts" }, () => void check())
      .subscribe();
    return () => { alive = false; window.clearInterval(timer); supabase.removeChannel(ch); };
  }, []);

  const pushItem = (item: FeedItem) => {
    setItems((prev) => [...prev.filter((x) => x.id !== item.id), item].slice(-MAX_LINES));   // 넉넉히 들고, 그릴 때 공지 여부로 자른다
  };

  // 10초 지난 줄은 0.5초 동안 커튼 닫히듯 사라진 뒤 제거 (0.1초마다 확인 — 줄이 최대 3개라 부담 없음)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      setItems((prev) => (prev.some((x) => n - x.at > SHOW_MS + EXIT_MS) ? prev.filter((x) => n - x.at <= SHOW_MS + EXIT_MS) : prev));
    }, 100);
    return () => window.clearInterval(t);
  }, []);

  // 실시간: 주문(INSERT) / 입금확인·카드결제완료(UPDATE) — 상품 위젯(ProductWidgetClient)과 같은 판정 문자열
  useEffect(() => {
    const flushOrder = (key: string) => {
      const p = pendingOrdersRef.current.get(key);
      if (!p) return;
      pendingOrdersRef.current.delete(key);
      pushItem({ id: `ins:${key}`, kind: "order", nick: p.nick, lines: feedOrderLines(p.items, formatOrderOptionText), at: Date.now() });
    };

    const channel = supabase
      .channel("ruru-order-feed-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const row = (payload.new || {}) as AnyRow;
        if (row?.is_test_order === true || row?.is_deleted === true) return;
        const key = groupOf(row);
        const seenKey = `ins:${key}`;
        // [2026-09-13 사장님] 옵션·수량·금액도 같이 — orders 는 상품 한 줄이 한 행(color · size · qty · product_price=단가)
        const itemOf = (r: AnyRow): FeedOrderItem => ({ name: productOf(r), color: r?.color, size: r?.size, qty: r?.qty, price: r?.product_price });
        if (seenRef.current.has(seenKey)) {
          // 같은 주문의 다른 상품 줄 — 모으기만
          const p = pendingOrdersRef.current.get(key);
          if (p) { p.items.push(itemOf(row)); }
          return;
        }
        seenRef.current.add(seenKey);
        const entry = { nick: nickOf(row), items: [itemOf(row)], timer: null as number | null };
        entry.timer = window.setTimeout(() => flushOrder(key), 600);
        pendingOrdersRef.current.set(key, entry);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const row = (payload.new || {}) as AnyRow;
        const oldRow = (payload.old || {}) as AnyRow;
        if (row?.is_test_order === true) return;
        const status = statusOf(row);
        const oldStatus = statusOf(oldRow);
        const key = groupOf(row);
        if (/입금확인/.test(status) && !/입금확인/.test(oldStatus)) {
          const k = `dep:${key}`;
          if (!seenRef.current.has(k)) { seenRef.current.add(k); pushItem({ id: k, kind: "deposit", nick: nickOf(row), lines: [], at: Date.now() }); }
        }
        if (status === "카드결제완료" && oldStatus !== "카드결제완료") {
          const k = `card:${key}`;
          if (!seenRef.current.has(k)) { seenRef.current.add(k); pushItem({ id: k, kind: "card", nick: nickOf(row), lines: [], at: Date.now() }); }
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      for (const p of pendingOrdersRef.current.values()) if (p.timer) window.clearTimeout(p.timer);
      pendingOrdersRef.current.clear();
    };
  }, []);

  const showPin = (live || previewMode) && (pinText || (previewMode && !pinText));
  const pinShown = pinText || "공지: 입금자명은 닉네임으로 보내주세요";
  const rowCap = showPin ? MAX_LINES - 1 : MAX_LINES;   // 공지 포함 3줄
  const source = previewMode && items.length === 0 ? PREVIEW_ROWS : (live || previewMode ? items : []);
  const visible = source.slice(-rowCap);
  if (visible.length === 0 && !showPin) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "transparent", pointerEvents: "none", fontFamily: "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', Arial, sans-serif" }}>
      {/* 왼쪽 아래 기준. 맨 아래 📌 공지(고정) ← 그 위로 알림(최신이 공지 바로 위, 오래된 게 위로) — PRISM 네모 위치·크기는 사장님이 정한다 */}
      <div
        style={{
          position: "absolute", left: "8px", bottom: "8px", width: `${WIDGET_W}px`,
          display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: "10px",
          transform: fitScale !== 1 ? `scale(${fitScale})` : undefined, transformOrigin: "bottom left",
        }}
      >
        {visible.map((item) => {
          const meta = KIND_META[item.kind];
          const leaving = !previewMode && now - item.at > SHOW_MS;   // 10초 지남 → 커튼 닫히며 퇴장(0.5초)
          return (
            <div
              key={item.id}
              style={{
                alignSelf: "stretch", boxSizing: "border-box",                       // [09-13 사장님] 공지와 같은 폭(위젯 폭 전체) — 옵션·금액이 들어갈 자리
                position: "relative", overflow: "hidden",                            // 빛 줄이 말풍선 밖으로 안 나가게
                display: "flex", alignItems: "center", gap: "12px",
                padding: "10px 16px 10px 18px",
                borderRadius: "999px",
                background: "rgba(14, 12, 18, 0.56)",
                backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
                boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
                borderLeft: `5px solid ${meta.accent}`,
                // 등장: 커튼 열림(0.65초) → 강조색 잔광(0.4초 뒤, 1초).  퇴장: 커튼 닫힘(0.5초). 둘 다 1회.
                animation: leaving
                  ? `ruruCurtainOut ${EXIT_MS}ms ease-in forwards`
                  : "ruruCurtain 0.65s cubic-bezier(0.16,1,0.3,1) both, ruruGlow 1s ease-out 0.4s",
                ["--ruru-glow" as string]: glowOf(meta.accent, 0.6),
                textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                color: "#fff",
              } as React.CSSProperties}
            >
              {/* 빛 한 줄 — 커튼 가장자리를 따라 왼쪽→오른쪽으로 지나감 */}
              <span
                aria-hidden
                style={{
                  position: "absolute", top: 0, bottom: 0, left: 0, width: "38%", pointerEvents: "none",
                  background: "linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.28) 40%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0.28) 60%, rgba(255,255,255,0) 100%)",
                  transform: "translateX(-120%) skewX(-12deg)",
                  animation: "ruruShine 0.8s cubic-bezier(0.16,1,0.3,1) 0.05s both",
                }}
              />
              <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <span style={{ fontSize: "30px", fontWeight: 900, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.nick}<span style={{ fontSize: "22px", fontWeight: 800, opacity: 0.9 }}>님</span>
                  </span>
                  <span
                    style={{
                      flexShrink: 0, display: "inline-block", fontSize: "26px", fontWeight: 800, lineHeight: 1.1, color: meta.accent, whiteSpace: "nowrap",
                      transformOrigin: "left center",
                      animation: "ruruVerbPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.35s both",
                    }}
                  >
                    {meta.icon} {meta.verb}
                  </span>
                </span>
                {/* 상품 줄(최대 2줄): 왼쪽 상품명·옵션·수량은 길면 …, 오른쪽 금액은 절대 안 잘림 */}
                {item.lines.map((ln, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "14px", minWidth: 0 }}>
                    <span style={{ minWidth: 0, fontSize: "20px", fontWeight: 700, lineHeight: 1.2, color: "rgba(255,255,255,0.88)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ln.left}
                    </span>
                    {ln.right ? (
                      <span style={{ flexShrink: 0, fontSize: "20px", fontWeight: 900, lineHeight: 1.2, color: "#fff", whiteSpace: "nowrap" }}>
                        {ln.right}
                      </span>
                    ) : null}
                  </span>
                ))}
              </span>

              {/* 작은 «주문/입금/카드» 표시 — 진짜 채팅과 구분 */}
              <span
                style={{
                  flexShrink: 0, marginLeft: "4px", fontSize: "15px", fontWeight: 900, letterSpacing: "0.04em",
                  color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.35)",
                  borderRadius: "999px", padding: "3px 8px", textShadow: "none",
                }}
              >
                {meta.tag}
              </span>
            </div>
          );
        })}
        {/* 📌 고정 공지 — [2026-09-13 사장님 «위치가 지맘대로 바뀌었다 돌아온다»] 알림이 오면 공지가 위로 밀렸다가 내려오던 것.
            → 공지를 «맨 아래 고정». 알림은 공지 «위»로 쌓이고(최신이 공지 바로 위), 사라져도 공지는 그 자리. 방송 ON 동안 상시. */}
        {showPin ? (
          <div
            style={{
              alignSelf: "stretch", boxSizing: "border-box",                  // 알림 줄과 같은 폭(위젯 폭 전체)
              display: "flex", alignItems: "center", gap: "10px",
              padding: "9px 18px 9px 14px", marginTop: "4px",
              borderRadius: "999px",
              background: "rgba(123, 45, 67, 0.62)",
              backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
              boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
              border: "1.5px solid rgba(255,217,224,0.55)",
              color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.8)",
              fontSize: "24px", fontWeight: 900, lineHeight: 1.2, wordBreak: "keep-all",
            }}
          >
            <span style={{ fontSize: "24px", textShadow: "none" }}>📌</span>
            <span>{pinShown}</span>
          </div>
        ) : null}
      </div>
      <style>{`
        @keyframes ruruCurtain { from { clip-path: inset(0 100% 0 0 round 999px); transform: translateX(-10px); opacity: 0.7; } to { clip-path: inset(0 0 0 0 round 999px); transform: translateX(0); opacity: 1; } }
        @keyframes ruruCurtainOut { from { clip-path: inset(0 0 0 0 round 999px); opacity: 1; } to { clip-path: inset(0 0 0 100% round 999px); opacity: 0; } }
        @keyframes ruruShine   { from { transform: translateX(-120%) skewX(-12deg); } to { transform: translateX(330%) skewX(-12deg); } }
        @keyframes ruruGlow    { 0% { box-shadow: 0 4px 14px rgba(0,0,0,0.25), 0 0 0 0 var(--ruru-glow); } 35% { box-shadow: 0 4px 14px rgba(0,0,0,0.25), 0 0 26px 3px var(--ruru-glow); } 100% { box-shadow: 0 4px 14px rgba(0,0,0,0.25), 0 0 0 0 rgba(0,0,0,0); } }
        @keyframes ruruVerbPop { from { opacity: 0; transform: scale(1.5); } 60% { opacity: 1; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
