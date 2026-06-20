import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 텔레그램 알림 — 봇 토큰/대상 chat_id는 비밀값이라 서버전용 테이블(telegram_integration)에 보관.
//   service_role 키로만 접근(RLS로 anon 차단). youtube_integration 과 동일한 방식.

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type TelegramConfig = { botToken: string; chatId: string; enabled: boolean };

export async function readTelegramConfig(): Promise<TelegramConfig> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("telegram_integration")
    .select("bot_token, chat_id, enabled")
    .eq("id", 1)
    .limit(1)
    .maybeSingle();
  return {
    botToken: data ? String((data as any).bot_token ?? "").trim() : "",
    chatId: data ? String((data as any).chat_id ?? "").trim() : "",
    enabled: data ? (data as any).enabled !== false : true,
  };
}

export async function saveTelegramConfig(input: {
  botToken?: string;
  chatId?: string;
  enabled?: boolean;
}): Promise<void> {
  const sb = getServiceClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.botToken === "string") patch.bot_token = input.botToken.trim();
  if (typeof input.chatId === "string") patch.chat_id = input.chatId.trim();
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;

  const { data: existing } = await sb.from("telegram_integration").select("id").eq("id", 1).limit(1);
  if (Array.isArray(existing) && existing.length > 0) {
    await sb.from("telegram_integration").update(patch).eq("id", 1);
  } else {
    await sb.from("telegram_integration").insert({ id: 1, ...patch });
  }
}

export async function getTelegramStatus(): Promise<{ connected: boolean; enabled: boolean; chatIdSet: boolean }> {
  const cfg = await readTelegramConfig();
  return { connected: !!cfg.botToken && !!cfg.chatId, enabled: cfg.enabled, chatIdSet: !!cfg.chatId };
}

// 봇에 /start(또는 아무 메시지) 보낸 기록(getUpdates)에서 실제 chat id를 읽어와 저장한다.
//   → 수동으로 chat id 넣다가 틀리는 걸 없앰("chat not found" 방지). 추정 아님 — 텔레그램 실제 응답 기준.
export async function detectChatIdFromUpdates(): Promise<{
  ok: boolean;
  chatId?: string;
  name?: string;
  candidates?: { id: string; name: string }[];
  reason?: string;
}> {
  let cfg: TelegramConfig;
  try {
    cfg = await readTelegramConfig();
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
  if (!cfg.botToken) return { ok: false, reason: "봇 토큰을 먼저 저장하세요." };

  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/getUpdates`);
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || !j?.ok) {
      const d = String(j?.description || `HTTP ${res.status}`);
      // 웹훅이 걸려 있으면 getUpdates가 막힘 — 안내
      return { ok: false, reason: d.includes("webhook") ? "봇에 웹훅이 설정돼 있어 자동탐지가 막혔어요(보통 없음)." : d };
    }
    const updates: any[] = Array.isArray(j.result) ? j.result : [];
    const chats = new Map<string, string>();
    for (const u of updates) {
      const chat = u?.message?.chat || u?.edited_message?.chat || u?.my_chat_member?.chat || u?.channel_post?.chat;
      if (chat && chat.id != null) {
        const name =
          [chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
          chat.username ||
          chat.title ||
          "";
        chats.set(String(chat.id), name);
      }
    }
    if (chats.size === 0) {
      return { ok: false, reason: "봇에게 받은 메시지가 없어요. 그 봇 채팅을 열고 /start(또는 아무 메시지)를 먼저 보낸 뒤 다시 누르세요." };
    }
    const entries = [...chats.entries()];
    const [lastId, lastName] = entries[entries.length - 1]; // 가장 최근에 말 건 사람
    await saveTelegramConfig({ chatId: lastId });
    return {
      ok: true,
      chatId: lastId,
      name: lastName,
      candidates: entries.map(([id, name]) => ({ id, name })),
    };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

// 메시지 발송. 실패해도 throw 하지 않음({ok:false}). 설정 없거나 꺼져있으면 skip.
export async function sendTelegram(
  text: string,
  opts?: { forceEvenIfDisabled?: boolean },
): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  let cfg: TelegramConfig;
  try {
    cfg = await readTelegramConfig();
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
  if (!cfg.botToken || !cfg.chatId) return { ok: false, skipped: true, reason: "봇 토큰/chat id 미설정" };
  if (!cfg.enabled && !opts?.forceEvenIfDisabled) return { ok: false, skipped: true, reason: "알림 꺼짐" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !(j as any)?.ok) return { ok: false, reason: (j as any)?.description || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
}
