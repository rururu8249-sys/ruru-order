// lib/subscribeFreeShip.ts
// [2026-11-01 사장님 20:09~20:15] 「유튜브 구독중 캡처 인증 → 무료배송」 — 사장님이 켠 시간에만.
//   · 설정 settings `subscribe_free_ship_v1`(JSON 한 칸): 켜기·시작/끝 시각·무료로 할 배송 갈래(여러 개)·제주/산간 추가금도 무료?·채널 이름·예시 사진.
//   · 인증 기록은 subscribe_verifications 표(카카오 계정 1명당 한 번 인증하면 다음에 켠 시간에도 그대로).
//   · 손님 화면(app/order/page.tsx)과 서버(customer-orders/submit)가 이 파일 하나를 같이 쓴다 — 금액이 어긋나지 않게.
//   · 순수 함수만(DB·fetch 없음).
import type { ShippingGroup } from "./shippingGroups";

export const SUBSCRIBE_FREE_SHIP_KEY = "subscribe_free_ship_v1";
export const SUBSCRIBE_GROUP_LABEL: Record<ShippingGroup, string> = {
  normal: "일반배송",
  vendor: "업체배송1",
  vendor2: "업체배송2",
  overseas: "해외배송",
};
const ALL_GROUPS: ShippingGroup[] = ["normal", "vendor", "vendor2", "overseas"];
export const DEFAULT_SUBSCRIBE_CHANNEL = "나야루루";
// [2026-11-02] 새 채널 화면(RURU 배너)으로 교체 — 파일 이름을 바꿔 옛 사진이 캐시에 남지 않게. 옛 기본 주소로 저장된 설정도 새 사진으로.
export const DEFAULT_SUBSCRIBE_EXAMPLE = "/subscribe-example-v2.jpg";
const OLD_DEFAULT_SUBSCRIBE_EXAMPLE = "/subscribe-example.jpg";
/** PC 화면 캡처 예시(고정 사진) — 폰 예시와 같이 보여 준다 */
export const SUBSCRIBE_EXAMPLE_PC = "/subscribe-example-pc.jpg";

export type SubscribeFreeShipConfig = {
  enabled: boolean;
  /** ISO 시각 — 이 시각부터 */
  startAt: string;
  /** ISO 시각 — 이 시각까지 */
  endAt: string;
  /** 배송비를 0원으로 할 갈래(여러 개) */
  groups: ShippingGroup[];
  /** 제주·산간 추가금까지 무료? false 면 추가금(제주 금액 − 기본 금액)은 받는다 */
  waiveRemote: boolean;
  /** 캡처에 보여야 하는 채널 이름 */
  channelName: string;
  /** 손님에게 보여 줄 예시 사진 주소 */
  exampleUrl: string;
  /** [2026-11-26 사장님] 혜택 방식 — always = 켜져 있는 동안 인증한 손님 주문마다 무료(기본) / once = 한 계정 1번만 */
  mode: SubscribeFreeShipMode;
};
export type SubscribeFreeShipMode = "always" | "once";

export const DEFAULT_SUBSCRIBE_FREE_SHIP: SubscribeFreeShipConfig = {
  enabled: false,
  startAt: "",
  endAt: "",
  groups: ["normal"],
  waiveRemote: false,
  channelName: DEFAULT_SUBSCRIBE_CHANNEL,
  exampleUrl: DEFAULT_SUBSCRIBE_EXAMPLE,
  mode: "always",
};

const validTime = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : "";
};

/** settings 줄들(또는 값 글자) → 설정. 못 읽으면 꺼짐(안전). */
export function parseSubscribeFreeShip(input: unknown): SubscribeFreeShipConfig {
  let raw: unknown = input;
  if (Array.isArray(input)) {
    raw = (input as { key?: string; value?: unknown }[]).find((r) => r?.key === SUBSCRIBE_FREE_SHIP_KEY)?.value;
  }
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SUBSCRIBE_FREE_SHIP };
  const r = raw as Record<string, unknown>;
  const groups = Array.isArray(r.groups)
    ? ALL_GROUPS.filter((g) => (r.groups as unknown[]).map(String).includes(g))
    : DEFAULT_SUBSCRIBE_FREE_SHIP.groups;
  const exampleUrl = String(r.exampleUrl ?? "").trim();
  return {
    enabled: r.enabled === true,
    startAt: validTime(r.startAt),
    endAt: validTime(r.endAt),
    groups,
    waiveRemote: r.waiveRemote === true,
    channelName: String(r.channelName ?? "").trim().slice(0, 80) || DEFAULT_SUBSCRIBE_CHANNEL,
    exampleUrl: /^(https:\/\/|\/)/.test(exampleUrl) && exampleUrl !== OLD_DEFAULT_SUBSCRIBE_EXAMPLE ? exampleUrl : DEFAULT_SUBSCRIBE_EXAMPLE,
    // 저장값이 정확히 "once" 일 때만 1회. 값이 없거나 이상하면 «계속»(사장님 기본값).
    mode: r.mode === "once" ? "once" : "always",
  };
}

/** 지금 혜택이 켜져 있는가 — 켜기 + 시작 ≤ 지금 ≤ 끝 + 갈래 하나 이상 */
export function isSubscribeFreeShipActive(config: SubscribeFreeShipConfig, now: Date = new Date()): boolean {
  if (!config.enabled || config.groups.length === 0) return false;
  const start = Date.parse(config.startAt);
  const end = Date.parse(config.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const t = now.getTime();
  return t >= start && t <= end;
}

/** 인증된 손님 + 혜택 켜짐일 때 갈래별 배송비.
 *  feeByGroup = 이 배송지 금액(제주면 제주 금액), baseByGroup = 제주 아닌 기본 금액.
 *  고른 갈래: 제주 추가금까지 무료면 0, 아니면 추가금만(제주 금액 − 기본 금액). */
export function applySubscribeWaiver(
  feeByGroup: Record<ShippingGroup, number>,
  baseByGroup: Record<ShippingGroup, number>,
  config: Pick<SubscribeFreeShipConfig, "groups" | "waiveRemote">,
): Record<ShippingGroup, number> {
  const out = { ...feeByGroup };
  for (const g of config.groups) {
    out[g] = config.waiveRemote ? 0 : Math.max(0, (feeByGroup[g] || 0) - (baseByGroup[g] || 0));
  }
  return out;
}

/** 이번 주문서에서 무료로 빠지는 배송비 합(화면 표시용) */
export function waivedShippingAmount(before: number, after: number): number {
  return Math.max(0, Math.round(before - after));
}

// ───────── AI 판정 ─────────
// [2026-11-06 사장님 「루루동이#3 채널도 인증 사진으로」] 채널 이름 칸에 쉼표로 여러 개 — 그중 하나면 통과.
export function subscribeChannelList(channelName: string): string[] {
  const list = String(channelName || "").split(/[,，\n]|\s또는\s/).map((v) => v.trim()).filter(Boolean);
  return list.length ? [...new Set(list)] : [DEFAULT_SUBSCRIBE_CHANNEL];
}

/** 손님 화면 표시 — 「나야루루」 또는 「루루동이#3」 */
export function subscribeChannelLabel(channelName: string): string {
  return subscribeChannelList(channelName).map((c) => `「${c}」`).join(" 또는 ");
}

export function buildSubscribeCheckPrompt(channelName: string): string {
  return [
    "이 사진은 손님이 올린 휴대폰 화면 캡처다. 아래를 확인해 JSON 으로만 답해라.",
    `확인할 채널 이름(이 중 하나면 됨): ${subscribeChannelLabel(channelName)}`,
    "1) 유튜브 앱/사이트 화면인가? (채널 홈, 영상·라이브 방송 화면 모두 해당)",
    "2) 화면에 보이는 채널 이름(또는 @핸들)을 글자 그대로 적어라. 여러 개면 구독 버튼이나 종 모양과 붙어 있는 채널 이름. 라이브 방송 화면이면 왼쪽 위 프로필 사진 옆 @핸들.",
    "3) 그 채널 이름 바로 아래나 바로 옆에 붙은 구독 버튼의 글자를 그대로 적어라(예: 구독중, 구독, Subscribed, Subscribe). 글자 버튼이 없으면 빈칸.",
    "4) 그 채널 이름 바로 옆(같은 줄 오른쪽 끝 포함)에 글자 「구독」 버튼 대신 종 모양 아이콘(알림 종, 사선이 그어진 종·물결 있는 종 모두 포함)이 있으면 bell_icon=true. 유튜브는 구독한 채널에만 이 자리에 종을 보여 준다. 화면 위쪽 전체 알림(받은편지함) 종은 해당 안 됨.",
    "5) 그 구독 버튼·종이 2)의 채널 이름에 속한 것인가? 다른 채널(영상 목록·추천 채널 등)의 것이면 false.",
    "6) 글자가 잘리거나 흐려서 확실하지 않으면 clear=false.",
    '형식: {"is_youtube":true,"channel_name":"","button_text":"","bell_icon":false,"button_belongs":true,"clear":true,"note":""}',
  ].join("\n");
}

export type SubscribeAiJudge = {
  is_youtube?: boolean;
  channel_name?: string;
  button_text?: string;
  /** [2026-11-26] 채널 이름 옆에 「구독」 대신 종 모양(구독한 채널에만 나옴 — 라이브·영상 화면) */
  bell_icon?: boolean;
  button_belongs?: boolean;
  clear?: boolean;
  note?: string;
};

const norm = (s: string) => String(s || "").replace(/[\s@·_\-.#]/g, "").toLowerCase();

/** AI 답 → 통과 여부 + 손님에게 보여 줄 이유. 통과 판단은 코드가 한다(AI 의 «통과» 한마디를 믿지 않음). */
export function judgeSubscribeShot(
  ai: SubscribeAiJudge | null,
  channelName: string,
): { ok: boolean; reason: string } {
  if (!ai) return { ok: false, reason: "사진을 확인하지 못했어요. 잠시 뒤 다시 올려 주세요." };
  if (ai.is_youtube === false) return { ok: false, reason: "유튜브 화면 캡처를 올려 주세요." };
  if (ai.clear === false) return { ok: false, reason: "글자가 잘 안 보여요. 채널 이름과 「구독중」(또는 이름 옆 종 모양)이 또렷하게 나오게 다시 찍어 주세요." };
  const seen = norm(ai.channel_name || "");
  const label = subscribeChannelLabel(channelName);
  const wants = subscribeChannelList(channelName).map(norm).filter(Boolean);
  if (!seen || !wants.some((want) => seen.includes(want))) {
    // [2026-11-23] 실제 불합격 대부분 = 방송(영상) 화면을 올림 → 어느 화면을 찍어야 하는지 말해 준다
    return { ok: false, reason: `${label} 채널 이름이 안 보여요. 방송 화면이면 왼쪽 위 채널 이름과 오른쪽 위 종 모양이 함께 나오게, 채널 홈이면 채널 이름과 「구독중」이 함께 나오게 캡처해 주세요.` };
  }
  const button = norm(ai.button_text || "");
  // [2026-11-26 사장님] 라이브 방송 화면은 구독하면 「구독」 버튼 자리에 종(사선 종 포함)이 나온다 → 종도 구독 인정.
  //   단 「구독」(구독 안 함) 글자가 보이면 종이 있다고 해도 통과 안 함(다른 곳의 종을 잘못 본 경우 막기).
  const notSubscribedButton = (button.includes("구독") && !button.includes("구독중")) || (button.includes("subscribe") && !button.includes("subscribed"));
  const subscribed = button.includes("구독중") || button.includes("subscribed") || (ai.bell_icon === true && !notSubscribedButton);
  if (!subscribed) return { ok: false, reason: "구독한 표시가 안 보여요. 아직 구독 전이면 「구독」을 먼저 누르고, 방송 화면이면 채널 이름과 오른쪽 위 종 모양이, 채널 홈이면 「구독중」이 나오게 캡처해 주세요." };
  if (ai.button_belongs === false) {
    return { ok: false, reason: `구독 표시가 ${label} 채널 것인지 안 보여요. 채널 이름과 그 옆 「구독중」(또는 종 모양)이 한 화면에 나오게 찍어 주세요.` };
  }
  return { ok: true, reason: "" };
}

/** AI 가 준 글자에서 JSON 만 뽑기 */
export function parseAiJudge(text: string | null): SubscribeAiJudge | null {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]);
    return v && typeof v === "object" ? (v as SubscribeAiJudge) : null;
  } catch {
    return null;
  }
}

/** 관리자 화면 기본 시각 — 시작 = 지금, 끝 = 오늘(한국) 23:59 */
export function defaultSubscribeWindow(now: Date = new Date()): { startAt: string; endAt: string } {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const end = new Date(Date.UTC(y, m, d, 23, 59, 0) - 9 * 3600_000);
  return { startAt: now.toISOString(), endAt: end.toISOString() };
}
