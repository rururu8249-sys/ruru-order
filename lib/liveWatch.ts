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
};

export const LIVE_WATCH_DEFAULT: LiveWatchSetting = { audience: "off", firstView: "live", phones: [], mods: [] };

/** settings 값(JSON 글자 또는 객체) → 설정. 이상하면 기본값(꺼짐). */
export function parseLiveWatchSetting(raw: unknown): LiveWatchSetting {
  let v: unknown = raw;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return { ...LIVE_WATCH_DEFAULT, phones: [], mods: [] };
    try { v = JSON.parse(t); } catch { return { ...LIVE_WATCH_DEFAULT, phones: [], mods: [] }; }
  }
  if (!v || typeof v !== "object") return { ...LIVE_WATCH_DEFAULT, phones: [], mods: [] };
  const o = v as Record<string, unknown>;
  const audience: LiveWatchAudience = o.audience === "all" ? "all" : o.audience === "admin" ? "admin" : "off";
  const firstView: LiveWatchFirstView = o.firstView === "shop" ? "shop" : "live";
  const digits = (arr: unknown) => Array.isArray(arr)
    ? Array.from(new Set(arr.map((x) => String(x ?? "").replace(/[^0-9]/g, "")).filter((x) => x.length >= 9)))
    : [];
  return { audience, firstView, phones: digits(o.phones), mods: digits(o.mods) };
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
  });
  if (origin) p.set("origin", origin);
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${p.toString()}`;
}

/** 소리 켜기 등 — 끼워 넣은 플레이어에 보내는 명령(enablejsapi=1 필요) */
export function youtubeCommand(func: "unMute" | "mute" | "playVideo", args: unknown[] = []): string {
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
};

const norm = (s: string) => String(s || "").toLowerCase().replace(/[\s\-_/·.]/g, "");

/** 상품 목록 창 — 소개 중인 상품 맨 위, 나머지는 받은 순서. 검색은 띄어쓰기·하이픈 무시. */
export function liveWatchList(items: LiveWatchItem[], query: string): LiveWatchItem[] {
  const q = norm(query);
  const filtered = q ? items.filter((it) => norm(it.name).includes(q)) : items.slice();
  const pinned = filtered.filter((it) => it.pinned);
  const rest = filtered.filter((it) => !it.pinned);
  return [...pinned, ...rest];
}

/** 처음 안내(한 번만) 저장 키 */
export const LIVE_WATCH_GUIDE_SEEN_KEY = "ruru_live_watch_guide_seen_v1";
/** 손님이 고른 화면 저장 키(방송마다) */
export const liveWatchViewKey = (broadcastId: unknown) => `ruru_live_watch_view_${String(broadcastId ?? "")}`;
