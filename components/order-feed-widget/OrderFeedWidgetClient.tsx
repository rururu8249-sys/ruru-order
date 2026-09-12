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
//   무엇을 보여주나 (금액은 절대 안 띄움 — 다른 시청자가 보는 화면)
//     🛒 주문   「닉네임」님 주문 완료 · 상품명 (한 주문에 여러 상품이면 「외 N개」)
//     💰 입금   「닉네임」님 입금 확인
//     💳 카드   「닉네임」님 카드결제 완료
//     · 최근 3줄, 아래에서 위로 쌓임(채팅처럼 최신이 아래), 10초 뒤 조용히 사라짐. 아무것도 없으면 완전 투명.
//       (사장님 09-12: 1~3줄·10초 — 방송 화면을 해치지 않는 선. 새 건이 오면 가장 오래된 줄이 먼저 빠진다)
//     · 줄 앞 작은 「주문/입금/카드」 표시 — 진짜 채팅으로 착각하지 않게(«댓글 왜 안 보여요» 혼란 방지).
//     · 📌 고정 공지 한 줄 (settings.order_feed_pin_text) — 관리자 방송 콘솔 「제목·URL 수정」에서 쓰고 비우면 사라짐.
//       방송 ON 동안 맨 위에 계속 떠 있다(«입금자명은 닉네임으로» 같은 상시 안내용).
//
//   ⚠ 읽기 전용. orders 를 실시간 구독(INSERT/UPDATE)해서 «표시»만 한다. 돈·입금·상태 판정 로직은 상품 위젯과 같은 문자열 기준.
//   ⚠ 방송 OFF(활성 방송 없음)면 아무것도 안 그린다.   ?preview=1 이면 견본 3줄을 띄워 크기·위치 맞추기용.
//   ⚠ /product-widget 의 배너 알림과 겹쳐 보이면 상품 위젯 쪽을 ?toast=0 으로 끈다.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getActiveBroadcast, loadAdminLiveBroadcasts } from "@/components/admin-live/liveBroadcastController";

type AnyRow = Record<string, any>;
type FeedKind = "order" | "deposit" | "card";
type FeedItem = { id: string; kind: FeedKind; nick: string; detail: string; at: number };

const SHOW_MS = 10000;      // 한 줄이 떠 있는 시간 (사장님 09-12: 10초)
const MAX_ROWS = 3;         // 동시에 보이는 최대 줄 수 (사장님 09-12: 1~3줄)
export const PIN_SETTING_KEY = "order_feed_pin_text";
const WIDGET_W = 640;       // 기본 폭(px) — PRISM 에서 크기를 줄여도 비율 유지

const KIND_META: Record<FeedKind, { icon: string; tag: string; verb: string; accent: string }> = {
  order:   { icon: "🛒", tag: "주문", verb: "주문 완료",   accent: "#22c55e" },   // 초록 = 상품 위젯 주문성공과 같은 톤
  deposit: { icon: "💰", tag: "입금", verb: "입금 확인",   accent: "#60a5fa" },   // 파랑 = 입금/카드
  card:    { icon: "💳", tag: "카드", verb: "카드결제 완료", accent: "#60a5fa" },
};

// 아바타 색 — 닉네임으로 정해지는 파스텔 (유튜브 기본 아바타처럼 사람마다 다른 색)
const AVATAR_COLORS = ["#F472B6", "#FB923C", "#FACC15", "#4ADE80", "#38BDF8", "#A78BFA", "#F87171", "#2DD4BF"];
function avatarColor(nick: string) {
  let h = 0;
  for (const ch of nick) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const nickOf = (row: AnyRow) => String(row?.youtube_nickname || row?.nickname || row?.customer_name || "손님").trim();
const productOf = (row: AnyRow) => String(row?.product_name || row?.name || "").trim();
const statusOf = (row: AnyRow) => String(row?.admin_order_status_v2 || row?.order_manage_status || row?.deposit_status || "").trim();
const groupOf = (row: AnyRow) => String(row?.order_group_id || row?.id || "");

const PREVIEW_ROWS: FeedItem[] = [
  { id: "p1", kind: "order",   nick: "지니키키", detail: "나이키 쭈리후드티 센터자수 외 1개", at: 0 },
  { id: "p2", kind: "deposit", nick: "용서린",   detail: "", at: 0 },
  { id: "p3", kind: "card",    nick: "루루짱929", detail: "", at: 0 },
];

export default function OrderFeedWidgetClient() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [live, setLive] = useState(false);          // 활성 방송 있음
  const [previewMode, setPreviewMode] = useState(false);
  const [fitScale, setFitScale] = useState(1);
  const [pinText, setPinText] = useState("");
  const seenRef = useRef<Set<string>>(new Set());
  // 같은 주문(order_group_id)의 상품 여러 줄이 INSERT 로 따로 오므로 0.6초 모아서 한 줄로
  const pendingOrdersRef = useRef<Map<string, { nick: string; products: string[]; timer: number | null }>>(new Map());

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

  // 브라우저 소스 창이 위젯 폭보다 좁으면 통째로 축소(비율 유지)
  useEffect(() => {
    const calc = () => {
      const s = Math.min(1, (window.innerWidth - 16) / (WIDGET_W + 16));
      setFitScale(Number.isFinite(s) && s > 0 ? s : 1);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // 방송 ON/OFF — 20초 폴링 + broadcasts 실시간
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const list = await loadAdminLiveBroadcasts();
        if (alive) setLive(Boolean(getActiveBroadcast(list)));
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

  // 📌 고정 공지 — settings 한 줄 읽기 + 실시간 반영(관리자가 저장하면 바로 바뀜)
  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const { data } = await supabase.from("settings").select("value").eq("key", PIN_SETTING_KEY).limit(1);
        if (alive) setPinText(String((data as AnyRow[] | null)?.[0]?.value ?? "").trim());
      } catch { /* 실패 시 이전 값 유지 */ }
    };
    void read();
    const ch = supabase
      .channel("ruru-order-feed-pin")
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, (payload) => {
        const row = ((payload as AnyRow).new || {}) as AnyRow;
        if (String(row?.key || "") === PIN_SETTING_KEY) setPinText(String(row?.value ?? "").trim());
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, []);

  const pushItem = (item: FeedItem) => {
    setItems((prev) => [...prev.filter((x) => x.id !== item.id), item].slice(-MAX_ROWS));
  };

  // 12초 지난 줄 정리(1초마다)
  useEffect(() => {
    const t = window.setInterval(() => {
      const now = Date.now();
      setItems((prev) => (prev.some((x) => now - x.at > SHOW_MS) ? prev.filter((x) => now - x.at <= SHOW_MS) : prev));
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  // 실시간: 주문(INSERT) / 입금확인·카드결제완료(UPDATE) — 상품 위젯(ProductWidgetClient)과 같은 판정 문자열
  useEffect(() => {
    const flushOrder = (key: string) => {
      const p = pendingOrdersRef.current.get(key);
      if (!p) return;
      pendingOrdersRef.current.delete(key);
      const names = p.products.filter(Boolean);
      const detail = names.length === 0 ? "" : names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}개`;
      pushItem({ id: `ins:${key}`, kind: "order", nick: p.nick, detail, at: Date.now() });
    };

    const channel = supabase
      .channel("ruru-order-feed-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const row = (payload.new || {}) as AnyRow;
        if (row?.is_test_order === true || row?.is_deleted === true) return;
        const key = groupOf(row);
        const seenKey = `ins:${key}`;
        if (seenRef.current.has(seenKey)) {
          // 같은 주문의 다른 상품 줄 — 모으기만
          const p = pendingOrdersRef.current.get(key);
          if (p) { p.products.push(productOf(row)); }
          return;
        }
        seenRef.current.add(seenKey);
        const entry = { nick: nickOf(row), products: [productOf(row)], timer: null as number | null };
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
          if (!seenRef.current.has(k)) { seenRef.current.add(k); pushItem({ id: k, kind: "deposit", nick: nickOf(row), detail: "", at: Date.now() }); }
        }
        if (status === "카드결제완료" && oldStatus !== "카드결제완료") {
          const k = `card:${key}`;
          if (!seenRef.current.has(k)) { seenRef.current.add(k); pushItem({ id: k, kind: "card", nick: nickOf(row), detail: "", at: Date.now() }); }
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      for (const p of pendingOrdersRef.current.values()) if (p.timer) window.clearTimeout(p.timer);
      pendingOrdersRef.current.clear();
    };
  }, []);

  const visible = previewMode && items.length === 0 ? PREVIEW_ROWS : (live || previewMode ? items : []);
  const showPin = (live || previewMode) && (pinText || (previewMode && !pinText));
  const pinShown = pinText || "공지: 입금자명은 닉네임으로 보내주세요";
  if (visible.length === 0 && !showPin) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "transparent", pointerEvents: "none", fontFamily: "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', Arial, sans-serif" }}>
      {/* 왼쪽 아래 기준으로 쌓임 — PRISM 에서 소스 위치·크기는 사장님이 정한다 */}
      <div
        style={{
          position: "absolute", left: "8px", bottom: "8px", width: `${WIDGET_W}px`,
          display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: "10px",
          transform: fitScale < 1 ? `scale(${fitScale})` : undefined, transformOrigin: "bottom left",
        }}
      >
        {/* 📌 고정 공지 — 피드 맨 위, 방송 ON 동안 상시. 다른 줄과 구분되게 딥로즈 테두리 */}
        {showPin ? (
          <div
            style={{
              alignSelf: "flex-start", maxWidth: "100%", boxSizing: "border-box",
              display: "flex", alignItems: "center", gap: "10px",
              padding: "9px 18px 9px 14px", marginBottom: "4px",
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
        {visible.map((item) => {
          const meta = KIND_META[item.kind];
          const initial = Array.from(item.nick)[0] || "?";
          return (
            <div
              key={item.id}
              style={{
                alignSelf: "flex-start", maxWidth: "100%", boxSizing: "border-box",   // 채팅처럼 글 길이만큼만 말풍선
                display: "flex", alignItems: "center", gap: "12px",
                padding: "10px 16px 10px 12px",
                borderRadius: "999px",
                background: "rgba(14, 12, 18, 0.56)",
                backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
                boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
                borderLeft: `5px solid ${meta.accent}`,
                animation: "ruruFeedIn 0.45s cubic-bezier(0.18,0.89,0.32,1.15)",
                textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                color: "#fff",
              }}
            >
              {/* 아바타 — 닉네임 첫 글자, 사람마다 다른 색 (유튜브 기본 아바타 느낌) */}
              <span
                style={{
                  flexShrink: 0, width: "44px", height: "44px", borderRadius: "50%",
                  background: avatarColor(item.nick), color: "#1b1620",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "22px", fontWeight: 900, textShadow: "none",
                }}
              >
                {initial}
              </span>

              <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <span style={{ fontSize: "30px", fontWeight: 900, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.nick}<span style={{ fontSize: "22px", fontWeight: 800, opacity: 0.9 }}>님</span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: "26px", fontWeight: 800, lineHeight: 1.1, color: meta.accent, whiteSpace: "nowrap" }}>
                    {meta.icon} {meta.verb}
                  </span>
                </span>
                {item.detail ? (
                  <span style={{ fontSize: "21px", fontWeight: 700, lineHeight: 1.2, color: "rgba(255,255,255,0.86)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.detail}
                  </span>
                ) : null}
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
      </div>
      <style>{`
        @keyframes ruruFeedIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
