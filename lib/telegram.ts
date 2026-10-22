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

// chat_id 칸에 여러 명을 쉼표/줄바꿈/공백으로 넣을 수 있음 → 같은 메시지를 모두에게 발송.
//   같이 운영하는 다른 관리자도 그 봇에 /start 하고, 그 사람 chat id 를 여기 추가하면 동일 알림 수신.
export function parseChatIds(raw: string): string[] {
  return Array.from(
    new Set(
      String(raw || "")
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

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

// "방송 종료 시 결산 자동 발송" 토글 — settings 테이블(키/값). 비밀 아님이라 여기 둠. 기본 켜짐.
const SETTING_REPORT_ON_END = "telegram_report_on_end";
export async function readReportOnEnd(): Promise<boolean> {
  const sb = getServiceClient();
  const { data } = await sb.from("settings").select("value").eq("key", SETTING_REPORT_ON_END).maybeSingle();
  if (!data) return true;
  return String((data as any).value ?? "").trim() !== "false";
}
export async function writeReportOnEnd(on: boolean): Promise<void> {
  const sb = getServiceClient();
  const value = on ? "true" : "false";
  const { data: existing } = await sb.from("settings").select("key").eq("key", SETTING_REPORT_ON_END).limit(1);
  if (Array.isArray(existing) && existing.length > 0) {
    await sb.from("settings").update({ value }).eq("key", SETTING_REPORT_ON_END);
  } else {
    await sb.from("settings").insert({ key: SETTING_REPORT_ON_END, value });
  }
}

/** 토큰 모양(숫자:영문숫자) — 공백·따옴표·「bot」 접두어 등 흔한 실수 잡기 */
export function telegramTokenFormatIssue(token: string): string {
  const t = String(token ?? "");
  if (!t.trim()) return "토큰이 비어 있어요";
  if (/\s/.test(t.trim())) return "토큰 안에 공백·줄바꿈이 섞였어요(한 줄로 붙여넣기)";
  if (/^bot/i.test(t.trim())) return "앞의 「bot」 글자는 빼고 숫자부터 넣어주세요";
  if (!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(t.trim())) return "토큰 모양이 달라요(예: 7123456789:AAH… — BotFather 「API Token」 그대로)";
  return "";
}

/** 토큰 힌트(비밀 아님 — 콜론 앞 봇 번호만) */
export function telegramTokenHint(token: string): string {
  const head = String(token ?? "").trim().split(":")[0] || "";
  return head ? `봇 번호 ${head}` : "";
}

/** 텔레그램 getMe 로 토큰 실제 확인 — 봇 이름 돌려줌. 404 Not Found = 토큰이 틀리거나 BotFather 에서 바뀜. */
export async function checkTelegramBotToken(token: string): Promise<{ ok: boolean; botName?: string; reason?: string }> {
  const formatIssue = telegramTokenFormatIssue(token);
  if (formatIssue) return { ok: false, reason: formatIssue };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token.trim()}/getMe`);
    const j: any = await res.json().catch(() => ({}));
    if (res.ok && j?.ok) return { ok: true, botName: String(j.result?.username ? `@${j.result.username}` : j.result?.first_name || "") };
    const d = String(j?.description || `HTTP ${res.status}`);
    return { ok: false, reason: /Not Found|Unauthorized/i.test(d) ? `텔레그램이 이 토큰을 모릅니다(${telegramTokenHint(token)}) — BotFather 에서 Revoke 됐거나 다른 봇 토큰이에요. /mybots › API Token 을 다시 복사하세요` : d };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

export async function getTelegramStatus(): Promise<{ connected: boolean; enabled: boolean; chatIdSet: boolean; recipientCount: number; tokenHint: string; tokenFormatIssue: string }> {
  const cfg = await readTelegramConfig();
  const ids = parseChatIds(cfg.chatId);
  return { connected: !!cfg.botToken && ids.length > 0, enabled: cfg.enabled, chatIdSet: ids.length > 0, recipientCount: ids.length, tokenHint: telegramTokenHint(cfg.botToken), tokenFormatIssue: cfg.botToken ? telegramTokenFormatIssue(cfg.botToken) : "" };
}

// 봇에 /start(또는 아무 메시지) 보낸 기록(getUpdates)에서 실제 chat id를 읽어와 저장한다.
//   → 수동으로 chat id 넣다가 틀리는 걸 없앰("chat not found" 방지). 추정 아님 — 텔레그램 실제 응답 기준.
export async function detectChatIdFromUpdates(): Promise<{
  ok: boolean;
  chatId?: string;
  name?: string;
  candidates?: { id: string; name: string }[];
  reason?: string;
  tokenInvalid?: boolean;
}> {
  let cfg: TelegramConfig;
  try {
    cfg = await readTelegramConfig();
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
  if (!cfg.botToken) return { ok: false, reason: "봇 토큰을 먼저 저장하세요." };
  // [2026-10-23] 토큰부터 확인(getMe) — 토큰이 틀리면 /start 를 아무리 보내도 소용없으니 그걸 먼저 알린다
  const tokenCheck = await checkTelegramBotToken(cfg.botToken);
  if (!tokenCheck.ok) return { ok: false, reason: tokenCheck.reason, tokenInvalid: true } as any;

  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/getUpdates`);
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || !j?.ok) {
      const d = String(j?.description || `HTTP ${res.status}`);
      // 웹훅이 걸려 있으면 getUpdates가 막힘 — 안내
      return { ok: false, reason: d.includes("webhook") ? "봇에 웹훅이 설정돼 있어 자동탐지가 막혔어요(보통 없음)." : explainTelegramError(d) };
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
    // 기존 수신자에 "덧붙이기"(덮어쓰기 X) — 여러 관리자가 각자 /start 후 추가되도록.
    const merged = Array.from(new Set([...parseChatIds(cfg.chatId), lastId]));
    await saveTelegramConfig({ chatId: merged.join(",") });
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

// [2026-10-22 실측] 모든 수신자가 「Not Found」 = 봇 토큰이 틀렸거나 BotFather 에서 바뀐 것(텔레그램이 404) —
//   사장님이 바로 알 수 있게 한국어로. 그 외 메시지는 그대로.
export function explainTelegramError(raw: string): string {
  const text = String(raw || "");
  if (!text) return "";
  if (/Not Found/i.test(text) && !/chat not found/i.test(text)) return "봇 토큰이 맞지 않아요 — 설정 › 방송·알림 › 텔레그램에서 BotFather 토큰을 다시 저장하세요";
  if (/chat not found/i.test(text)) return "받는 사람(chat id)을 찾지 못했어요 — 봇에 /start 를 보낸 뒤 「자동 탐지」를 눌러주세요";
  if (/can't parse entities/i.test(text)) return "문구에 특수문자가 있어 텔레그램이 거부했어요(다시 시도)";
  return text;
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
  const ids = parseChatIds(cfg.chatId);
  if (!cfg.botToken || ids.length === 0) return { ok: false, skipped: true, reason: "봇 토큰/chat id 미설정" };
  if (!cfg.enabled && !opts?.forceEvenIfDisabled) return { ok: false, skipped: true, reason: "알림 꺼짐" };

  // 등록된 모든 관리자(chat id)에게 같은 메시지 발송. 한 명이라도 성공하면 ok.
  let anyOk = false;
  const errs: string[] = [];
  for (const id of ids) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: id,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && (j as any)?.ok) anyOk = true;
      else errs.push(`${id}: ${(j as any)?.description || `HTTP ${res.status}`}`);
    } catch (e: any) {
      errs.push(`${id}: ${String(e?.message || e)}`);
    }
  }
  if (anyOk) return { ok: true, reason: errs.length ? `일부 실패: ${errs.join("; ")}` : undefined };
  return { ok: false, reason: explainTelegramError(errs.join("; ")) || "발송 실패" };
}
