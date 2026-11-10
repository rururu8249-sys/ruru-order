import { productSearchMatches } from "@/lib/productSearch";
// [2026-11-09] 「방송 보며 주문」 ②단계 — 손님 주문서에서 유튜브 방송을 보면서 바로 담기.
//   이 파일은 «순수 계산»만: 설정 읽기, 유튜브 주소 → 영상 번호, 누구에게 보여 줄지, 상품 목록 정렬·검색.
//   돈·주문·장바구니 계산은 없다(담기·주문서는 주문 페이지의 기존 함수를 그대로 부른다).

export const LIVE_WATCH_KEY = "live_watch_v1";

/** 누구에게 보여 줄지 — off: 아무도 / admin: 관리자 시험 계정만 / all: 모든 손님 */
export type LiveWatchAudience = "off" | "admin" | "all";
/** 처음 들어왔을 때 어느 화면부터 */
export type LiveWatchFirstView = "live" | "shop";

export type LiveWatchSetting = {
  audience: LiveWatchAudience;
  firstView: LiveWatchFirstView;
  /** 「관리자 시험 계정만」일 때 시험 계정 표 밖에서도 보이게 할 전화번호(숫자만) — 주문·정산 영향 없음 */
  phones: string[];
  /** 채팅 관리(글 지우기·금지·차단)까지 할 수 있는 전화번호 — 관리자 시험 계정 표는 따로 늘 가능 */
  mods: string[];
  /** [2026-11-10] 총관리자 — 채팅 관리 + 다른 손님을 채팅 관리자로 지정·해제. badge = 닉네임 뒤 표시 */
  owners: LiveChatOwner[];
};

/** 채팅 닉네임 뒤 표시 — crown: 금색 왕관 / crown_pink: 분홍 왕관 / mod: R 동그라미(채팅 관리자) */
export type LiveChatBadge = "crown" | "crown_pink" | "mod";
export type LiveChatOwner = { phone: string; badge: LiveChatBadge };
export const LIVE_CHAT_BADGES: LiveChatBadge[] = ["crown", "crown_pink", "mod"];

export const LIVE_WATCH_DEFAULT: LiveWatchSetting = { audience: "off", firstView: "live", phones: [], mods: [], owners: [] };

/** settings 값(JSON 글자 또는 객체) → 설정. 이상하면 기본값(꺼짐). */
export function parseLiveWatchSetting(raw: unknown): LiveWatchSetting {
  let v: unknown = raw;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return { ...LIVE_WATCH_DEFAULT, phones: [], mods: [], owners: [] };
    try { v = JSON.parse(t); } catch { return { ...LIVE_WATCH_DEFAULT, phones: [], mods: [], owners: [] }; }
  }
  if (!v || typeof v !== "object") return { ...LIVE_WATCH_DEFAULT, phones: [], mods: [], owners: [] };
  const o = v as Record<string, unknown>;
  const audience: LiveWatchAudience = o.audience === "all" ? "all" : o.audience === "admin" ? "admin" : "off";
  const firstView: LiveWatchFirstView = o.firstView === "shop" ? "shop" : "live";
  const digits = (arr: unknown) => Array.isArray(arr)
    ? Array.from(new Set(arr.map((x) => String(x ?? "").replace(/[^0-9]/g, "")).filter((x) => x.length >= 9)))
    : [];
  const owners: LiveChatOwner[] = [];
  if (Array.isArray(o.owners)) {
    for (const x of o.owners) {
      const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const phone = String(r.phone ?? "").replace(/[^0-9]/g, "");
      if (phone.length < 9 || owners.some((w) => w.phone === phone)) continue;
      const badge = LIVE_CHAT_BADGES.includes(r.badge as LiveChatBadge) ? (r.badge as LiveChatBadge) : "mod";
      owners.push({ phone, badge });
    }
  }
  return { audience, firstView, phones: digits(o.phones), mods: digits(o.mods), owners };
}

/** 이 번호의 채팅 표시 — 총관리자면 그 표시, 채팅 관리자(mods)면 R, 아니면 null */
export function chatBadgeOf(setting: LiveWatchSetting, phone: string): LiveChatBadge | null {
  const ph = String(phone ?? "").replace(/[^0-9]/g, "");
  if (!ph) return null;
  const owner = setting.owners.find((w) => w.phone === ph);
  if (owner) return owner.badge;
  return setting.mods.includes(ph) ? "mod" : null;
}

/** 총관리자인지(채팅 관리자 지정·해제 가능) */
export function isChatOwnerPhone(setting: LiveWatchSetting, phone: string): boolean {
  const ph = String(phone ?? "").replace(/[^0-9]/g, "");
  return Boolean(ph) && setting.owners.some((w) => w.phone === ph);
}

export function serializeLiveWatchSetting(s: LiveWatchSetting): string {
  return JSON.stringify(parseLiveWatchSetting(s));
}

/** 유튜브 주소 → 영상 번호(11글자). watch?v= · youtu.be/ · /live/ · /shorts/ · /embed/ 모두. 못 찾으면 "". */
export function youtubeVideoIdFromUrl(url: unknown): string {
  const s = String(url ?? "").trim();
  if (!s) return "";
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u: URL;
  try { u = new URL(s.startsWith("http") ? s : `https://${s}`); } catch { return ""; }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const ok = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "");
  if (host === "youtu.be") return ok(u.pathname.split("/")[1]);
  if (!host.endsWith("youtube.com") && !host.endsWith("youtube-nocookie.com")) return "";
  const v = ok(u.searchParams.get("v"));
  if (v) return v;
  const parts = u.pathname.split("/").filter(Boolean);
  for (const key of ["live", "shorts", "embed", "v"]) {
    const i = parts.indexOf(key);
    if (i >= 0) { const id = ok(parts[i + 1]); if (id) return id; }
  }
  return "";
}

/** 사이트 안에 끼워 넣는 주소 — 폰 브라우저 규칙상 소리 끈 채 자동 재생, 페이지 안에서 재생(playsinline). */
export function youtubeEmbedUrl(videoId: string, origin?: string, opts?: { controls?: boolean }): string {
  const p = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1",
    // [2026-11-10] 유튜브 자체 막대(돌려보기)·전체화면·제목줄 숨김 — 우리 위·아래 띠와 겹치고, 손님이 지난 장면으로 가 버리지 않게
    controls: opts?.controls ? "1" : "0",
    fs: "0",
    disablekb: "1",
    iv_load_policy: "3",
    // 자막 기본 끔(자동 자막이 채팅 위에 겹치지 않게)
    cc_load_policy: "0",
  });
  if (origin) p.set("origin", origin);
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${p.toString()}`;
}

/** 소리 켜기 등 — 끼워 넣은 플레이어에 보내는 명령(enablejsapi=1 필요) */
export function youtubeCommand(func: "unMute" | "mute" | "playVideo" | "pauseVideo" | "seekTo", args: unknown[] = []): string {
  return JSON.stringify({ event: "command", func, args });
}

/** 이 손님에게 방송 보기를 «쓸 수 있게» 할지(화면 전환 버튼까지 포함). */
export function canUseLiveWatch(opts: {
  setting: LiveWatchSetting;
  broadcastOn: boolean;
  videoId: string;
  isAdminViewer: boolean;
  /** 지금 로그인한 손님 전화번호(있으면) */
  viewerPhone?: string;
}): boolean {
  if (!opts.broadcastOn || !opts.videoId) return false;
  if (opts.setting.audience === "all") return true;
  if (opts.setting.audience === "admin") {
    if (opts.isAdminViewer) return true;
    const ph = String(opts.viewerPhone ?? "").replace(/[^0-9]/g, "");
    return Boolean(ph) && opts.setting.phones.includes(ph);
  }
  return false;
}

/** 손님이 고른 화면(같은 방송 동안만 기억) — 없으면 설정의 처음 화면 */
export function initialLiveView(setting: LiveWatchSetting, remembered: string | null | undefined): boolean {
  if (remembered === "live") return true;
  if (remembered === "shop") return false;
  return setting.firstView === "live";
}

export type LiveWatchItem = {
  id: string;
  name: string;
  imageUrl: string;
  priceText: string;
  soldOut: boolean;
  pinned: boolean;
  /** 브랜드 묶음(세부상품 고르기) — 버튼 「상품 선택」, 아니면 「담기」(쇼핑몰 카드와 같은 말) */
  brand?: boolean;
  /** 손님이 실제로 고를 수 있는 상품 수(브랜드 묶음 = 세부상품 수, 아니면 1) — 상품 목록 버튼 숫자 */
  count?: number;
  /** 검색에 쓰는 말(상품명 + 관리자가 넣은 검색어) — 주문서 검색과 같은 말 */
  searchTexts?: string[];
  /** 브랜드 묶음의 세부상품(검색하면 한 줄씩 바로 나옴) */
  details?: Array<{ name: string; imageUrl: string; priceText: string; soldOut: boolean }>;
  /** 세부상품 줄이면 그 이름 — 누르면 그 세부상품이 골라진 채로 열림 */
  detailName?: string;
};

/**
 * 상품 목록 창 — 소개 중인 상품 맨 위, 나머지는 받은 순서.
 * [2026-11-10 사장님 「프509·pd509·프라509 다 걸려야」] 검색은 주문서 검색과 «같은 함수»(productSearchMatches —
 *   띄어쓰기·하이픈 무시, 브랜드 이름 → 상품번호 앞 글자). 브랜드 묶음은 세부상품 이름도 보고,
 *   맞는 세부상품은 한 줄씩 바로 보여 준다(누르면 그 세부상품이 골라진 채로 열림).
 */
export function liveWatchList(items: LiveWatchItem[], query: string): LiveWatchItem[] {
  const q = String(query || "").trim();
  let out: LiveWatchItem[];
  if (!q) out = items.slice();
  else {
    out = [];
    for (const it of items) {
      const texts = it.searchTexts && it.searchTexts.length ? it.searchTexts : [it.name];
      const selfHit = texts.some((t) => productSearchMatches(t, q));
      const hitDetails = (it.details || []).filter((d) => productSearchMatches(d.name, q));
      if (hitDetails.length > 0 && !selfHit) {
        for (const d of hitDetails) out.push({ ...it, name: d.name, imageUrl: d.imageUrl || it.imageUrl, priceText: d.priceText, soldOut: d.soldOut, brand: false, count: 1, detailName: d.name, details: undefined });
      } else if (selfHit || hitDetails.length > 0) out.push(it);
    }
  }
  const pinned = out.filter((it) => it.pinned && !it.detailName);
  const rest = out.filter((it) => !(it.pinned && !it.detailName));
  return [...pinned, ...rest];
}

/** 처음 안내(한 번만) 저장 키 */
export const LIVE_WATCH_GUIDE_SEEN_KEY = "ruru_live_watch_guide_seen_v1";
/** 손님이 고른 화면 저장 키(방송마다) */
export const liveWatchViewKey = (broadcastId: unknown) => `ruru_live_watch_view_${String(broadcastId ?? "")}`;
