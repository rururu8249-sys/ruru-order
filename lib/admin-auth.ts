import type { NextRequest } from "next/server";

export const ADMIN_SESSION_COOKIE_NAME = "ruru_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const ADMIN_SESSION_REMEMBER_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type AdminSessionPayload = {
  sub: string;
  role: "admin";
  iat: number;
  exp: number;
};

const encoder = new TextEncoder();

function getEnvValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

export function getAdminAuthConfig() {
  return {
    loginId: getEnvValue("RURU_ADMIN_ID", "ADMIN_LOGIN_ID", "ADMIN_ID", "ADMIN_USERNAME"),
    password: getEnvValue("RURU_ADMIN_PASSWORD", "ADMIN_LOGIN_PASSWORD", "ADMIN_PASSWORD"),
    passwordSha256: getEnvValue("RURU_ADMIN_PASSWORD_SHA256", "ADMIN_PASSWORD_SHA256"),
    sessionSecret: getEnvValue("ADMIN_SESSION_SECRET", "RURU_ADMIN_SESSION_SECRET", "AUTH_SECRET", "NEXTAUTH_SECRET"),
  };
}

export function isAdminAuthConfigured() {
  const config = getAdminAuthConfig();
  return Boolean(config.loginId && (config.password || config.passwordSha256) && config.sessionSecret);
}

function bytesToBase64Url(buffer: ArrayBuffer) {
  const nodeBuffer = (globalThis as unknown as { Buffer?: any }).Buffer;
  if (nodeBuffer) return nodeBuffer.from(buffer).toString("base64url");

  let binary = "";
  new Uint8Array(buffer).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const nodeBuffer = (globalThis as unknown as { Buffer?: any }).Buffer;
  if (nodeBuffer) return nodeBuffer.from(value, "base64url");

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function getHmacKey() {
  const secret = getAdminAuthConfig().sessionSecret;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is required.");

  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signValue(value: string) {
  const key = await getHmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(signature);
}

async function verifySignature(value: string, signature: string) {
  try {
    const key = await getHmacKey();
    return crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), encoder.encode(value));
  } catch {
    return false;
  }
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function secureStringEqual(left: string, right: string) {
  return (await sha256Hex(left)) === (await sha256Hex(right));
}

export async function verifyAdminCredentials(loginId: string, password: string) {
  const config = getAdminAuthConfig();

  if (!isAdminAuthConfigured()) {
    return { ok: false as const, reason: "AUTH_NOT_CONFIGURED" as const };
  }

  const idOk = await secureStringEqual(loginId, config.loginId);
  if (!idOk) return { ok: false as const, reason: "INVALID_CREDENTIALS" as const };

  if (config.passwordSha256) {
    const inputHash = await sha256Hex(password);
    const passwordOk = await secureStringEqual(inputHash, config.passwordSha256);
    return passwordOk
      ? { ok: true as const }
      : { ok: false as const, reason: "INVALID_CREDENTIALS" as const };
  }

  const passwordOk = await secureStringEqual(password, config.password);
  return passwordOk
    ? { ok: true as const }
    : { ok: false as const, reason: "INVALID_CREDENTIALS" as const };
}

export async function createAdminSession(loginId: string, maxAgeSeconds = ADMIN_SESSION_MAX_AGE_SECONDS) {
  const now = Date.now();
  const payload: AdminSessionPayload = {
    sub: loginId,
    role: "admin",
    iat: now,
    exp: now + maxAgeSeconds * 1000,
  };

  const encodedPayload = encodeURIComponent(JSON.stringify(payload));
  const signature = await signValue(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export async function verifyAdminSessionToken(token: string | undefined | null) {
  if (!token) return null;

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) return null;

  const signatureOk = await verifySignature(encodedPayload, signature);
  if (!signatureOk) return null;

  try {
    const payload = JSON.parse(decodeURIComponent(encodedPayload)) as AdminSessionPayload;

    if (payload.role !== "admin") return null;
    if (!payload.sub) return null;
    if (!payload.exp || payload.exp < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

export async function verifyAdminSessionFromRequest(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  return verifyAdminSessionToken(token);
}

export function getAdminSessionCookieOptions(maxAgeSeconds = ADMIN_SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function getAdminSessionClearCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
