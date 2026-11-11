import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminAuthConfig } from "@/lib/admin-auth";
import { LIVE_WATCH_KEY, isChatOwnerPhone, parseLiveWatchSetting } from "@/lib/liveWatch";

export const CHAT_SESSION_COOKIE = "ruru_chat_identity";
export const CHAT_STATE_COOKIE = "ruru_chat_oauth_state";
export const CHAT_SESSION_AGE = 60 * 60 * 24 * 7;
type ChatIdentity = { sub: string; phone: string; nonce: string; exp: number; aud: "ruru-chat-v1" };
export function chatCookieOptions(maxAge = CHAT_SESSION_AGE) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}
function signature(value: string) {
  const secret = getAdminAuthConfig().sessionSecret;
  if (!secret) throw new Error("Chat signing is not configured");
  return createHmac("sha256", secret).update(`ruru-chat-v1:${value}`).digest("base64url");
}
export function signChatIdentity(identity: Pick<ChatIdentity, "sub" | "phone" | "nonce">, age = CHAT_SESSION_AGE) {
  const payload = Buffer.from(JSON.stringify({ ...identity, aud: "ruru-chat-v1", exp: Date.now() + age * 1000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifyChatIdentity(token: string | undefined): ChatIdentity | null {
  try {
    const [body, mac, extra] = (token || "").split(".");
    if (!body || !mac || extra) return null;
    const expected = Buffer.from(signature(body));
    const actual = Buffer.from(mac);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as ChatIdentity;
    return p.aud === "ruru-chat-v1" && /^\d+$/.test(p.sub) && typeof p.phone === "string" && typeof p.nonce === "string" && p.nonce && Number.isFinite(p.exp) && p.exp > Date.now() ? p : null;
  } catch { return null; }
}
export function chatIdentityFromRequest(request: NextRequest) {
  const p = verifyChatIdentity(request.cookies.get(CHAT_SESSION_COOKIE)?.value);
  // The client claim can only narrow a verified identity, never authorize another account.
  return p && request.headers.get("x-chat-account") === p.sub && request.headers.get("x-chat-session") === p.nonce ? p : null;
}
export function sameChatOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}
/** Provider-verified phone only. Never use editable customer profile phone for private originals. */
export async function verifiedChatRole(sb: SupabaseClient, identity: ChatIdentity | null) {
  if (!identity?.phone) return { isOwner: false, isMod: false };
  const [st, ops] = await Promise.all([
    sb.from("settings").select("value").eq("key", LIVE_WATCH_KEY).maybeSingle(),
    sb.from("operator_test_accounts").select("customer_phone").eq("is_active", true),
  ]);
  if (st.error || ops.error) throw new Error("Chat role unavailable");
  const setting = parseLiveWatchSetting(st.data?.value);
  const isOwner = isChatOwnerPhone(setting, identity.phone);
  return { isOwner, isMod: isOwner || setting.mods.includes(identity.phone) || (ops.data ?? []).some(o => String(o.customer_phone).replace(/\D/g, "") === identity.phone) };
}
