// lib/promoPopup.ts
// 2026-11-01 — 손님 화면 «안내 팝업»(유튜브 채널 변경 안내로 시작) 설정 한 곳.
// settings 키 promo_popup_v1 에 JSON 한 덩어리로 저장: 켜기/끄기·끝나는 날·그림·제목·내용·버튼(최대 3개).
// 표시·이동 전용. 돈/주문/입금/배송 로직 무관.

import { YOUTUBE_CHANNEL_WEB_URL } from "./youtubeChannelLink";

export const PROMO_POPUP_KEY = "promo_popup_v1";
/** 예전 켜기/끄기 키(2026-11-01 오전) — 새 키가 없을 때만 읽는다 */
export const PROMO_POPUP_LEGACY_KEY = "youtube_channel_notice_enabled";
export const PROMO_POPUP_MAX_BUTTONS = 3;
export const PROMO_POPUP_HIDE_HOURS = 24;

export type PromoPopupIcon = "youtube" | "play" | "none" | "image";

export type PromoPopupButton = { label: string; url: string };

export type PromoPopupConfig = {
  enabled: boolean;
  /** YYYY-MM-DD(한국 날짜). 이 날이 지나면 저절로 안 뜸. 빈 값 = 계속 */
  endDate: string;
  icon: PromoPopupIcon;
  imageUrl: string;
  title: string;
  body: string;
  buttons: PromoPopupButton[];
  /** 저장할 때마다 바뀜 — 내용을 바꾸면 «24시간 열지 않기» 누른 손님에게도 다시 뜬다 */
  version: string;
};

export const DEFAULT_PROMO_POPUP: PromoPopupConfig = {
  enabled: true,
  endDate: "",
  icon: "youtube",
  imageUrl: "",
  title: "유튜브 채널이 바뀌었어요",
  body: "11월 1일(일)부터 루루동이 라이브는\n**새 채널(루루동이2)**에서 해요.\n\n새 채널에서 **구독**과 **알림 설정**을\n꼭 눌러 주세요.",
  buttons: [{ label: "새 채널 바로가기", url: YOUTUBE_CHANNEL_WEB_URL }],
  version: "2026-11-01",
};

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

/** 버튼 주소로 쓸 수 있는지 — http(s) 주소나 사이트 안 주소(/로 시작)만 */
export function isValidPromoUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (u.startsWith("/") && !u.startsWith("//")) return true;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function cleanButtons(raw: unknown): PromoPopupButton[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b: any) => ({ label: str(b?.label, 30).trim(), url: str(b?.url, 500).trim() }))
    .filter((b) => b.label && isValidPromoUrl(b.url))
    .slice(0, PROMO_POPUP_MAX_BUTTONS);
}

function cleanDate(v: unknown): string {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/** settings 줄들에서 설정 읽기. 새 키 없으면 기본값(예전 켜기/끄기 키 따름). 못 읽는 값은 기본값으로. */
export function parsePromoPopup(rows: { key: string; value: unknown }[]): PromoPopupConfig {
  const raw = rows.find((r) => r.key === PROMO_POPUP_KEY)?.value;
  const legacy = String(rows.find((r) => r.key === PROMO_POPUP_LEGACY_KEY)?.value ?? "").trim();
  if (raw == null || String(raw).trim() === "") {
    return { ...DEFAULT_PROMO_POPUP, enabled: legacy !== "false" };
  }
  let obj: any;
  try {
    obj = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { ...DEFAULT_PROMO_POPUP, enabled: false };
  }
  if (!obj || typeof obj !== "object") return { ...DEFAULT_PROMO_POPUP, enabled: false };
  const icon: PromoPopupIcon = obj.icon === "none" || obj.icon === "image" || obj.icon === "play" ? obj.icon : "youtube";
  const imageUrl = str(obj.imageUrl, 500).trim();
  return {
    enabled: obj.enabled === true,
    endDate: cleanDate(obj.endDate),
    icon: icon === "image" && !/^https:\/\//.test(imageUrl) ? "youtube" : icon,
    imageUrl,
    title: str(obj.title, 60),
    body: str(obj.body, 600),
    buttons: cleanButtons(obj.buttons),
    version: str(obj.version, 40) || "1",
  };
}

/** 저장용 문자열. 내용이 바뀌었으면 새 version. 버튼은 이름·주소 다 있는 것만. */
export function serializePromoPopup(next: PromoPopupConfig, prev: PromoPopupConfig, nowMs: number): string {
  const clean = {
    enabled: next.enabled,
    endDate: cleanDate(next.endDate),
    icon: next.icon,
    imageUrl: next.imageUrl.trim(),
    title: next.title.trim(),
    body: next.body.replace(/\s+$/g, ""),
    buttons: cleanButtons(next.buttons),
  };
  const contentOf = (c: Omit<PromoPopupConfig, "version" | "enabled" | "endDate">) =>
    JSON.stringify([c.icon, c.imageUrl, c.title, c.body, c.buttons]);
  const changed = contentOf(clean) !== contentOf({ ...prev, buttons: cleanButtons(prev.buttons) });
  return JSON.stringify({ ...clean, version: changed ? String(nowMs) : prev.version || String(nowMs) });
}

/** 한국 날짜 YYYY-MM-DD */
export function kstDateString(nowMs: number): string {
  return new Date(nowMs + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 지금 손님에게 띄울 팝업인지(켜짐·끝나는 날 안 지남·내용 있음) */
export function isPromoPopupLive(cfg: PromoPopupConfig, nowMs: number): boolean {
  if (!cfg.enabled) return false;
  if (!cfg.title.trim() && !cfg.body.trim()) return false;
  if (cfg.endDate && kstDateString(nowMs) > cfg.endDate) return false;
  return true;
}

/** 「24시간 열지 않기」 기록이 아직 유효한지 — 같은 내용(version)일 때만 */
export function isPromoHidden(stored: string | null, version: string, nowMs: number): boolean {
  if (!stored) return false;
  try {
    const rec = JSON.parse(stored);
    return rec?.v === version && Number(rec?.until) > nowMs;
  } catch {
    return false;
  }
}

export function promoHideRecord(version: string, nowMs: number): string {
  return JSON.stringify({ v: version, until: nowMs + PROMO_POPUP_HIDE_HOURS * 3600 * 1000 });
}

/** 내용 글자 → 줄·굵게 조각. **글자** 는 굵게. */
export function promoBodyLines(body: string): { text: string; bold: boolean }[][] {
  return body.split("\n").map((line) =>
    line
      .split(/(\*\*[^*]+\*\*)/g)
      .filter((p) => p !== "")
      .map((p) => (p.startsWith("**") && p.endsWith("**") && p.length > 4 ? { text: p.slice(2, -2), bold: true } : { text: p, bold: false })),
  );
}
