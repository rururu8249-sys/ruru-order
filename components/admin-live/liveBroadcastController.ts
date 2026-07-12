import { supabase } from "@/lib/supabase";
import { adminCatalogWrite } from "@/lib/adminCatalogWrite";

export type AdminLiveBroadcast = {
  id: string;
  public_title: string | null;
  admin_subtitle?: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at?: string | null;
  youtube_live_url?: string | null;
  youtube_live_enabled?: boolean | null;
  is_deleted?: boolean | null;
  // [2026-07-12] 위젯 상품카드 표시 여부 (null/undefined면 true 취급 — 기존 방송 호환)
  widget_card_enabled?: boolean | null;
};

export type StartBroadcastInput = {
  title: string;
  youtubeUrl?: string;
};

export type UpdateBroadcastInput = {
  broadcastId: string;
  title: string;
  youtubeUrl?: string;
};

export async function loadAdminLiveBroadcasts() {
  const { data, error } = await supabase
    .from("broadcasts")
    .select("*")
    .neq("is_deleted", true)
    .order("started_at", { ascending: false })
    .limit(120);

  if (error) throw error;

  return (data || []) as AdminLiveBroadcast[];
}

export function getActiveBroadcast(broadcasts: AdminLiveBroadcast[]) {
  return broadcasts.find((broadcast) => String(broadcast.status || "").toUpperCase() === "ON") || null;
}

async function safeUpsertSetting(key: string, value: string) {
  try {
    const { error } = await supabase
      .from("settings")
      .upsert({ key, value }, { onConflict: "key" });

    if (error) {
      console.warn("[admin-live] settings upsert skipped:", key, error.message);
    }
  } catch (error) {
    console.warn("[admin-live] settings upsert failed:", key, error);
  }
}

export async function startAdminLiveBroadcast(input: StartBroadcastInput) {
  const title = input.title.trim();
  const youtubeUrl = String(input.youtubeUrl || "").trim();

  if (!title) {
    throw new Error("방송 제목을 입력해주세요.");
  }

  const nowIso = new Date().toISOString();

  const { error: closeError } = await adminCatalogWrite({
    table: "broadcasts",
    op: "update",
    values: { status: "OFF", ended_at: nowIso },
    filters: [{ type: "eq", col: "status", val: "ON" }],
  });

  if (closeError) throw closeError;

  const payload = {
    public_title: title,
    admin_subtitle: "",
    status: "ON",
    started_at: nowIso,
    ended_at: null,
    shipping_fee: 4000,
    youtube_live_url: youtubeUrl,
    youtube_live_enabled: Boolean(youtubeUrl),
    order_form_enabled: true,
    is_deleted: false,
  };

  const { data, error } = await adminCatalogWrite({
    table: "broadcasts",
    op: "insert",
    values: payload,
    select: "*",
    single: true,
  });

  if (error) throw error;

  await safeUpsertSetting("broadcast_status", "ON");
  await safeUpsertSetting("current_broadcast_name", title);

  return data as AdminLiveBroadcast;
}

// 준비된 OFF 방송을 켠다. 새 row를 만들지 않고 해당 id를 ON으로 UPDATE.
// 기존 ON은 OFF 처리. youtube_live_url/정산·수수료 컬럼은 건드리지 않는다(껍데기가 보유한 값 유지).
export async function activateBroadcast(broadcastId: string) {
  if (!broadcastId) {
    throw new Error("켤 방송 ID가 없습니다.");
  }

  const nowIso = new Date().toISOString();

  const { error: closeError } = await adminCatalogWrite({
    table: "broadcasts",
    op: "update",
    values: { status: "OFF", ended_at: nowIso },
    filters: [{ type: "eq", col: "status", val: "ON" }],
  });

  if (closeError) throw closeError;

  const { data, error } = await adminCatalogWrite({
    table: "broadcasts",
    op: "update",
    values: { status: "ON", started_at: nowIso },
    filters: [{ type: "eq", col: "id", val: broadcastId }],
    select: "*",
    single: true,
  });

  if (error) throw error;

  await safeUpsertSetting("broadcast_status", "ON");
  await safeUpsertSetting("current_broadcast_name", String(data?.public_title || ""));

  return data as AdminLiveBroadcast;
}

// 방송 껍데기 미리 만들기(켜지 않음). status:"OFF"로 insert만 — 기존 ON 방송은 절대 안 건드린다.
// settings(broadcast_status/current_broadcast_name)도 안 바꾼다(현재 방송 상태 유지). 정산/수수료 컬럼은 default 그대로.
export async function createDraftBroadcast(title: string) {
  const cleanTitle = String(title || "").trim();

  if (!cleanTitle) {
    throw new Error("방송 제목을 입력해주세요.");
  }

  const payload = {
    public_title: cleanTitle,
    admin_subtitle: "",
    status: "OFF",
    started_at: null,
    ended_at: null,
    shipping_fee: 4000,
    youtube_live_url: "",
    youtube_live_enabled: false,
    order_form_enabled: true,
    is_deleted: false,
  };

  const { data, error } = await adminCatalogWrite({
    table: "broadcasts",
    op: "insert",
    values: payload,
    select: "*",
    single: true,
  });

  if (error) throw error;

  return data as AdminLiveBroadcast;
}

export async function updateAdminLiveBroadcast(input: UpdateBroadcastInput) {
  const title = input.title.trim();
  const youtubeUrl = String(input.youtubeUrl || "").trim();

  if (!input.broadcastId) {
    throw new Error("수정할 방송 ID가 없습니다.");
  }

  if (!title) {
    throw new Error("방송 제목을 입력해주세요.");
  }

  const { data, error } = await adminCatalogWrite({
    table: "broadcasts",
    op: "update",
    values: {
      public_title: title,
      youtube_live_url: youtubeUrl,
      youtube_live_enabled: Boolean(youtubeUrl),
    },
    filters: [{ type: "eq", col: "id", val: input.broadcastId }],
    select: "*",
    single: true,
  });

  if (error) throw error;

  await safeUpsertSetting("current_broadcast_name", title);

  return data as AdminLiveBroadcast;
}

// [2026-07-12 사장님 지침] 위젯 상품카드 ON/OFF — 방송 중 위젯의 상품카드만 숨기고 싶을 때.
//   broadcasts.widget_card_enabled 한 컬럼만 갱신. 방송 상태·정산/주문/돈 로직 무접촉.
export async function setBroadcastWidgetCard(broadcastId: string, enabled: boolean) {
  if (!broadcastId) {
    throw new Error("방송 ID가 없습니다.");
  }

  const { data, error } = await adminCatalogWrite({
    table: "broadcasts",
    op: "update",
    values: { widget_card_enabled: enabled },
    filters: [{ type: "eq", col: "id", val: broadcastId }],
    select: "*",
    single: true,
  });

  if (error) throw error;

  return data as AdminLiveBroadcast;
}

export async function endAdminLiveBroadcast(broadcastId: string) {
  if (!broadcastId) {
    throw new Error("종료할 방송 ID가 없습니다.");
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await adminCatalogWrite({
    table: "broadcasts",
    op: "update",
    values: { status: "OFF", ended_at: nowIso, order_form_enabled: false },
    filters: [{ type: "eq", col: "id", val: broadcastId }],
    select: "*",
    single: true,
  });

  if (error) throw error;

  await safeUpsertSetting("broadcast_status", "OFF");
  await safeUpsertSetting("current_broadcast_name", "");

  return data as AdminLiveBroadcast;
}

// 쇼핑몰 열기/닫기 — settings.shop_open 영속(기존 safeUpsertSetting 재사용). 다른 키 안 건드림.
export async function setShopOpen(open: boolean) {
  await safeUpsertSetting("shop_open", open ? "true" : "false");
}

// settings.shop_open 읽기 — 값이 "false"면 닫힘(false), 그 외(없음 포함)는 열림(true) 기본값.
export async function getShopOpen(): Promise<boolean> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "shop_open")
    .maybeSingle();

  if (error) return true; // 조회 실패 시 기본 열림(쇼핑몰 사고 방지)

  return String(data?.value ?? "").trim().toLowerCase() !== "false";
}

export function formatBroadcastTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isOrderInsideBroadcastTime(orderCreatedAt: string | null | undefined, broadcast: AdminLiveBroadcast | null) {
  if (!orderCreatedAt || !broadcast?.started_at) return false;

  const orderTime = new Date(orderCreatedAt).getTime();
  const startTime = new Date(broadcast.started_at).getTime();
  const endTime = broadcast.ended_at ? new Date(broadcast.ended_at).getTime() : Date.now();

  if (!Number.isFinite(orderTime) || !Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return false;
  }

  return orderTime >= startTime && orderTime <= endTime;
}
