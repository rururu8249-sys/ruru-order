"use client";

// 방송 위젯 (OBS 브라우저 소스용) — 시안 6번.
// - 고정 상품(products.is_pinned): 카드 1개 좌하단 표시(📌)
// - 순환 상품(활성 방송 broadcast_products): 몇 초마다 스르륵 자동 전환
// - 주문 들어오면 «주문 완료», 입금확인·카드결제완료면 «결제 완료» 스티커가 카드 위에 3초 (orders 실시간, 2026-11-05 기본 켬)
// - 배경 투명(크로마키). 읽기 전용 — 돈/주문 로직 건드리지 않음.

import { useWidgetRotationIndex } from "@/lib/useWidgetRotationIndex";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { subscribeLiveEvents } from "@/lib/liveEvents";
import { parseChatMessage } from "@/lib/liveChat";
import { parseCartChatToast, parseWidgetFullLayout, WIDGET_TOAST_TAG } from "@/lib/widgetToast";
import { resolveProductImageUrl } from "@/components/admin-live/quick-product/productImageUrl";
import { getActiveBroadcast, loadAdminLiveBroadcasts } from "@/components/admin-live/liveBroadcastController";
import { resolveBroadcastBrandProducts } from "@/lib/productBrandLinks";
import { loadProductBrandCatalog } from "@/lib/productBrandCatalogClient";
import { splitOptionText } from "@/lib/optionSplit";
import { compressSizeList } from "@/lib/sizeRange";
import { cleanProductNameForFeed } from "@/lib/feedText";
import { isAvailableWidgetProduct, isSoldOutWidgetProduct } from "@/lib/widgetAvailability";
import {
  parseWidgetRotation,
  parseWidgetHistory,
  WIDGET_PRODUCT_HISTORY_SETTING_KEY,
  selectWidgetRotationItems,
  widgetRotationSettingKey,
  widgetRotationShouldAdvance,
  widgetTargetFromProduct,
  type WidgetRotationConfig,
} from "@/lib/widgetProductLibrary";

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
    return splitOptionText(raw).join(" · ");   // [2026-09-08] 쉼표만 구분 — lib/optionSplit.ts
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
//   [2026-09-11] 하단 글자는 반투명 띠 안으로 들어가 아웃라인이 필요 없어짐 → SOLD OUT 오버레이에만 남는다.
const OUTLINE_TEXT =
  "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000," +
  "-2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000, 0 3px 8px rgba(0,0,0,0.55)";
// [2026-09-13 사장님 «상품 위젯도 유리처럼 — 뒤가 비치면서 글자는 또렷»] 띠·사진 빈칸 42%, 흐림 없음.
//   읽히는 건 배경이 아니라 «글자 테두리»(검정 1px 8방향 + 아래 그림자) — 알림 위젯(TEXT_SHADOW)과 같은 방식, 글자가 작아 1px.
const SOFT_TEXT =
  "0 0 2px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.95), 1px 1px 0 rgba(0,0,0,0.85), -1px -1px 0 rgba(0,0,0,0.85), 1px -1px 0 rgba(0,0,0,0.85), -1px 1px 0 rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.6)";
const GLASS_BG = "rgba(20, 17, 24, 0.42)";   // 사진 빈칸 + 글자 띠 공통 (한 겹, 흐림 없음)
// [2026-09-13 사장님] 상품 카드 «고정» 높이(px). 상품이 바뀌어도 카드 네모는 항상 이 크기.
//   글자가 많으면 띠가 위로 자라고 사진칸이 그만큼 줄어든다(사진은 잘리지 않고 통째로 축소).
// [2026-09-19 사장님 «세로가 너무 길다»] 사진칸 3:4(267) → 1:1(200). 카드 387 → 320, 17% 짧아짐.
//   신발·가방·상의 위주라 1:1이 더 맞고, 흐린 배경 채우기 덕에 어떤 비율 사진이 와도 빈칸이 없다.
//   프리즘 네모(280×542)는 그대로 둬도 된다 — 왼쪽 아래 기준이라 위에 여백만 생기고 방송이 그대로 비친다.
const CARD_FIXED_H_CONST = 200 + 120;

// 주문성공(초록) / 입금·카드완료(파랑) 알림 배너
type ToastItem = { icon: string; title: string; name: string; detail: string; tone: "green" | "blue" | "pink"; amount?: string };

// [2026-11-05 사장님] 닉네임은 가리지(마스킹) 않고, 너무 길면 뒤를 자른다(스티커 폭 기준 7글자 넘으면 6글자+…, 뒤 「님」은 항상 보이게).
function clipNick(raw: string): string {
  const chars = Array.from(String(raw || "").trim());
  if (chars.length === 0) return "손님";
  return chars.length > 7 ? `${chars.slice(0, 6).join("")}…` : chars.join("");
}

// [2026-11-05 사장님 «구아바 참고, 베낀 티는 안 나게»] 주문·결제 소식 = 카드 위에 붙는 «스티커».
//   흰 스티커가 살짝 기울어 톡 붙고, 위에 색 띠(주문 완료=초록 / 결제 완료=파랑) + 닉네임 크게 + 아래 한 줄(상품명·금액).
//   표시 전용 — 어떤 주문을 띄울지(구독·중복 가드)는 그대로.
// [2026-11-06 사장님 «폭죽은 잠깐 터지고 끝»] 폭죽을 길고 화려하게: ①가운데서 두 번 터짐(0초·0.35초, 두 번째는 좌우 반대로)
//   ②위에서 색종이가 2.5초 동안 쏟아짐 ③조각마다 반짝반짝 깜빡임. 카드 밖으로는 안 나간다(카드가 잘라 줌).
// [2026-11-07 사장님 «과하게 화려한 것 말고 예쁘고 깔끔하게»] 반짝 깜빡임·빛 번짐을 빼고, 금색·흰색·연분홍 리본 조각이
//   천천히(약 3~4초) 흔들리며 내려온다. 가운데 터짐은 한 번만.
const CONFETTI_RAIN = Array.from({ length: 18 }, (_, i) => {
  const colors = ["#F5C24B", "#FFFFFF", "#FFB3C7", "#F5C24B", "#FFFFFF", "#9FD8B4"];
  return {
    left: `${(i * 37 + 5) % 96}%`,
    size: 6 + ((i * 5) % 3),
    color: colors[i % colors.length],
    round: i % 4 === 0,
    delay: ((i * 0.17) % 1.6).toFixed(2),
    dur: (2.8 + ((i * 7) % 10) / 10).toFixed(2),
    drift: `${((i % 2 ? 1 : -1) * (12 + ((i * 11) % 24)))}px`,
    spin: `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`,
  };
});
// [2026-11-13 19:01 사장님 «밑에서도 불꽃놀이처럼 올라와야»] 아래에서 불꽃 4발이 솟아올라 위에서 터진다(마지막 알림에만).
//   h = 이 층의 높이(px). 화면 전체 모드면 화면 높이, 카드 안이면 스티커 칸 높이. 표시 전용.
const FIREWORK_SHOTS = [
  { x: 12, apex: 0.30, delay: 0, color: "#FFD93D" },
  { x: 88, apex: 0.26, delay: 0.25, color: "#FF8AD8" },
  { x: 32, apex: 0.18, delay: 0.55, color: "#7DD3FC" },
  { x: 70, apex: 0.22, delay: 0.8, color: "#FFFFFF" },
];
// [19:06 사장님 «밑에서 쉬유유융~ 쏘아 올리면서 터지는 느낌»] 로켓: 밝은 머리 + 긴 꼬리 + 지나간 자리에 반짝이 부스러기,
//   1.2초 동안 위로 갈수록 느려지며(살짝 흔들림) 올라가 꼭대기에서 번쩍 → 두 겹 고리로 터짐.
const ROCKET_S = 1.2;
function Fireworks({ h }: { h: number }) {
  return (
    <div aria-hidden data-ruru-widget-confetti style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {FIREWORK_SHOTS.map((f, i) => {
        const rise = Math.round(h * (1 - f.apex));
        const spark = Math.max(18, Math.round(h * 0.14));
        const dot = Math.max(6, Math.round(h * 0.008));   // 화면 1920 → 15px
        const head = Math.max(5, Math.round(dot * 0.9));
        const tail = Math.max(16, Math.round(h * 0.11));
        const boom = f.delay + ROCKET_S - 0.05;
        return (
          <div key={i} style={{ position: "absolute", left: `${f.x}%`, bottom: 0, width: 0, height: 0 }}>
            {/* 로켓(머리+꼬리) — 위로 갈수록 느려짐 */}
            <div style={{
              position: "absolute", left: 0, top: 0, width: 0, height: 0, ["--rise" as any]: `-${rise}px`,
              animation: `ruruRocket ${ROCKET_S}s cubic-bezier(0.12,0.62,0.3,1) ${f.delay}s both`,
            }}>
              <span style={{
                position: "absolute", left: `-${Math.max(2, Math.round(head * 0.35))}px`, top: 0,
                width: `${Math.max(3, Math.round(head * 0.7))}px`, height: `${tail}px`, borderRadius: "999px",
                background: `linear-gradient(to bottom, ${f.color}, rgba(255,255,255,0))`, filter: "blur(0.5px)",
              }} />
              <span style={{
                position: "absolute", left: `-${head / 2}px`, top: `-${head / 2}px`, width: `${head}px`, height: `${head}px`, borderRadius: "50%",
                background: "#FFFFFF", boxShadow: `0 0 ${head}px ${f.color}, 0 0 ${head * 2}px ${f.color}`,
              }} />
            </div>
            {/* 지나간 자리 반짝이 부스러기 */}
            {Array.from({ length: 9 }, (_, k) => {
              const frac = (k + 1) / 10;
              const d = Math.max(3, Math.round(dot * 0.45));
              return (
                <span key={`t${k}`} style={{
                  position: "absolute", left: `${((k % 2) ? 1 : -1) * Math.round(d * 0.8) - d / 2}px`, top: `-${Math.round(rise * frac)}px`,
                  width: `${d}px`, height: `${d}px`, borderRadius: "50%", background: k % 3 === 0 ? "#FFFFFF" : f.color,
                  animation: `ruruTrail 0.7s ease-out ${(f.delay + ROCKET_S * Math.pow(frac, 1.9)).toFixed(2)}s both`,
                }} />
              );
            })}
            <div style={{ position: "absolute", left: 0, top: `-${rise}px`, width: 0, height: 0 }}>
              {/* 터지는 순간 번쩍 */}
              <span style={{
                position: "absolute", left: `-${spark * 0.5}px`, top: `-${spark * 0.5}px`, width: `${spark}px`, height: `${spark}px`, borderRadius: "50%",
                background: `radial-gradient(circle, rgba(255,255,255,0.95) 0%, ${f.color} 25%, rgba(255,255,255,0) 70%)`,
                animation: `ruruFlash 0.45s ease-out ${boom.toFixed(2)}s both`,
              }} />
              {/* 바깥 고리 22개 + 안쪽 고리 12개 */}
              {Array.from({ length: 34 }, (_, k) => {
                const inner = k >= 22;
                const a = inner ? ((k - 22) / 12) * Math.PI * 2 + 0.26 : (k / 22) * Math.PI * 2;
                const rr = inner ? spark * 0.55 : spark;
                const d = inner ? Math.max(4, Math.round(dot * 0.7)) : dot;
                return (
                  <span key={k} style={{
                    position: "absolute", left: `-${d / 2}px`, top: `-${d / 2}px`, width: `${d}px`, height: `${d}px`, borderRadius: "50%",
                    background: k % 3 === 0 ? "#FFFFFF" : f.color, boxShadow: `0 0 ${d}px ${f.color}`,
                    ["--sx" as any]: `${Math.round(Math.cos(a) * rr)}px`, ["--sy" as any]: `${Math.round(Math.sin(a) * rr)}px`,
                    animation: `ruruSpark 1.4s cubic-bezier(0.1,0.8,0.3,1) ${boom.toFixed(2)}s both`,
                  }} />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// [2026-11-13 사장님 «마지막 알림은 폭죽 더 화려하게»] grand = 가운데 두 번(좌우 반대) + 색종이 두 배.
function ConfettiBurst({ burstKey, grand }: { burstKey: number; grand?: boolean }) {
  const wave = (mirror: boolean, delay: number) =>
    CONFETTI_PIECES.map((p, i) => (
      <span
        key={`${mirror ? "b" : "a"}${i}`}
        style={{
          position: "absolute", width: `${p.size + 2}px`, height: `${p.size + 2}px`,
          borderRadius: p.round ? "50%" : "2px", background: p.color,
          ["--tx" as any]: mirror ? `calc(${p.tx} * -1)` : p.tx, ["--ty" as any]: p.ty, ["--r" as any]: p.r,
          animation: `ruruConfetti ${(p.dur + 0.9).toFixed(2)}s cubic-bezier(0.15,0.7,0.3,1) ${delay}s both`,
        }}
      />
    ));
  return (
    <div key={burstKey} aria-hidden data-ruru-widget-confetti style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
        {wave(false, 0)}
        {grand ? wave(true, 0.35) : null}
      </div>
      {(grand ? [...CONFETTI_RAIN, ...CONFETTI_RAIN.map((c, i) => ({ ...c, left: `${(i * 53 + 21) % 96}%`, delay: (Number(c.delay) + 0.8).toFixed(2) }))] : CONFETTI_RAIN).map((c, i) => (
        <span
          key={`r${i}`}
          style={{
            position: "absolute", top: "-12px", left: c.left, width: `${c.size}px`, height: `${c.round ? c.size : c.size * 2}px`,
            borderRadius: c.round ? "50%" : "2px", background: c.color, opacity: 0.95,
            ["--dx" as any]: c.drift, ["--spin" as any]: c.spin,
            animation: `ruruConfettiRain ${c.dur}s ease-in-out ${c.delay}s both`,
          }}
        />
      ))}
    </div>
  );
}

function ToastSticker({ toast, standalone, durMs = TOAST_SHOW_MS }: { toast: ToastItem; standalone?: boolean; durMs?: number }) {
  const tagBg = WIDGET_TOAST_TAG[toast.tone];
  return (
    <div
      data-ruru-widget-sticker
      style={{
        position: "relative",
        width: standalone ? "100%" : "86%",
        transform: "rotate(-5deg)",
        // [2026-11-07] 흔들기 빼고 톡 붙은 뒤 가만히 — 사라질 때만 0.5초 부드럽게
        animation: `ruruStickerIn 0.55s cubic-bezier(0.18,0.89,0.32,1.2) both, ruruStickerOut ${durMs <= 2500 ? 0.3 : 0.5}s ease-in ${(durMs - (durMs <= 2500 ? 300 : 500)) / 1000}s forwards`,
      }}
    >
      {/* [2026-11-06 사장님 «예수님처럼 빛만 비쳐»] 노란 별 모양 판·빛줄기는 뺐다 — 빛 고리 한 번만 남기고, 대신 폭죽을 크게 */}
      {[0].map((d) => (
        <span
          key={d}
          aria-hidden
          data-ruru-widget-burst
          style={{
            position: "absolute", left: "50%", top: "50%", width: "120px", height: "120px", marginLeft: "-60px", marginTop: "-60px",
            borderRadius: "50%", border: `4px solid ${d ? "#FFD93D" : tagBg}`, opacity: 0,
            animation: `ruruStickerBurst 0.9s ease-out ${0.1 + d}s both`,
          }}
        />
      ))}
      <div
        style={{
          position: "relative", background: "#FFFFFF", borderRadius: "14px", overflow: "hidden",
          boxShadow: "0 6px 18px rgba(0,0,0,0.35)", textAlign: "center", color: "#111111",
        }}
      >
        {/* 스티커 위를 한 번 쓱 지나가는 빛 */}
        <span
          aria-hidden
          data-ruru-widget-burst
          style={{
            position: "absolute", top: 0, bottom: 0, left: 0, width: "40%", zIndex: 1, pointerEvents: "none",
            background: "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)",
            animation: "ruruStickerShine 0.9s ease-out 0.5s both",
          }}
        />
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
            background: tagBg, color: "#FFFFFF", fontSize: "20px", fontWeight: 900, lineHeight: 1, padding: "7px 8px",
            letterSpacing: "0.02em",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          {toast.title}
        </div>
        <div style={{ padding: "8px 10px 9px" }}>
          <div style={{ fontSize: Array.from(toast.name).length <= 6 ? "20px" : Array.from(toast.name).length <= 8 ? "17px" : "14px", fontWeight: 900, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {toast.name}
          </div>
          {toast.detail ? (
            // [2026-11-06 사장님 «외 몇종 다음줄로 안 넘어가게, 상품은 한 줄»] 상품명만 말줄임, 「외 N종」은 늘 보이게 한 줄
            (() => {
              const m = toast.detail.match(/^(.*?)(\s외\s\d+종)$/);
              const main = m ? m[1] : toast.detail;
              const tail = m ? m[2] : "";
              return (
                <div style={{ marginTop: "4px", display: "flex", justifyContent: "center", fontSize: "13px", fontWeight: 800, lineHeight: 1.25, color: "#444444", whiteSpace: "nowrap", minWidth: 0 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{main}</span>
                  {tail ? <span style={{ flexShrink: 0 }}>{tail}</span> : null}
                </div>
              );
            })()
          ) : null}
          {toast.amount ? (
            <div style={{ marginTop: "3px", fontSize: "16px", fontWeight: 900, lineHeight: 1.1, color: "#2563EB" }}>{toast.amount}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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
// [2026-10-22 사장님 지시] 괄호 알파벳 병기 폐지 — 사이즈는 관리자가 적은 그대로만(36·38·40·4·6·8 모두). 표시 전용.
const SIZE_NUM_TO_LETTER: Record<string, string> = {};
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
  // [2026-09-11 사장님 지침] 이어진 사이즈는 「S ~ XXL」 한 토막, 중간이 비면 따로따로 — lib/sizeRange.ts (표시 전용)
  return compressSizeList(cleaned.split(" · ").map(sizeDisplayLabel).filter(Boolean)).join(" · ");
}

// [2026-07-23 사장님 지침] 조합형(combo_mode) 상품 전용 표시 정보.
//   평소(단일 옵션·일반) 상품은 combo_mode가 없어 null 반환 → 기존 표시 로직 그대로(무변경).
//   조합형일 때만: 세부상품명 전체 나열 대신 "종류 N가지" 요약 + 추가금 있으면 가격 뒤 "~".
//   표시 전용 — 재고/금액/주문 로직 무관.
type ComboWidgetInfo = { label: string; count: number; maxPlus: number };
function comboInfoOf(p: AnyProduct | null): ComboWidgetInfo | null {
  if (!p) return null;
  if (String(p.__detail_name || "").trim()) return null;
  let note: any = p.product_note;
  if (typeof note === "string") {
    try {
      note = JSON.parse(note);
    } catch {
      note = null;
    }
  }
  if (note?.combo_mode !== true) return null;
  const label = String(note?.option_label || "종류").trim() || "종류";
  let names: string[] = [];
  const raw = p.color_options;
  if (Array.isArray(raw)) {
    names = raw.map((s: unknown) => String(s).trim()).filter(Boolean);
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) names = parsed.map((s: unknown) => String(s).trim()).filter(Boolean);
    } catch {
      /* 문자열 파싱 실패 → 개수 0으로 두고 요약 미표시 */
    }
  }
  const pricing = note?.option_pricing && typeof note.option_pricing === "object" ? (note.option_pricing as Record<string, unknown>) : {};
  let maxPlus = 0;
  for (const name of names) {
    const plus = Number(pricing[name] ?? 0);
    if (Number.isFinite(plus) && plus > maxPlus) maxPlus = plus;
  }
  return { label, count: names.length, maxPlus };
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

// [2026-11-07 사장님 «고개 돌리는 순간 사라짐»] 스티커 3초 → 6초. 기다리는 소식이 쌓여 있으면 4.5초로(밀리지 않게).
// [2026-11-13 사장님] 하나면 8초. 여러 개가 밀리면 앞의 것은 2초씩 빨리 넘기고, 마지막 것만 8초 + 큰 폭죽.
const TOAST_SHOW_MS = 8000;
const TOAST_SHOW_BUSY_MS = 2000;

// 주문성공/입금완료/카드결제완료 폭죽(표시 전용) — 카드 밖에서 사방으로 시원하게 퍼진다.
//   [2026-07-09] 방송에서 잘 보이도록 입자 14 → 26개, 크기·비산거리 확대.
const CONFETTI_PIECES = [
  { tx: "104px", ty: "-38px", r: "-232deg", color: "#F5C24B", size: 11, round: true, dur: 1.49 },
  { tx: "71px", ty: "-34px", r: "-348deg", color: "#FFD9E0", size: 10, round: false, dur: 1.45 },
  { tx: "115px", ty: "-69px", r: "-101deg", color: "#F5C24B", size: 8, round: false, dur: 1.15 },
  { tx: "98px", ty: "-74px", r: "-397deg", color: "#FFB3C7", size: 9, round: true, dur: 1.15 },
  { tx: "92px", ty: "-84px", r: "-419deg", color: "#ffffff", size: 12, round: false, dur: 1.17 },
  { tx: "66px", ty: "-73px", r: "-414deg", color: "#FFFFFF", size: 12, round: false, dur: 1.45 },
  { tx: "45px", ty: "-61px", r: "-88deg", color: "#F5C24B", size: 8, round: true, dur: 1.43 },
  { tx: "45px", ty: "-75px", r: "53deg", color: "#FFD9E0", size: 11, round: false, dur: 1.19 },
  { tx: "36px", ty: "-77px", r: "91deg", color: "#F5C24B", size: 12, round: false, dur: 1.59 },
  { tx: "31px", ty: "-88px", r: "-329deg", color: "#FFB3C7", size: 12, round: true, dur: 1.44 },
  { tx: "23px", ty: "-91px", r: "222deg", color: "#ffffff", size: 8, round: false, dur: 1.43 },
  { tx: "11px", ty: "-77px", r: "-418deg", color: "#FFFFFF", size: 12, round: false, dur: 1.22 },
  { tx: "7px", ty: "-138px", r: "335deg", color: "#F5C24B", size: 10, round: true, dur: 1.38 },
  { tx: "-6px", ty: "-128px", r: "200deg", color: "#FFD9E0", size: 10, round: false, dur: 1.25 },
  { tx: "-14px", ty: "-92px", r: "-41deg", color: "#F5C24B", size: 8, round: false, dur: 1.44 },
  { tx: "-33px", ty: "-133px", r: "473deg", color: "#FFB3C7", size: 10, round: true, dur: 1.54 },
  { tx: "-36px", ty: "-100px", r: "-391deg", color: "#ffffff", size: 8, round: false, dur: 1.41 },
  { tx: "-39px", ty: "-82px", r: "160deg", color: "#FFFFFF", size: 9, round: false, dur: 1.66 },
  { tx: "-63px", ty: "-106px", r: "-460deg", color: "#F5C24B", size: 13, round: true, dur: 1.15 },
  { tx: "-84px", ty: "-113px", r: "102deg", color: "#FFD9E0", size: 10, round: false, dur: 1.52 },
  { tx: "-98px", ty: "-108px", r: "477deg", color: "#F5C24B", size: 12, round: false, dur: 1.58 },
  { tx: "-58px", ty: "-53px", r: "-349deg", color: "#FFB3C7", size: 10, round: true, dur: 1.38 },
  { tx: "-62px", ty: "-47px", r: "-416deg", color: "#ffffff", size: 13, round: false, dur: 1.52 },
  { tx: "-122px", ty: "-74px", r: "372deg", color: "#FFFFFF", size: 10, round: false, dur: 1.53 },
  { tx: "-103px", ty: "-49px", r: "-494deg", color: "#F5C24B", size: 11, round: true, dur: 1.31 },
  { tx: "-139px", ty: "-51px", r: "-301deg", color: "#FFD9E0", size: 11, round: false, dur: 1.14 },
];

export default function ProductWidgetClient() {
  const [pinned, setPinned] = useState<AnyProduct | null>(null);
  const [rotation, setRotation] = useState<AnyProduct[]>([]);
  const [rotationConfig, setRotationConfig] = useState<WidgetRotationConfig>({ mode: "all", paused: false, targets: [] });
  const rotIndex = useWidgetRotationIndex(rotationConfig, rotation.length, Boolean(pinned));
  // 이벤트 토스트 — 여러 개 동시 도착 가능 → 큐로 순서대로 3초씩 표시
  // [2026-07-06] 문자열 → 구조화(제목/닉네임/내용): 상품 카드를 살짝 덮는 축하 오버레이로 표시
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([]);
  const [currentToast, setCurrentToast] = useState<ToastItem | null>(null);
  const toastBusyRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());
  // 입금확인 폭죽(표시 전용). key 증가로 애니메이션 재시작, on으로 1회 표시.
  const [confettiKey, setConfettiKey] = useState(0);
  const [confettiOn, setConfettiOn] = useState(false);
  // 주문/취소 실시간 이벤트가 오면 상품(재고)을 즉시 다시 읽기 위한 핸들
  const reloadProductsRef = useRef<null | (() => void)>(null);

  const applyRotation = useCallback((next: AnyProduct[]) => {
    setRotation(next);
  }, []);

  // [2026-09-11 사장님 지적 «사진이 위젯 사이즈에 자동조절 안 되고 잘린다»]
  //   ① 사진: object-fit cover → contain (아래 img). 어떤 비율이든 카드 안에 통째로 들어온다.
  //   ② 카드: PRISM 브라우저 소스 창이 카드(200×267 + 여백 24)보다 작으면 창에 맞춰 통째로 축소.
  //      글자·띠·사진 비율이 그대로 줄어든다(transform: scale). 창이 충분히 크면 1배(기존 그대로).
  // [2026-09-13 사장님 «크기 줄이면 진짜 줄고 키우면 엄청 커짐 — 고정으로 적당한 사이즈로»]
  //   → 규칙을 하나로: «프리즘 네모 크기 = 카드 크기». 카드(200×320 비율, 09-19 전엔 387)를 네모에 꽉 차게 키우거나 줄인다(비율 고정, 위아래 모두).
  //   네모를 어떻게 잡든 카드는 항상 그 안에 같은 비율로 들어가고, 네모를 키운 만큼만 커진다(갑자기 튀지 않음).
  //   세로 방송(1080×1920) 권장 네모 = 폭 280 × 높이 542 (화면 폭의 26% — 사장님이 «잘 나온다»고 한 실방송 캡처 실측).
  const [fitScale, setFitScale] = useState(1);
  // [2026-11-13 사장님 «알림을 화면 정중앙에, 위젯은 하나로»] ?full=1 = 프리즘 소스를 «화면 전체»로 잡는 모드.
  //   카드는 화면 오른쪽 위(r·t·w = 화면 % — 기본 오른쪽 3%·위 7%·폭 26%), 알림 스티커는 화면 정중앙. 주소에 full 없으면 예전 그대로.
  const [layout, setLayout] = useState(() => parseWidgetFullLayout(""));
  const [vpW, setVpW] = useState(1080);
  const [vpH, setVpH] = useState(1920);
  useEffect(() => {
    const CARD_W = 200, CARD_H = CARD_FIXED_H;
    const calc = () => {
      const s = Math.min(window.innerWidth / CARD_W, window.innerHeight / CARD_H);
      setFitScale(Number.isFinite(s) && s > 0 ? Math.min(4, s) : 1);
      setVpW(window.innerWidth > 0 ? window.innerWidth : 1080);
      setVpH(window.innerHeight > 0 ? window.innerHeight : 1920);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // [2026-09-11] ?preview=1 — 방송이 없어도 «사진 있는 최근 상품» 한 장을 띄워 위젯 모양을 미리 본다(읽기 전용).
  //   PRISM 에 소스를 붙일 때 크기·위치를 맞추는 용도. 실제 방송 중엔 붙이지 않는다(방송 목록이 우선).
  const [previewMode, setPreviewMode] = useState(false);
  // [2026-09-13] 주문/입금 말풍선을 이 위젯에선 기본 OFF 로 뒀다가,
  // [2026-11-05 사장님 «주문 완료·결제 완료도 상품 위젯에 띄우자, 알림 위젯은 켤 때만 나오니 그냥 두자»] 다시 «기본 켬».
  //   상품 상관없이 모든 주문이 뜬다(사장님 선택). 끄고 싶을 때만 주소 뒤에 ?toast=0 (설정 화면엔 안 적음).
  const toastOffRef = useRef(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      setPreviewMode(q.get("preview") === "1");
      setLayout(parseWidgetFullLayout(window.location.search));
      toastOffRef.current = q.get("toast") === "0";
    } catch { setPreviewMode(false); }
  }, []);

  // [2026-09-13 사장님] 드래그 이동 삭제 — «프리즘 네모 = 카드» 라 위치는 프리즘에서 네모를 옮기면 된다.
  //   (예전 localStorage 위치 'ruru_product_widget_pos' 는 더 이상 읽지 않는다. 남아 있어도 무해.)

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
        // [2026-11-09 DB CPU 줄이기] 상품 전체(약 750개·모든 칸)를 20초마다 읽던 것 → 미리보기(방송 없음)일 때만 읽는다.
        //   방송 중 카드는 원래부터 loadProductBrandCatalog(이번 방송 상품) 결과만 썼다(list 는 미리보기 표본용).
        const loadAllProducts = async () => {
          const list: AnyProduct[] = [];
          for (let offset = 0; ; offset += 1000) {
            const { data, error } = await supabase.from("products").select("*").order("id").range(offset, offset + 999);
            if (error) throw error;
            const page = (data || []) as AnyProduct[];
            list.push(...page);
            if (page.length < 1000) break;
          }
          return list;
        };

        const broadcasts = await loadAdminLiveBroadcasts();
        const active = getActiveBroadcast(broadcasts);
        // [2026-07-12 사장님 지침] 관리자 "위젯 상품 ON/OFF" 토글 — OFF면 상품카드 숨김(위젯 완전 투명).
        //   widget_card_enabled가 null/undefined(컬럼 없던 옛 방송)면 ON 취급. 폴링(20초)마다 반영.
        if (active && (active as AnyProduct).widget_card_enabled === false) {
          if (alive) {
            setPinned(null);
            applyRotation([]);
            setRotationConfig({ mode: "all", paused: false, targets: [] });
          }
          return;
        }
        // 모든 순환 방식과 단일 고정은 현재 방송에 담긴 상품 안에서만 허용한다.
        // 활성 방송이 없으면 카드 없음. 위젯 OFF와 수동 고정 우선순위는 유지한다.
        let ids: string[] = [];
        if (active?.id) {
          const [{ data: links }, rotationResult, historyResult] = await Promise.all([
            supabase
              .from("broadcast_products")
              .select("product_id, sort_order")
              .eq("broadcast_id", active.id)
              .order("sort_order", { ascending: true }),
            supabase
              .from("settings")
              .select("value")
              .eq("key", widgetRotationSettingKey(String(active.id)))
              .maybeSingle(),
            supabase.from("settings").select("value").eq("key", WIDGET_PRODUCT_HISTORY_SETTING_KEY).maybeSingle(),
          ]);
          if (rotationResult.error) throw rotationResult.error;
          const rotationSetting = rotationResult.data;
          ids = ((links as { product_id: unknown }[]) || []).map((r) => String(r.product_id));
          const catalog = await loadProductBrandCatalog(ids);
          const allBroadcastItems = resolveBroadcastBrandProducts(catalog.products, catalog.links,
            ids.filter(id => catalog.products.some(row => String(row.id) === id))) as AnyProduct[];
          const nextRotationConfig = parseWidgetRotation(rotationSetting?.value);
          const rot = selectWidgetRotationItems(
            allBroadcastItems,
            nextRotationConfig,
            widgetTargetFromProduct,
            isAvailableWidgetProduct,
            historyResult.error ? [] : parseWidgetHistory(historyResult.data?.value),
          );
          const availableBroadcastItems = allBroadcastItems.filter(isAvailableWidgetProduct);
          if (alive) {
            applyRotation(rot);
            setRotationConfig(nextRotationConfig);
          }

          const pinMode = String((active as AnyProduct | null)?.widget_pin_mode || "auto");
          const pinProductId = String((active as AnyProduct | null)?.widget_pin_product_id ?? "");
          const pinDetailName = String((active as AnyProduct | null)?.widget_pin_detail_name || "").trim();
          // 수동 고정은 선택 순환 목록 밖 상품이어도 현재 방송에 담겨 있으면 항상 우선한다.
          const pinnedInActive = pinMode === "pin" && pinProductId ? availableBroadcastItems.find((item) => {
            const target = widgetTargetFromProduct(item);
            const parentId = String(item.__parent_product_id ?? target.productId);
            const detail = String(item.__detail_name ?? '').trim();
            return (target.productId === pinProductId || parentId === pinProductId) && (!pinDetailName || detail === pinDetailName);
          }) || null : null;
          if (alive) setPinned(pinnedInActive);
        } else if (alive) {
          applyRotation([]);
          setRotationConfig({ mode: "all", paused: false, targets: [] });
          setPinned(null);
          // 미리보기: 활성 방송이 없을 때만, 사진 있는 최근 상품 1개(품절 아닌 것)를 고정처럼 띄운다
          if (previewMode) {
            const list = await loadAllProducts();
            const sample = [...list]
              .filter((x) => imageOf(x) && isAvailableWidgetProduct(x))
              .sort((a, b) => String(b?.created_at || "").localeCompare(String(a?.created_at || "")))[0] || null;
            setPinned(sample);
          }
        }
      } catch {
        // 연결 확인 실패 시 이전 상품을 계속 방송하지 않는다.
        if (alive) { setPinned(null); applyRotation([]); }
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
  }, [applyRotation, previewMode]);

  // 순환 자동 전환 (고정상품 없을 때만)
  const rotationAdvances = widgetRotationShouldAdvance(rotationConfig, Boolean(pinned), rotation.length);


  // 실시간 이벤트 토스트: 주문(INSERT) / 입금확인·카드결제완료(UPDATE). 실제 컬럼명 기준.
  useEffect(() => {
    const nick = (row: AnyProduct) => clipNick(String(row?.youtube_nickname || row?.nickname || row?.customer_name || "손님"));
    // [2026-11-06 사장님] 결제완료 스티커에 금액은 안 띄운다(닉네임+상품명·옵션만) — 누가 얼마 썼는지 방송에 안 나가게.
    const pname = (row: AnyProduct) => String(row?.product_name || row?.name || "상품").trim();
    // 입금/카드 상태가 기록되는 실제 컬럼들
    const statusOf = (row: AnyProduct) => String(row?.admin_order_status_v2 || row?.order_manage_status || row?.deposit_status || "").trim();
    const groupKey = (row: AnyProduct) => String(row?.order_group_id || row?.id || "");
    const push = (item: ToastItem) => { if (toastOffRef.current) return; setToastQueue((q) => [...q, item]); };

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

    // [2026-11-06 사장님 «주문완료엔 상품명·옵션, 결제완료엔 상품명·옵션·금액 간략하게»]
    //   한 주문서의 상품 줄은 거의 동시에 여러 번 들어오므로 0.6초 모아서 한 번만 띄운다.
    //   보여주는 글: 「첫 상품명 블랙/L 외 N종」(주문완료·결제완료 같음, 금액은 안 띄움). 표시 전용 — 상태 판정 무변경.
    const optOf = (row: AnyProduct) =>
      [row?.color, row?.size]
        .map((v) => String(v ?? "").replace(/사이즈\s*/g, "").trim())
        .filter((v) => v && !EMPTY_OPTION_WORDS.has(v.toLowerCase()))
        .join("/");
    const itemLine = (rows: AnyProduct[]) => {
      if (rows.length === 0) return "";
      const first = rows[0];
      const label = `${cleanProductNameForFeed(pname(first))}${optOf(first) ? ` ${optOf(first)}` : ""}`;
      return rows.length > 1 ? `${label} 외 ${rows.length - 1}종` : label;
    };
    const buffers = new Map<string, { rows: AnyProduct[]; timer: number }>();
    const collect = (key: string, row: AnyProduct, make: (rows: AnyProduct[]) => ToastItem) => {
      const open = buffers.get(key);
      if (open) {
        if (!open.rows.some((r) => String(r?.id) === String(row?.id))) open.rows.push(row);
        return;
      }
      if (seenRef.current.has(key)) return; // 한 주문(여러 상품행) 중복 방지
      seenRef.current.add(key);
      const entry = { rows: [row], timer: 0 };
      entry.timer = window.setTimeout(() => { buffers.delete(key); push(make(entry.rows)); }, 600);
      buffers.set(key, entry);
    };
    const paidToast = (rows: AnyProduct[]): ToastItem => ({
      icon: "", title: "결제완료", name: `${nick(rows[0])}님`, detail: itemLine(rows), tone: "blue",
    });

    // [2026-11-09] DB CPU 줄이기 — postgres_changes(표 지켜보기) 대신 DB 트리거가 보내는 «소식»(lib/liveEvents)을 듣는다.
    //   payload 모양({new, old})은 예전과 같아서 아래 판정·스티커 코드는 그대로.
    const onOrderInsert = (payload: { new: AnyProduct }) => {
        const row = (payload.new || {}) as AnyProduct;
        scheduleStockReload(); // 재고 즉시 갱신(중복 토스트 가드보다 먼저 — 상품행마다 재고가 줄기 때문)
        if (row.is_test_order === true) return; // [2026-11-13] 테스트 주문은 방송 화면 스티커 안 띄움(실제로 안 산 구매 표시 금지)
        collect(`ins:${groupKey(row)}`, row, (rows) => ({ icon: "", title: "주문완료", name: `${nick(rows[0])}님`, detail: itemLine(rows), tone: "green" }));
    };
    // B·C. 입금 확인(자동/수동) / D. 카드 결제 완료
    const onOrderUpdate = (payload: { new: AnyProduct; old: AnyProduct }) => {
        const row = (payload.new || {}) as AnyProduct;
        const oldRow = (payload.old || {}) as AnyProduct;
        const status = statusOf(row);
        const oldStatus = statusOf(oldRow);

        // 주문취소 등으로 상태가 바뀌면 재고가 복구될 수 있으므로 재고도 다시 읽는다.
        if (status !== oldStatus) scheduleStockReload();

        if (row.is_test_order === true) return; // 테스트 주문은 결제완료 스티커도 안 띄움
        // B·C. 입금확인 (자동입금확인/수동입금확인/입금확인)
        if (/입금확인/.test(status) && !/입금확인/.test(oldStatus)) {
          collect(`dep:${groupKey(row)}`, row, paidToast);
        }

        // D. 카드 결제 완료
        if (status === "카드결제완료" && oldStatus !== "카드결제완료") {
          collect(`card:${groupKey(row)}`, row, paidToast);
        }
    };
    // [2026-07-12 사장님 지침] 즉각 반영 — 20초 폴링을 기다리지 않고 바로 다시 읽는다.
    //   E. 상품 변경(고정/해제·재고·이미지) F. 방송 진열 변경(담기/빼기/순서) G. 방송 변경(위젯 토글·시작/종료)
    //   = 'catalog' 소식. 공용 0.4초 디바운스(scheduleStockReload) 재사용. 소식이 안 와도 기존 20초 폴링이 백업.
    const unsubscribe = subscribeLiveEvents(supabase, {
      onOrder: (e) => {
        if (e.type === "INSERT") onOrderInsert({ new: e.new as AnyProduct });
        else if (e.type === "UPDATE") onOrderUpdate({ new: e.new as AnyProduct, old: e.old as AnyProduct });
      },
      onCatalog: () => scheduleStockReload(),
      // [2026-11-13 사장님] 장바구니 담음 — 유튜브 채팅엔 안 올리고 위젯 스티커로만. 사이트 채팅에 저장된 루루동이 글(bot_ref c:)을 받아 쓴다.
      onChat: (raw) => {
        const toast = parseCartChatToast(parseChatMessage(raw));
        if (!toast) return;
        const key = `cart:${toast.key}`;
        if (seenRef.current.has(key)) return;
        seenRef.current.add(key);
        push({ icon: "", title: "장바구니", name: `${clipNick(toast.nick)}님`, detail: toast.detail, tone: "pink" });
      },
    });
    return () => {
      if (reloadTimer) window.clearTimeout(reloadTimer);
      buffers.forEach((b) => window.clearTimeout(b.timer));
      unsubscribe();
    };
  }, []);

  // [2026-11-05] ?preview=1 에서는 가짜 소식(주문 완료 → 결제 완료)을 번갈아 띄워 스티커 모양을 미리 본다. 실제 주문과 무관.
  useEffect(() => {
    if (!previewMode || toastOffRef.current) return;
    const demo: ToastItem[] = [
      { icon: "", title: "장바구니", name: `${clipNick("예*")}님`, detail: "예시 니트 가디건 블랙/M 외 1종", tone: "pink" },
      { icon: "", title: "주문완료", name: `${clipNick("예시")}님`, detail: "예시 니트 가디건 블랙/M", tone: "green" },
      { icon: "", title: "결제완료", name: `${clipNick("닉네임이아주아주긴손님입니다")}님`, detail: "예시 니트 가디건 블랙/M 외 1종", tone: "blue" },
    ];
    let i = 0;
    const fire = () => { setToastQueue((q) => [...q, demo[i % demo.length]]); i += 1; };
    const first = window.setTimeout(fire, 1200);
    const timer = window.setInterval(fire, TOAST_SHOW_MS + 2000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [previewMode]);

  // 큐에서 다음 토스트 꺼내기: 표시 중이 아니고 대기열이 있으면 하나 꺼낸다.
  useEffect(() => {
    if (currentToast || toastQueue.length === 0) return;
    toastBusyRef.current = toastQueue.length > 1;
    setCurrentToast(toastQueue[0]);
    setToastQueue((q) => q.slice(1));
    // [2026-11-13] 밀린 알림(빨리 넘기는 것)엔 폭죽 없음, 마지막 알림에만 큰 폭죽(표시 전용)
    if (toastQueue.length > 1) { setConfettiOn(false); return; }
    setConfettiKey((k) => k + 1);
    setConfettiOn(true);
  }, [currentToast, toastQueue]);

  // 자동 숨김: currentToast가 생기면 3초 뒤 비운다. (이 effect는 currentToast에만 의존 →
  // 큐 변경으로 재실행되며 타이머가 즉시 clear되던 버그 수정. 3초 후 사라지고 다음 큐로 넘어감)
  useEffect(() => {
    if (!currentToast) return;
    const t = window.setTimeout(() => setCurrentToast(null), toastBusyRef.current ? TOAST_SHOW_BUSY_MS : TOAST_SHOW_MS);
    return () => window.clearTimeout(t);
  }, [currentToast]);

  // 폭죽 1회 재생 후 종료(1.4초). confettiKey가 바뀔 때마다 타이머 재무장.
  useEffect(() => {
    if (!confettiOn) return;
    const t = window.setTimeout(() => setConfettiOn(false), 5200);
    return () => window.clearTimeout(t);
  }, [confettiKey, confettiOn]);

  const current = pinned || (rotation.length > 0 ? rotation[rotIndex % rotation.length] : null);
  const img = imageOf(current);

  // [2026-07-12 사장님 지침] 간헐적 이미지 미표시 해결 — 불안정 회선(중국 현장 등)에서 저장소 이미지
  //   로드가 한 번 실패하면 재시도 없이 빈 카드로 남던 문제. 실패 시 1.5초 간격 자동 재시도(최대 6회),
  //   재시도마다 캐시 우회 쿼리(wr=n)로 강제 재요청. 상품이 바뀌면 카운터 리셋. 표시 전용.
  const [imgRetry, setImgRetry] = useState(0);
  const currentKey = `${String(current?.id ?? current?.product_id ?? "")}|${String(current?.__detail_name ?? "")}`;
  useEffect(() => {
    setImgRetry(0);
  }, [currentKey]);
  const imgSrc = imgRetry > 0 && img ? `${img}${img.includes("?") ? "&" : "?"}wr=${imgRetry}` : img;

  const colors = colorsOf(current);
  const sizeText = sizeTextOf(current);
  // [2026-07-23] 조합형(combo_mode)만 "종류 N가지" 요약 — 세부상품명 수십 개가 카드에 쏟아지던 문제.
  //   평소 상품(comboInfo=null)은 기존과 동일: 색상 · 사이즈를 한 줄로. 둘 다 없으면 아예 안 그림.
  const comboInfo = comboInfoOf(current);
  // [2026-09-11 사장님 지적 «색상, 사이즈 옵션도 맞나?»] 「색상들 | 사이즈들」 한 줄 뭉치 → 줄마다 작은 이름표(색상/사이즈/종류)를 붙여 따로 보여준다.
  const optionRows: { label: string; value: string }[] = comboInfo
    ? (comboInfo.count > 0 ? [{ label: comboInfo.label, value: `${comboInfo.count}가지` }] : [])
    : [colors ? { label: "색상", value: colors } : null, sizeText ? { label: "사이즈", value: sizeText } : null].filter(Boolean) as { label: string; value: string }[];
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
  // [2026-09-13 사장님] 카드 크기 «고정». 예전(09-11)엔 사진 비율대로 칸 높이가 바뀌어 상품마다 위젯이 커졌다 작아졌다 했다.
  //   → 카드 전체를 200×320(09-19 전엔 387) 으로 못 박고, 글자 띠가 아래를 차지한 «나머지»가 사진칸. 사진은 그 칸 안에 통째로 들어간다(contain, 잘림 없음).
  //   세로 사진은 칸에 꽉 차고 가로 사진은 위아래에 카드색이 남는다 — 어느 상품이든 방송 화면에서 차지하는 네모는 같다.
  const CARD_FIXED_H = CARD_FIXED_H_CONST;   // = 320 (09-19, 예전 387)

  return (
    <div style={{ position: "fixed", inset: 0, background: "transparent", pointerEvents: "none", fontFamily: "Pretendard, Arial, sans-serif" }}>
      {/* [2026-07-12 사장님 확정] 내장 배너 제거 — 위젯은 상품카드만. 주문방법 배너는
          PRISM에 PNG 이미지 소스로 직접 올려서 운영(두 겹 표시 방지). 기본 위치도 원래 좌하단 복원. */}
      {/* 카드·오버레이·폭죽을 한 앵커에 묶는다. [2026-09-13] 왼쪽 아래 딱 붙여 네모에 꽉 차게(비율 고정) 확대/축소 */}
      <div
        style={{
          position: "absolute",
          ...(layout.full
            ? { right: `${layout.right}%`, top: `${layout.top}%`, transform: `scale(${(vpW * layout.width) / 100 / CARD})`, transformOrigin: "top right" }
            : { left: 0, bottom: 0, transform: fitScale !== 1 ? `scale(${fitScale})` : undefined, transformOrigin: "bottom left" }),
          width: `${CARD}px`,
          pointerEvents: "none",
        }}
      >

        {current ? (
          <div
            key={currentKey || String(rotIndex)}
            data-ruru-widget-card
            style={{
              position: "relative",
              width: "100%",
              // [2026-09-13] 카드 높이 «고정» — 위: 사진칸(나머지 전부) / 아래: 글자 띠(내용만큼). 상품이 바뀌어도 네모 크기는 그대로
              height: `${CARD_FIXED_H}px`,
              display: "flex", flexDirection: "column",
              pointerEvents: "none",
              borderRadius: "10px",
              overflow: "hidden",
              // [2026-09-13 사장님 «반투명이 반투명스럽지 않다»] 카드 전체 배경(55%) 위에 띠(50%)가 겹쳐 실제론 약 78% 였다.
              //   → 카드 배경 없앰. 반투명은 사진칸·띠에 «한 겹(50%)»만.
              background: "transparent",
              color: "#fff",
              animation: rotationAdvances
                ? "ruruWidgetCycle 5s linear both"
                : "ruruWidgetIn 0.34s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {/* [2026-11-06 사장님 «평상시에도 테두리가 반짝이며 돌게» → 13:27 참고 영상처럼] 테두리에 빛 한 줄기(분홍→노랑)가 계속 돈다(주문·결제 땐 그 위에 초록/파랑 번쩍) */}
            <span
              aria-hidden
              data-ruru-widget-rainbow
              style={{
                position: "absolute", inset: 0, zIndex: 5, borderRadius: "10px", padding: "3px", pointerEvents: "none",
                // 무지개 전체 대신 «빛 한 줄기»가 둘레를 돈다(분홍→노랑→흰 끝) — 상품 사진에서 눈을 안 뺏게
                background: "conic-gradient(from var(--ruru-ang), transparent 0deg 250deg, rgba(255,138,216,0.15) 262deg, #FF8AD8 305deg, #FFD93D 345deg, #FFFFFF 357deg, transparent 360deg)",
                WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                WebkitMaskComposite: "xor",
                mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
                animation: "ruruRainbowSpin 2.6s linear infinite, ruruRainbowGlint 1.3s ease-in-out infinite",
              }}
            />
            {/* 사진칸 — [2026-09-11 사장님 지적 «사진이 잘린다·글자가 사진을 덮는다»]
                · 사진은 자기 비율 그대로 안 잘리게(contain). 비율이 안 맞아 남는 자리는 «같은 사진을 흐리게 키운 것»으로 채운다 → 빈칸 없음(09-19).
                · 글자 띠는 이 칸 «아래»에 붙는다 → 사진은 한 픽셀도 안 가려진다. */}
            {/* [2026-09-20 사장님 요청] 사진칸을 «정사각형»으로 못 박는다.
                예전엔 flex:1 이라 글자 띠 높이(상품명 줄 수)에 따라 사진칸이 세로로 늘었다 줄었다 했다.
                → 카드 폭과 같은 200×200 고정. 2026-09-20 이후 등록한 대표사진은 이미 1:1 이라 여백 없이 꽉 찬다.
                그 전에 올린 사진(비율 제각각)은 아래 «흐린 같은 사진»이 남는 자리를 메운다. */}
            {img ? (
              <div data-ruru-widget-photo style={{ position: "relative", flex: `1 1 ${CARD}px`, minHeight: 0, width: "100%", background: GLASS_BG, overflow: "hidden" }}>
                {/* [2026-11-06 사장님 «저 사이만 밝다»] 어둡게 하는 막을 사진칸 «전체»에 깐다(예전엔 위 200px만 덮어 아래 띠가 밝게 남았음) */}
                {currentToast ? (
                  <span aria-hidden style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none", background: "rgba(0,0,0,0.22)", animation: `ruruDimIn 0.3s ease-out both, ruruDimOut 0.5s ease-in ${((toastBusyRef.current ? TOAST_SHOW_BUSY_MS : TOAST_SHOW_MS) - 500) / 1000}s forwards` }} />
                ) : null}
                {/* [2026-09-19 사장님 «위아래 빈 공간이 거슬린다»] 사진 비율이 틀과 안 맞을 때 생기던 반투명 빈칸을
                    «같은 사진을 흐리게 키운 것»으로 채운다(쇼핑앱 상세 사진과 같은 방식). 틀은 고정, 사진은 안 잘리고, 빈칸은 없다. */}
                <img
                  src={imgSrc}
                  alt=""
                  aria-hidden
                  style={{
                    position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center",
                    filter: "blur(14px) brightness(0.72) saturate(1.1)", transform: "scale(1.18)", pointerEvents: "none",
                  }}
                />
                <img
                  src={imgSrc}
                  alt=""
                  onError={() => {
                    if (imgRetry < 6) window.setTimeout(() => setImgRetry((v) => v + 1), 1500);
                  }}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: "center" }}
                />
              </div>
            ) : (
              <div data-ruru-widget-photo style={{ flex: `1 1 ${CARD}px`, minHeight: 0, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "56px", opacity: 0.8, background: GLASS_BG }}>👟</div>
            )}

            {/* [2026-07-09] 상품이 가려져서 하단 어두운 그라데이션 제거.
                대신 글씨에 검정 아웃라인(다방향 text-shadow)을 둘러 배경 없이도 또렷하게 읽히게 함. */}

            {/* [2026-11-06 사장님] 오른쪽 위 📌 표시 삭제(고정 기능은 그대로) */}

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

            {/* 하단 띠: 상품명 / 옵션(색상·사이즈) + 금액
                [2026-09-11 사장님 지침] 글자가 사진을 다 덮던 것 → 사진 아래쪽 가장자리에 붙은 «반투명 띠» 하나에 담는다.
                  · 띠는 카드와 같은 폭·같은 모서리(카드 overflow:hidden 안) → 사진과 한 덩어리
                  · 반투명(62%) + 뒤 흐림이라 띠 뒤로 사진이 비친다. 높이는 글자 2줄(상품명 / 옵션·금액) ≈ 카드의 1/4
                  · 아웃라인 글씨(text-shadow)는 띠가 생겨 필요 없어짐 → 제거(더 깔끔) */}
            <div
              data-ruru-widget-info
              style={{
                position: "relative", zIndex: 2, flex: "0 0 auto",
                padding: "8px 10px 9px",
                // [2026-09-12 사장님 결정] 띠 50% — 방송 화면이 더 비친다. 흰 글자가 밝은 배경(흰 옷·밝은 벽)에서도 읽히게
                //   글자마다 옅은 그림자(SOFT_TEXT)를 얹는다(예전 2px 검정 테두리보다 훨씬 옅음).
                //   계산: 검정 50% 위 흰 글자 = 밝은 배경에서 대비 약 3.6:1(기준 4.5:1 미달) → 그림자로 보완. 74%였을 땐 약 9:1.
                background: "rgba(12,18,28,0.6)", // [2026-11-06 사장님 «너무 시커매»] 0.86 → 0.6
                borderTop: "1px solid rgba(255,255,255,0.14)",
                textShadow: SOFT_TEXT,
              }}
            >
              {/* 1) 상품명 — [2026-09-11 사장님 «안 잘렸으면»] 16px 로 최대 3줄까지 다 보여준다(그보다 길 때만 …).
                  띄어쓰기 없는 긴 이름도 밖으로 안 튀어나가게 overflowWrap */}
              <div
                style={{
                  fontSize: "16px", fontWeight: 900, lineHeight: 1.2, color: "#FFE59A", wordBreak: "keep-all", overflowWrap: "anywhere",
                }}
              >
                {nameOf(current)}
              </div>

              {/* 2)·3) 옵션 — 줄마다 작은 이름표(색상 / 사이즈 / 종류). 값이 길면 줄바꿈(최대 2줄) */}
              {optionRows.map((row) => (
                <div key={row.label} style={{ marginTop: "4px", display: "flex", alignItems: "flex-start", gap: "6px" }}>
                  <span
                    style={{
                      flexShrink: 0, marginTop: "1px",
                      fontSize: "10px", fontWeight: 900, lineHeight: 1, letterSpacing: "0.02em",
                      color: "#fff", background: "rgba(255,255,255,0.18)",
                      borderRadius: "5px", padding: "3px 5px",
                    }}
                  >
                    {row.label}
                  </span>
                  <span
                    style={{
                      minWidth: 0, fontSize: "13px", fontWeight: 800, lineHeight: 1.3, color: row.label === "색상" ? "#9EEAFF" : "#C5F5B2",
                      wordBreak: "keep-all", overflowWrap: "anywhere",
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}

              {/* 4) 남은 수량(왼쪽 끝) ······ 금액(오른쪽 끝) — [사장님 «금액 앞에 붙어 있으면 안 됨»] 양끝으로 떨어뜨림 */}
              <div style={{ marginTop: "6px", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
                <span
                  style={{
                    fontSize: "11px", fontWeight: 900, color: "#FFD9E0", visibility: stock ? "visible" : "hidden",
                    background: "rgba(255,255,255,0.12)", borderRadius: "999px", padding: "3px 8px",
                  }}
                >
                  {stock || "·"}
                </span>
                <span data-ruru-widget-price style={{ display: "inline-block", fontSize: "22px", fontWeight: 900, lineHeight: 1, color: "#FFE59A", whiteSpace: "nowrap", transformOrigin: "right center", animation: "ruruPricePulse 2.4s ease-in-out infinite" }}>
                  {priceOf(current).toLocaleString("ko-KR")}
                  {/* [2026-07-23] 조합형 + 추가금 옵션 존재 시 "원~" — 고객 주문페이지 카드와 동일 규칙. 평소 상품은 "원" 그대로. */}
                  <span style={{ fontSize: "13px", fontWeight: 800, marginLeft: "1px" }}>{comboInfo && comboInfo.maxPlus > 0 ? "원~" : "원"}</span>
                </span>
              </div>
            </div>

            {/* [2026-11-05] 판매 중 표시 — 사진 왼쪽 위 빨간 알약, 점이 숨 쉬듯 깜빡(품절이면 안 보임) */}
            {!soldOut ? (
              <span
                data-ruru-widget-live
                style={{
                  position: "absolute", top: "7px", left: "7px", zIndex: 3,
                  display: "inline-flex", alignItems: "center", gap: "5px",
                  background: "#FF3B30", color: "#FFFFFF", borderRadius: "999px", padding: "4px 8px 4px 7px",
                  fontSize: "11px", fontWeight: 900, lineHeight: 1, letterSpacing: "0.02em",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                }}
              >
                <span data-ruru-widget-live-dot style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#FFFFFF", animation: "ruruLiveDot 1.2s ease-in-out infinite" }} />
                판매중
              </span>
            ) : null}

            {/* 주문 완료(초록) / 결제 완료(파랑) 스티커 — 6초(쌓이면 4.5초) 뒤 부드럽게 사라짐. 사진칸 가운데에 붙고, 카드 테두리가 그 색으로 한 번 번쩍 */}
            {currentToast ? (
              <>
                {!layout.full ? <div
                  style={{
                    position: "absolute", left: 0, right: 0, top: 0, height: `${CARD}px`, zIndex: 5,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {confettiOn ? <ConfettiBurst burstKey={confettiKey} grand /> : null}
                  {confettiOn ? <Fireworks key={`fw${confettiKey}`} h={CARD} /> : null}
                  <ToastSticker key={`${currentToast.title}|${currentToast.name}|${currentToast.detail}|${confettiKey}`} toast={currentToast} durMs={toastBusyRef.current ? TOAST_SHOW_BUSY_MS : TOAST_SHOW_MS} />
                </div> : null}
                <span
                  aria-hidden
                  data-ruru-widget-flash
                  style={{
                    position: "absolute", inset: 0, zIndex: 6, borderRadius: "10px", pointerEvents: "none",
                    border: `3px solid ${WIDGET_TOAST_TAG[currentToast.tone]}`,
                    animation: `ruruRingFlash ${toastBusyRef.current ? TOAST_SHOW_BUSY_MS / 1000 : TOAST_SHOW_MS / 1000}s ease-out both`,
                  }}
                />
              </>
            ) : null}

          </div>
        ) : currentToast && !layout.full ? (
          // 띄운 상품이 없을 때도 주문/결제 소식은 보이게(카드 없이 스티커만)
          <div style={{ position: "relative", zIndex: 1, padding: "6px 4px" }}>
            <ToastSticker toast={currentToast} standalone durMs={toastBusyRef.current ? TOAST_SHOW_BUSY_MS : TOAST_SHOW_MS} />
          </div>
        ) : null}

        {/* 폭죽 — 카드 밖(앵커)에서 터뜨려야 카드 overflow:hidden 에 안 잘리고 시원하게 퍼진다.
            주문성공/입금완료/카드결제완료 어떤 알림이든 1회 재생(표시 전용). */}
        {/* 카드가 없을 때만 앵커에서 폭죽(카드가 있으면 스티커 «뒤»에서 터져 글자를 안 가린다) */}
        {confettiOn && !current && !layout.full ? (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
            <ConfettiBurst burstKey={confettiKey} grand />
          </div>
        ) : null}
      </div>

      {/* [2026-11-13 사장님 «화면 정중앙»] ?full=1 이면 알림 스티커·폭죽을 화면 한가운데에(화면 폭의 약 46%) */}
      {layout.full && currentToast && confettiOn ? (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <Fireworks key={`fwf${confettiKey}`} h={vpH} />
        </div>
      ) : null}
      {layout.full && currentToast ? (
        <div
          data-ruru-widget-center
          style={{
            position: "absolute", left: "50%", top: "50%", width: "300px", height: "320px",
            transform: `translate(-50%, -50%) scale(${(vpW * 0.46) / 200})`, transformOrigin: "center",
            display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none",
          }}
        >
          {confettiOn ? <ConfettiBurst burstKey={confettiKey} grand /> : null}
          <div style={{ width: "200px", position: "relative", zIndex: 1 }}>
            <ToastSticker key={`${currentToast.title}|${currentToast.name}|${currentToast.detail}|${confettiKey}`} toast={currentToast} standalone durMs={toastBusyRef.current ? TOAST_SHOW_BUSY_MS : TOAST_SHOW_MS} />
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes ruruWidgetIn { from { opacity: 0; transform: translate3d(8px, 0, 0) scale(0.992); } to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } }
        @keyframes ruruWidgetCycle {
          0% { opacity: 0; transform: translate3d(8px, 0, 0) scale(0.992); }
          7% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
          93% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
          100% { opacity: 0; transform: translate3d(-8px, 0, 0) scale(0.992); }
        }
        @keyframes ruruToastPop {
          0% { opacity: 0; transform: scale(0.8) translateY(8px); }
          60% { opacity: 1; transform: scale(1.05) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes ruruConfetti {
          0% { transform: translate(0, 0) rotate(0deg) scale(0.6); opacity: 1; }
          70% { opacity: 1; }
          100% { transform: translate(var(--tx), calc(var(--ty) + 40px)) rotate(var(--r)) scale(1); opacity: 0; }
        }
        @keyframes ruruStickerIn {
          0% { opacity: 0; transform: rotate(-12deg) scale(0.6); }
          60% { opacity: 1; transform: rotate(1deg) scale(1.06); }
          100% { opacity: 1; transform: rotate(-3deg) scale(1); }
        }
        @keyframes ruruStickerBurst {
          0% { opacity: 0.9; transform: scale(0.4); }
          100% { opacity: 0; transform: scale(1.9); }
        }
        @property --ruru-ang { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
        @keyframes ruruRainbowSpin { to { --ruru-ang: 360deg; } }
        @keyframes ruruRainbowGlint { 0%, 100% { filter: brightness(1) saturate(1.1); } 50% { filter: brightness(1.45) saturate(1.4); } }
        @keyframes ruruConfettiRain { 0% { opacity: 0; transform: translate(0, 0) rotate(0deg); } 8% { opacity: 1; } 50% { transform: translate(calc(var(--dx) * -1), 120px) rotate(calc(var(--spin) / 2)); } 85% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), 240px) rotate(var(--spin)); } }
        @keyframes ruruStickerShine { from { transform: translateX(-120%); } to { transform: translateX(320%); } }
        @keyframes ruruPricePulse { 0%, 70%, 100% { transform: scale(1); } 82% { transform: scale(1.08); } 90% { transform: scale(0.98); } }
        @keyframes ruruDimIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ruruRingFlash {
          0% { opacity: 0; }
          6% { opacity: 1; }
          90% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes ruruDimOut { to { opacity: 0; } }
        @keyframes ruruRocket { 0% { opacity: 0; transform: translate(0, 0); } 6% { opacity: 1; } 35% { transform: translate(3px, calc(var(--rise) * 0.55)); } 65% { transform: translate(-3px, calc(var(--rise) * 0.88)); } 96% { opacity: 1; } 100% { opacity: 0; transform: translate(0, var(--rise)); } }
        @keyframes ruruTrail { 0% { opacity: 0; transform: translateY(0) scale(1); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateY(28px) scale(0.4); } }
        @keyframes ruruFlash { 0% { opacity: 0; transform: scale(0.2); } 30% { opacity: 1; } 100% { opacity: 0; transform: scale(1.4); } }
        @keyframes ruruSpark { 0% { opacity: 0; transform: translate(0, 0) scale(0.4); } 6% { opacity: 1; } 65% { opacity: 1; transform: translate(var(--sx), var(--sy)) scale(1); } 100% { opacity: 0; transform: translate(var(--sx), calc(var(--sy) + 40px)) scale(0.5); } }
        @keyframes ruruStickerOut { to { opacity: 0; transform: rotate(-3deg) scale(0.96); } }
        @keyframes ruruLiveDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        @media (prefers-reduced-motion: reduce) {
          [data-ruru-widget-card], [data-ruru-widget-sticker], [data-ruru-widget-burst], [data-ruru-widget-flash], [data-ruru-widget-live-dot], [data-ruru-widget-price], [data-ruru-widget-rainbow] { animation: none !important; }
          [data-ruru-widget-burst], [data-ruru-widget-confetti] { display: none; }
        }
      `}</style>
    </div>
  );
}
