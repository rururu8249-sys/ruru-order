import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE_NAME = "ruru_admin_session";

const DEFAULT_ADMIN_USERNAME = "ruru";
const SETTINGS_TABLE_NAME = "settings";
const ADMIN_USERNAME_KEY = "admin_username";
const ADMIN_PASSWORD_HASH_KEY = "admin_password_hash";
const ADMIN_PASSWORD_SALT_KEY = "admin_password_salt";
const ADMIN_PASSWORD_ITERATIONS_KEY = "admin_password_iterations";
const ADMIN_AUTH_UPDATED_AT_KEY = "admin_auth_updated_at";

const DEFAULT_ITERATIONS = 120_000;
const HASH_LENGTH = 32;
const DIGEST = "sha256";

type SettingsMap = Record<string, string>;

type AdminAuthCheck = {
  ok: boolean;
  hasExpectedToken: boolean;
  hasSessionCookie: boolean;
};

function cleanText(value: unknown): string {
  return String(value || "").trim();
}

function getFallbackUsername(): string {
  return cleanText(process.env.ADMIN_USERNAME) || DEFAULT_ADMIN_USERNAME;
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role 환경변수가 없습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function safeTextEqual(a: string, b: string): boolean {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex"),
  iterations = DEFAULT_ITERATIONS,
) {
  const hash = pbkdf2Sync(password, salt, iterations, HASH_LENGTH, DIGEST).toString("hex");

  return {
    hash,
    salt,
    iterations,
  };
}

function verifyPassword(password: string, hash: string, salt: string, iterations: number): boolean {
  const next = hashPassword(password, salt, iterations).hash;
  return safeTextEqual(next, hash);
}

async function readAdminSettings(): Promise<SettingsMap> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from(SETTINGS_TABLE_NAME)
      .select("key,value")
      .in("key", [
        ADMIN_USERNAME_KEY,
        ADMIN_PASSWORD_HASH_KEY,
        ADMIN_PASSWORD_SALT_KEY,
        ADMIN_PASSWORD_ITERATIONS_KEY,
        ADMIN_AUTH_UPDATED_AT_KEY,
      ]);

    if (error || !Array.isArray(data)) {
      return {};
    }

    return data.reduce((acc: SettingsMap, row: any) => {
      const key = cleanText(row?.key);
      if (key) acc[key] = cleanText(row?.value);
      return acc;
    }, {});
  } catch {
    return {};
  }
}

export async function getCurrentAdminAuthStatus() {
  const settings = await readAdminSettings();

  const customUsername = cleanText(settings[ADMIN_USERNAME_KEY]);
  const hasCustomPassword = Boolean(
    settings[ADMIN_PASSWORD_HASH_KEY] &&
      settings[ADMIN_PASSWORD_SALT_KEY] &&
      settings[ADMIN_PASSWORD_ITERATIONS_KEY],
  );

  return {
    username: customUsername || getFallbackUsername(),
    usingCustomCredentials: hasCustomPassword,
    updatedAt: cleanText(settings[ADMIN_AUTH_UPDATED_AT_KEY]),
  };
}

export async function verifyAdminLogin(username: unknown, password: unknown): Promise<boolean> {
  const inputUsername = cleanText(username);
  const inputPassword = String(password || "");

  if (!inputUsername || !inputPassword) return false;

  const settings = await readAdminSettings();

  const customUsername = cleanText(settings[ADMIN_USERNAME_KEY]);
  const customHash = cleanText(settings[ADMIN_PASSWORD_HASH_KEY]);
  const customSalt = cleanText(settings[ADMIN_PASSWORD_SALT_KEY]);
  const customIterations = Number(settings[ADMIN_PASSWORD_ITERATIONS_KEY] || 0);

  if (customHash && customSalt && customIterations > 0) {
    if (!customUsername || !safeTextEqual(inputUsername, customUsername)) {
      return false;
    }

    return verifyPassword(inputPassword, customHash, customSalt, customIterations);
  }

  const envPassword = String(process.env.ADMIN_PASSWORD || "");
  const fallbackUsername = getFallbackUsername();

  if (!envPassword) return false;

  if (!safeTextEqual(inputUsername, fallbackUsername)) {
    return false;
  }

  return safeTextEqual(inputPassword, envPassword);
}

export function assertAdminRequest(request: NextRequest): AdminAuthCheck {
  const expectedToken = process.env.ADMIN_SESSION_TOKEN;
  const sessionToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;

  return {
    ok: Boolean(expectedToken && sessionToken === expectedToken),
    hasExpectedToken: Boolean(expectedToken),
    hasSessionCookie: Boolean(sessionToken),
  };
}

export function adminAuthErrorMessage(auth: AdminAuthCheck): string {
  if (!auth.hasExpectedToken) {
    return "관리자 인증 환경변수가 없습니다. Vercel ADMIN_SESSION_TOKEN을 확인해주세요.";
  }

  if (!auth.hasSessionCookie) {
    return "관리자 로그인 쿠키가 없습니다. /admin-login에서 다시 로그인 후 새로고침해주세요.";
  }

  return "관리자 로그인 정보가 일치하지 않습니다. /admin-login에서 다시 로그인 후 새로고침해주세요.";
}

export function setAdminSessionCookie(response: NextResponse, remember = false) {
  const sessionToken = process.env.ADMIN_SESSION_TOKEN;

  if (!sessionToken) {
    throw new Error("ADMIN_SESSION_TOKEN 환경변수가 없습니다.");
  }

  response.cookies.set(ADMIN_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12,
  });

  return response;
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

async function saveSettingRows(rows: { key: string; value: string }[]) {
  const supabase = getSupabaseAdmin();

  for (const row of rows) {
    const { data: existing, error: selectError } = await supabase
      .from(SETTINGS_TABLE_NAME)
      .select("key")
      .eq("key", row.key)
      .limit(1);

    if (selectError) {
      throw new Error("관리자 보안 설정 조회 실패: " + selectError.message);
    }

    if (Array.isArray(existing) && existing.length > 0) {
      const { error: updateError } = await supabase
        .from(SETTINGS_TABLE_NAME)
        .update({ value: row.value })
        .eq("key", row.key);

      if (updateError) {
        throw new Error("관리자 보안 설정 수정 실패: " + updateError.message);
      }
    } else {
      const { error: insertError } = await supabase
        .from(SETTINGS_TABLE_NAME)
        .insert(row);

      if (insertError) {
        throw new Error("관리자 보안 설정 저장 실패: " + insertError.message);
      }
    }
  }
}

export async function updateAdminCredentials({
  currentUsername,
  currentPassword,
  nextUsername,
  nextPassword,
}: {
  currentUsername: string;
  currentPassword: string;
  nextUsername: string;
  nextPassword: string;
}) {
  const cleanCurrentUsername = cleanText(currentUsername);
  const cleanNextUsername = cleanText(nextUsername);
  const cleanNextPassword = String(nextPassword || "");

  if (!cleanNextUsername) {
    throw new Error("새 아이디를 입력해주세요.");
  }

  if (cleanNextUsername.length < 3 || cleanNextUsername.length > 40) {
    throw new Error("아이디는 3~40자로 입력해주세요.");
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(cleanNextUsername)) {
    throw new Error("아이디는 영문, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.");
  }

  if (cleanNextPassword.length < 8) {
    throw new Error("새 비밀번호는 8자 이상 입력해주세요.");
  }

  const currentOk = await verifyAdminLogin(cleanCurrentUsername, currentPassword);

  if (!currentOk) {
    throw new Error("현재 아이디 또는 현재 비밀번호가 올바르지 않습니다.");
  }

  const hashed = hashPassword(cleanNextPassword);

  await saveSettingRows([
    { key: ADMIN_USERNAME_KEY, value: cleanNextUsername },
    { key: ADMIN_PASSWORD_HASH_KEY, value: hashed.hash },
    { key: ADMIN_PASSWORD_SALT_KEY, value: hashed.salt },
    { key: ADMIN_PASSWORD_ITERATIONS_KEY, value: String(hashed.iterations) },
    { key: ADMIN_AUTH_UPDATED_AT_KEY, value: new Date().toISOString() },
  ]);

  return {
    username: cleanNextUsername,
  };
}
