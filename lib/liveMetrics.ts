// lib/liveMetrics.ts
// [2026-11-09 사장님 「방송 끝나면 자동 분석표」] 방송 중 1분마다 남기는 기록(순수 함수만 — 서버·테스트 공용).
//   한 줄(Sample) = 그 1분의 유튜브 동시 시청자·좋아요·사이트 지금 접속·유튜브 채팅 수·채팅에 나온 상품번호·순환 상태.
//   저장 = settings 한 키(live_metrics_v1:<방송id>) JSON 배열. 주문·돈·장바구니 무접촉.

export const LIVE_METRICS_KEY_PREFIX = "live_metrics_v1:";
export const LIVE_METRICS_MAX = 1440; // 하루치(1분×24시간)면 충분

export type RotationState =
  | { m: "all" }                                   // 전체 순환(고른 것 아님)
  | { m: "paused" }                                // 멈춤
  | { m: "pick"; ids: Array<{ p: string; d: string }> }; // 고른 상품만 순환(p=상품id, d=세부상품 이름)

export type LiveSample = {
  t: string;            // 그 1분(ISO, 초 0)
  v: number | null;     // 유튜브 동시 시청자
  l: number | null;     // 좋아요
  s: number;            // 사이트 지금 접속(관리자 제외)
  c: number;            // 그 1분 유튜브 채팅 수(봇·주인 글 제외)
  k: Record<string, number>; // 채팅에 나온 상품번호 → 횟수
  r: RotationState | null;   // 위젯 순환 상태
};

export function liveMetricsKey(broadcastId: string): string {
  return `${LIVE_METRICS_KEY_PREFIX}${String(broadcastId || "").trim()}`;
}

export function minuteIso(ms: number): string {
  const d = new Date(ms);
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

/** 상품번호 모양을 하나로: "mx101" "MX 101" "MX-101" → "MX-101" */
export function normCode(prefix: string, num: string): string {
  return `${prefix.toUpperCase()}-${String(Number(num))}`;
}

/** 채팅 글에서 상품번호 후보를 뽑음(영문 1~4자 + 숫자 1~4자리). 같은 글 안 중복은 한 번. */
export function extractCodes(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:^|[^A-Za-z])([A-Za-z]{1,4})\s?-?\s?(\d{1,4})(?!\d)/g;
  let m: RegExpExecArray | null;
  const s = String(text || "");
  while ((m = re.exec(s))) out.add(normCode(m[1], m[2]));
  return [...out];
}

/** 상품 이름(세부상품명)에서 상품번호를 뽑음 — 맨 앞 「MX-101 브라운」 모양만 */
export function codeOfName(name: string): string {
  const m = /^\s*([A-Za-z]{1,4})\s?-?\s?(\d{1,4})(?!\d)/.exec(String(name || ""));
  return m ? normCode(m[1], m[2]) : "";
}

export function parseSamples(raw: unknown): LiveSample[] {
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x === "object" && typeof (x as LiveSample).t === "string")
      .map((x) => {
        const o = x as LiveSample;
        return {
          t: o.t,
          v: Number.isFinite(Number(o.v)) && o.v !== null ? Number(o.v) : null,
          l: Number.isFinite(Number(o.l)) && o.l !== null ? Number(o.l) : null,
          s: Number(o.s) || 0,
          c: Number(o.c) || 0,
          k: o.k && typeof o.k === "object" ? o.k : {},
          r: o.r ?? null,
        };
      })
      .sort((a, b) => a.t.localeCompare(b.t));
  } catch {
    return [];
  }
}

/** 같은 1분이면 덮어쓰고(늦게 온 값 우선), 아니면 붙임. 최대 길이 넘으면 앞에서 자름. */
export function appendSample(list: LiveSample[], s: LiveSample): LiveSample[] {
  const next = list.filter((x) => x.t !== s.t);
  next.push(s);
  next.sort((a, b) => a.t.localeCompare(b.t));
  return next.slice(-LIVE_METRICS_MAX);
}

/** 위젯 순환 설정(settings widget_rotation_<방송>) → 기록용 모양 */
export function rotationStateOf(cfg: { mode?: string; paused?: boolean; targets?: Array<{ productId?: unknown; detailName?: unknown }> } | null): RotationState | null {
  if (!cfg) return null;
  if (cfg.paused) return { m: "paused" };
  if (cfg.mode === "selected" && Array.isArray(cfg.targets) && cfg.targets.length > 0) {
    return { m: "pick", ids: cfg.targets.map((t) => ({ p: String(t.productId ?? ""), d: String(t.detailName ?? "") })).filter((x) => x.p) };
  }
  return { m: "all" };
}
