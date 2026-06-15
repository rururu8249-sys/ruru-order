import { supabase } from "@/lib/supabase";

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

  const { error: closeError } = await supabase
    .from("broadcasts")
    .update({
      status: "OFF",
      ended_at: nowIso,
    })
    .eq("status", "ON");

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

  const { data, error } = await supabase
    .from("broadcasts")
    .insert(payload)
    .select("*")
    .single();

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

  const { error: closeError } = await supabase
    .from("broadcasts")
    .update({
      status: "OFF",
      ended_at: nowIso,
    })
    .eq("status", "ON");

  if (closeError) throw closeError;

  const { data, error } = await supabase
    .from("broadcasts")
    .update({
      status: "ON",
      started_at: nowIso,
    })
    .eq("id", broadcastId)
    .select("*")
    .single();

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

  const { data, error } = await supabase
    .from("broadcasts")
    .insert(payload)
    .select("*")
    .single();

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

  const { data, error } = await supabase
    .from("broadcasts")
    .update({
      public_title: title,
      youtube_live_url: youtubeUrl,
      youtube_live_enabled: Boolean(youtubeUrl),
    })
    .eq("id", input.broadcastId)
    .select("*")
    .single();

  if (error) throw error;

  await safeUpsertSetting("current_broadcast_name", title);

  return data as AdminLiveBroadcast;
}

export async function endAdminLiveBroadcast(broadcastId: string) {
  if (!broadcastId) {
    throw new Error("종료할 방송 ID가 없습니다.");
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("broadcasts")
    .update({
      status: "OFF",
      ended_at: nowIso,
      order_form_enabled: false,
    })
    .eq("id", broadcastId)
    .select("*")
    .single();

  if (error) throw error;

  await safeUpsertSetting("broadcast_status", "OFF");
  await safeUpsertSetting("current_broadcast_name", "");

  return data as AdminLiveBroadcast;
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
